// ============================================================
// TheHiggs — AI-UI Co-Execution Runtime 入口页面
// ============================================================

"use client";

import { defaultConstraints } from "@/auir/constraints";
import { applyMemoryPatch, createInitialMemory } from "@/auir/memory";
import type {
  AUIREvent,
  AUIRMemory,
  AUIRRequest,
  AUIRResponse,
  AUIRState,
  LocalUIState,
} from "@/auir/types";
import AUIRInspector from "@/components/AUIRInspector";
import DebugPanel from "@/components/DebugPanel";
import ErrorPanel from "@/components/ErrorPanel";
import LoadingOverlay from "@/components/LoadingOverlay";
import SearchLauncher from "@/components/SearchLauncher";
import Shell from "@/components/Shell";
import { postRuntimeLog, sendAUIRRequest } from "@/runtime/client";
import type { PageLogContext } from "@/runtime/logging/types";
import Renderer, { AppContextProvider } from "@/runtime/Renderer";
import {
  createInitialLocalUIState,
  hydrateLocalStateFromAUIRState,
  setLocalValue as updateLocalValue,
} from "@/runtime/state";
import { useCallback, useRef, useState } from "react";

/** ref to always hold the latest memory (avoids stale closure in handleAIEvent) */
const memoryRef = { current: null as unknown as AUIRMemory };

/** Memory JSON 超过此字符数时触发异步压缩（~8KB ≈ 2,500 tokens） */
const MEMORY_COMPRESS_THRESHOLD = 8000;

/**
 * 异步压缩膨胀的 memory。
 * 在页面生成完成后 fire-and-forget 调用，不阻塞 UI。
 * 压缩成功后静默替换 memory 状态。
 */
async function compressMemoryIfNeeded(
  currentMemory: AUIRMemory,
  setMemory: React.Dispatch<React.SetStateAction<AUIRMemory>>,
): Promise<void> {
  const serialized = JSON.stringify(currentMemory);
  if (serialized.length < MEMORY_COMPRESS_THRESHOLD) return;

  console.log(
    `[compress-memory] Triggering: ${serialized.length} chars > ${MEMORY_COMPRESS_THRESHOLD} threshold`,
  );

  try {
    const res = await fetch("/api/compress-memory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        memory: currentMemory,
        currentSize: serialized.length,
      }),
    });

    if (!res.ok) {
      console.warn("[compress-memory] Server returned", res.status);
      return;
    }

    const data = await res.json();
    if (!data.ok || !data.compressed) {
      console.warn("[compress-memory] Compression failed:", data.error);
      return;
    }

    // Replace session/app memory with compressed version,
    // preserve turn and user layers.
    setMemory((prev) => ({
      ...prev,
      session: data.compressed.session ?? prev.session,
      app: data.compressed.app ?? prev.app,
    }));

    const newSize = JSON.stringify(data.compressed).length;
    console.log(
      `[compress-memory] Done: ${serialized.length} → ${newSize} chars (${Math.round((1 - newSize / serialized.length) * 100)}% reduction)`,
    );
  } catch (err) {
    // Non-critical: silently keep original memory
    console.warn("[compress-memory] Request failed:", err);
  }
}

export default function Home() {
  const [auirState, setAUIRState] = useState<AUIRState | null>(null);
  const [memory, setMemory] = useState<AUIRMemory>(() => createInitialMemory());
  // Keep ref in sync with state for handleAIEvent closure
  memoryRef.current = memory;
  const [localState, setLocalState] = useState<LocalUIState>(() =>
    createInitialLocalUIState(),
  );
  const [turn, setTurn] = useState(0);
  const sessionIdRef = useRef(
    `sess_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [diagnostics, setDiagnostics] = useState<
    Record<string, unknown> | undefined
  >(undefined);
  const [pageLogContext, setPageLogContext] = useState<PageLogContext | null>(
    null,
  );
  const lastEventRef = useRef<AUIREvent | null>(null);

  const isLauncher = !auirState || auirState.app.kind === "launcher";

  const handleSetLocalValue = useCallback(
    (
      binding: string,
      value: unknown,
      meta?: {
        componentId?: string;
        componentType?: string;
        label?: string;
        interactionMode?: string;
      },
    ) => {
      setLocalState((prev) => {
        const previousValue = prev.values[binding];
        const next = updateLocalValue(prev, binding, value);
        void postRuntimeLog(pageLogContext, {
          type: "frontend.local_state.changed",
          turn,
          stage: "frontend",
          status: "success",
          payload: {
            binding,
            previousValue,
            nextValue: value,
            ...(meta ? { component: meta } : {}),
          },
        });
        return next;
      });
    },
    [pageLogContext, turn],
  );

  const handleAIEvent = useCallback(
    async (event: AUIREvent, incomingPageLogContext?: PageLogContext) => {
      lastEventRef.current = event;
      setLoading(true);
      setError(null);
      const nextTurn = turn + 1;
      const activePageLogContext = incomingPageLogContext ?? pageLogContext;
      const requestPageLogContext = activePageLogContext
        ? { ...activePageLogContext, sessionId: sessionIdRef.current }
        : null;
      if (incomingPageLogContext) {
        setPageLogContext(requestPageLogContext);
      }
      // ── Search override: clear stale state for search-like events ──
      const isSearchEvent =
        event.type === "app.search" ||
        (event.type === "component.click" &&
          event.target?.intent === "perform_search");
      // Use ref to always read latest memory (avoids stale closure)
      const latestMemory = memoryRef.current;
      const effectiveMemory = isSearchEvent
        ? {
            ...latestMemory,
            session: {
              ...latestMemory.session,
              // Clear stale search context so AI doesn't create comparison panels
              comparisonMode: undefined,
              selectedEntry: undefined,
            },
            app: {
              ...latestMemory.app,
              // Clear stale image bindings so AI generates fresh image content
              imageBindings: undefined,
            },
          }
        : latestMemory;
      const request: AUIRRequest = {
        protocol: "AUIR",
        version: "0.3",
        session: {
          sessionId: sessionIdRef.current,
          appId: auirState?.app.id,
          turn: nextTurn,
          pageLogId: requestPageLogContext?.pageLogId,
          pageStartedAt: requestPageLogContext?.pageStartedAt,
          initialQuery: requestPageLogContext?.initialQuery,
        },
        previous: auirState,
        event,
        memory: effectiveMemory,
        constraints: defaultConstraints,
        availableTools: [],
      };
      try {
        await postRuntimeLog(requestPageLogContext, {
          type: "frontend.ai_event.dispatched",
          turn: nextTurn,
          stage: "frontend",
          status: "started",
          payload: { event, previousApp: auirState?.app ?? null },
        });
        const response: AUIRResponse = await sendAUIRRequest(request);
        setAUIRState(response.next);
        setTurn(nextTurn);
        // Compute next memory for size check (functional update handles batching)
        const patchedForCheck = response.memoryPatch
          ? applyMemoryPatch(latestMemory, response.memoryPatch)
          : latestMemory;
        const nextMemory: AUIRMemory = {
          ...patchedForCheck,
          ...(response.next?.memory
            ? {
                app: { ...patchedForCheck.app, ...response.next.memory.app },
                session: {
                  ...patchedForCheck.session,
                  ...response.next.memory.session,
                },
              }
            : {}),
          turn: { eventType: event.type, eventId: event.eventId },
        };
        setMemory(nextMemory);
        // Fire-and-forget: compress memory if it's too large
        void compressMemoryIfNeeded(nextMemory, setMemory);
        setLocalState(hydrateLocalStateFromAUIRState(response.next));
        if (response.diagnostics) {
          setDiagnostics(response.diagnostics as Record<string, unknown>);
        }
        if (response.diagnostics?.simulatedData) {
          console.info(
            "[TheHiggs] AI 使用示例数据生成界面（simulatedData=true）。如需真实数据，请启用搜索相关功能。",
          );
        }
        await postRuntimeLog(requestPageLogContext, {
          type: "frontend.ai_response.applied",
          turn: nextTurn,
          stage: "frontend",
          status: "success",
          payload: {
            nextApp: response.next.app,
            diagnostics: response.diagnostics,
          },
        });
        if (
          event.type === "runtime.command" &&
          event.command === "back_to_launcher"
        ) {
          await postRuntimeLog(requestPageLogContext, {
            type: "page.closed",
            turn: nextTurn,
            stage: "frontend",
            status: "success",
            payload: { reason: "back_to_launcher" },
          });
          // Clear all app-scoped state: memory, session ID, turn counter,
          // local state and diagnostics. This ensures the next app launched
          // from the launcher starts with a clean slate.
          sessionIdRef.current = `sess_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
          setMemory(createInitialMemory());
          setLocalState(createInitialLocalUIState());
          setTurn(0);
          setDiagnostics(undefined);
          setPageLogContext(null);
        }
        setError(null);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        setError(message);
        await postRuntimeLog(requestPageLogContext, {
          type: "frontend.ai_event.error",
          turn: nextTurn,
          stage: "frontend",
          status: "failure",
          payload: { event, error: message },
        });
        console.error("[Home] AI event error:", err);
      } finally {
        setLoading(false);
      }
    },
    [turn, auirState, pageLogContext, lastEventRef],
  );

  const handleRestart = useCallback(async () => {
    await postRuntimeLog(pageLogContext, {
      type: "page.closed",
      turn,
      stage: "frontend",
      status: "success",
      payload: { reason: "restart" },
    });
    sessionIdRef.current = `sess_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    setAUIRState(null);
    setMemory(createInitialMemory());
    setLocalState(createInitialLocalUIState());
    setTurn(0);
    setError(null);
    setDiagnostics(undefined);
    setPageLogContext(null);
    setLoading(false);
  }, [pageLogContext, turn]);

  const handleRetry = useCallback(async () => {
    if (lastEventRef.current) {
      await handleAIEvent(lastEventRef.current);
    } else {
      await handleRestart();
    }
  }, [handleAIEvent, handleRestart, lastEventRef]);

  /** 计算 memory 序列化大小（bytes） */
  const memorySize = JSON.stringify(memory).length;

  /** 返回 Launcher 的事件构造器 */
  const handleBackToLauncher = useCallback(() => {
    void handleAIEvent({
      eventId: `evt_restart_${Date.now()}`,
      timestamp: new Date().toISOString(),
      type: "runtime.command",
      command: "back_to_launcher",
    });
  }, [handleAIEvent]);

  return (
    <Shell
      runtimeState={{
        isLauncher,
        appTitle: auirState?.app.title,
        appDescription: auirState?.app.description,
        turn,
        sessionId: sessionIdRef.current,
        loading,
        memorySize,
        simulatedData: diagnostics?.simulatedData === true,
        diagnostics,
        onBackToLauncher: handleBackToLauncher,
      }}
    >
      {loading && <LoadingOverlay />}

      {isLauncher ? (
        <SearchLauncher onSearch={handleAIEvent} disabled={loading} />
      ) : (
        <div className="p-6">
          <AppContextProvider
            appId={auirState?.app.id}
            appTitle={auirState?.app.title}
            appKind={auirState?.app.kind}
          >
            <Renderer
              node={auirState!.ui}
              localState={localState}
              setLocalValue={handleSetLocalValue}
              onAIEvent={handleAIEvent}
            />
          </AppContextProvider>
        </div>
      )}

      {error && <ErrorPanel message={error} onRetry={handleRetry} />}

      <DebugPanel
        state={auirState}
        memory={memory}
        localState={localState}
        turn={turn}
        loading={loading}
        diagnostics={diagnostics}
      />
      <AUIRInspector state={auirState} />
    </Shell>
  );
}
