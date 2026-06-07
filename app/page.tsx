// ============================================================
// TheHiggs — AI-UI Co-Execution Runtime 入口页面
// ============================================================

"use client";

import { defaultConstraints } from "@/auir/constraints";
import { createInitialMemory } from "@/auir/memory";
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
import { useCallback, useState } from "react";

let _sessionId = `sess_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

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

  const isLauncher = !auirState || auirState.app.kind === "launcher";

  const handleSetLocalValue = useCallback(
    (binding: string, value: unknown) => {
      setLocalState((prev) => {
        const previousValue = prev.values[binding];
        const next = updateLocalValue(prev, binding, value);
        void postRuntimeLog(pageLogContext, {
          type: "frontend.local_state.changed",
          turn,
          stage: "frontend",
          status: "success",
          payload: { binding, previousValue, nextValue: value },
        });
        return next;
      });
    },
    [pageLogContext, turn],
  );

  const handleAIEvent = useCallback(
    async (event: AUIREvent, incomingPageLogContext?: PageLogContext) => {
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
        if (response.next?.memory) {
          setMemory((prev) => ({
            ...prev,
            app: { ...prev.app, ...response.next.memory.app },
            session: { ...prev.session, ...response.next.memory.session },
            turn: { eventType: event.type, eventId: event.eventId },
          }));
        }
        setLocalState(hydrateLocalStateFromAUIRState(response.next));
        if (response.diagnostics) {
          setDiagnostics(response.diagnostics as Record<string, unknown>);
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
    [turn, memory, auirState, pageLogContext],
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

      {error && <ErrorPanel message={error} onRetry={handleRestart} />}

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
