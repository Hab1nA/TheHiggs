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
import { postRuntimeLog, sendAUIRRequest } from "@/runtime/client";
import type { PageLogContext } from "@/runtime/logging/types";
import Renderer, { AppContextProvider } from "@/runtime/Renderer";
import {
  createInitialLocalUIState,
  hydrateLocalStateFromAUIRState,
  setLocalValue as updateLocalValue,
} from "@/runtime/state";
import { useCallback, useRef, useState } from "react";

let _sessionId = `sess_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

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
  const [localState, setLocalState] = useState<LocalUIState>(() =>
    createInitialLocalUIState(),
  );
  const [turn, setTurn] = useState(0);
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
        ? { ...activePageLogContext, sessionId: _sessionId }
        : null;
      if (incomingPageLogContext) {
        setPageLogContext(requestPageLogContext);
      }
      const request: AUIRRequest = {
        protocol: "AUIR",
        version: "0.3",
        session: {
          sessionId: _sessionId,
          appId: auirState?.app.id,
          turn: nextTurn,
          pageLogId: requestPageLogContext?.pageLogId,
          pageStartedAt: requestPageLogContext?.pageStartedAt,
          initialQuery: requestPageLogContext?.initialQuery,
        },
        previous: auirState,
        event,
        memory,
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
          ? applyMemoryPatch(memory, response.memoryPatch)
          : memory;
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
          console.warn(
            "[TheHiggs] AI response is a mock fallback (simulatedData=true). Check runtime log for details.",
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
          _sessionId = `sess_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
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
    [turn, memory, auirState, pageLogContext, lastEventRef],
  );

  const handleRestart = useCallback(async () => {
    await postRuntimeLog(pageLogContext, {
      type: "page.closed",
      turn,
      stage: "frontend",
      status: "success",
      payload: { reason: "restart" },
    });
    _sessionId = `sess_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
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

  return (
    <>
      {loading && <LoadingOverlay />}

      {isLauncher ? (
        <SearchLauncher onSearch={handleAIEvent} disabled={loading} />
      ) : (
        <div className="min-h-screen bg-neutral-950 text-neutral-100">
          <div className="border-b border-neutral-800 px-6 py-3 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">
                {auirState?.app.title ?? "App"}
              </h2>
              {auirState?.app.description && (
                <p className="text-xs text-neutral-500">
                  {auirState.app.description}
                </p>
              )}
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() =>
                  handleAIEvent({
                    eventId: `evt_restart_${Date.now()}`,
                    timestamp: new Date().toISOString(),
                    type: "runtime.command",
                    command: "back_to_launcher",
                  })
                }
                className="px-3 py-1.5 text-xs rounded-lg bg-neutral-800 border border-neutral-700 text-neutral-400 hover:text-neutral-200 hover:bg-neutral-700 transition-colors"
              >
                ← Launcher
              </button>
            </div>
          </div>
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
    </>
  );
}
