// ============================================================
// TheHiggs — AI-UI Co-Execution Runtime 入口页面
// ============================================================

"use client";

import React, { useState, useCallback } from "react";
import type {
  AUIRState,
  AUIRMemory,
  AUIREvent,
  AUIRResponse,
  LocalUIState,
  AUIRRequest,
} from "@/auir/types";
import { createInitialMemory } from "@/auir/memory";
import { defaultConstraints } from "@/auir/constraints";
import {
  createInitialLocalUIState,
  hydrateLocalStateFromAUIRState,
  setLocalValue as updateLocalValue,
} from "@/runtime/state";
import { sendAUIRRequest } from "@/runtime/client";
import Renderer from "@/runtime/Renderer";
import SearchLauncher from "@/components/SearchLauncher";
import LoadingOverlay from "@/components/LoadingOverlay";
import ErrorPanel from "@/components/ErrorPanel";
import DebugPanel from "@/components/DebugPanel";
import AUIRInspector from "@/components/AUIRInspector";

let _sessionId = `sess_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

export default function Home() {
  const [auirState, setAUIRState] = useState<AUIRState | null>(null);
  const [memory, setMemory] = useState<AUIRMemory>(() => createInitialMemory());
  const [localState, setLocalState] = useState<LocalUIState>(() => createInitialLocalUIState());
  const [turn, setTurn] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [diagnostics, setDiagnostics] = useState<Record<string, unknown> | undefined>(undefined);

  const isLauncher = !auirState || auirState.app.kind === "launcher";

  const handleSetLocalValue = useCallback(
    (binding: string, value: unknown) => {
      setLocalState((prev) => updateLocalValue(prev, binding, value));
    },
    []
  );

  const handleAIEvent = useCallback(
    async (event: AUIREvent) => {
      setLoading(true);
      setError(null);
      const nextTurn = turn + 1;
      const request: AUIRRequest = {
        protocol: "AUIR",
        version: "0.3",
        session: { sessionId: _sessionId, appId: auirState?.app.id, turn: nextTurn },
        previous: auirState,
        event,
        memory,
        constraints: defaultConstraints,
        availableTools: [],
      };
      try {
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
        setError(null);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        setError(message);
        console.error("[Home] AI event error:", err);
      } finally {
        setLoading(false);
      }
    },
    [turn, memory, auirState]
  );

  const handleRestart = useCallback(() => {
    _sessionId = `sess_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    setAUIRState(null);
    setMemory(createInitialMemory());
    setLocalState(createInitialLocalUIState());
    setTurn(0);
    setError(null);
    setDiagnostics(undefined);
    setLoading(false);
  }, []);

  return (
    <>
      {loading && <LoadingOverlay />}

      {isLauncher ? (
        <SearchLauncher onSearch={handleAIEvent} disabled={loading} />
      ) : (
        <div className="min-h-screen bg-neutral-950 text-neutral-100">
          <div className="border-b border-neutral-800 px-6 py-3 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">{auirState?.app.title ?? "App"}</h2>
              {auirState?.app.description && (
                <p className="text-xs text-neutral-500">{auirState.app.description}</p>
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
            <Renderer
              node={auirState!.ui}
              localState={localState}
              setLocalValue={handleSetLocalValue}
              onAIEvent={handleAIEvent}
            />
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
