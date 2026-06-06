"use client";

import React, { useState, useCallback } from "react";
import type { AUIRState, AUIRMemory, AUIRRequest, AUIRResponse } from "@/src/auir/types";
import { createInitialMemory, defaultConstraints } from "@/src/auir/schema";
import { applyMemoryPatch } from "@/src/auir/memory";
import { sendAUIREvent } from "@/src/runtime/client";
import Shell from "@/src/components/Shell";
import SearchLauncher from "@/src/components/SearchLauncher";
import LoadingOverlay from "@/src/components/LoadingOverlay";
import ErrorPanel from "@/src/components/ErrorPanel";
import Renderer from "@/src/runtime/Renderer";

// Generate a simple session ID
function generateSessionId(): string {
  return `sess_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export default function Home() {
  const [sessionId] = useState(generateSessionId);
  const [state, setState] = useState<AUIRState | null>(null);
  const [memory, setMemory] = useState<AUIRMemory>(createInitialMemory);
  const [turn, setTurn] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleEvent = useCallback(
    async (event: import("@/src/auir/types").AUIREvent) => {
      setLoading(true);
      setError(null);

      const currentTurn = turn;

      const auirRequest: AUIRRequest = {
        protocol: "AUIR",
        version: "0.1",
        session: {
          sessionId,
          appId: state?.app?.id,
          turn: currentTurn,
        },
        previous: state,
        event,
        memory,
        constraints: defaultConstraints,
      };

      try {
        const response: AUIRResponse = await sendAUIREvent(auirRequest);

        // Update state
        setState(response.next);

        // Apply memory patch
        if (response.memoryPatch) {
          setMemory((prev) =>
            applyMemoryPatch(
              prev,
              response.memoryPatch?.session,
              response.memoryPatch?.app
            )
          );
        }

        // Also merge in next.memory
        setMemory((prev) => ({
          ...prev,
          session: response.next.memory.session,
          app: response.next.memory.app,
        }));

        setTurn((t) => t + 1);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
      } finally {
        setLoading(false);
      }
    },
    [sessionId, state, memory, turn]
  );

  const handleReset = useCallback(() => {
    setState(null);
    setMemory(createInitialMemory);
    setTurn(0);
    setError(null);
  }, []);

  // Determine what to render
  const renderContent = () => {
    if (error) {
      return (
        <ErrorPanel
          message={error}
          onRetry={() => {
            setError(null);
            // Re-send last event? For MVP, just reset
            handleReset();
          }}
          onReset={handleReset}
        />
      );
    }

    if (loading && !state) {
      // Initial loading
      return (
        <>
          <SearchLauncher onEvent={handleEvent} />
          <LoadingOverlay />
        </>
      );
    }

    if (!state || state.app.kind === "launcher") {
      return <SearchLauncher onEvent={handleEvent} />;
    }

    return (
      <>
        {loading && <LoadingOverlay />}
        <Renderer node={state.ui} onEvent={handleEvent} />
      </>
    );
  };

  return <Shell>{renderContent()}</Shell>;
}
