// ============================================================
// DebugPanel — 调试面板
// ============================================================

"use client";

import type { AUIRMemory, AUIRState, LocalUIState } from "@/auir/types";
import { useState } from "react";

export default function DebugPanel({
  state,
  memory,
  localState,
  turn,
  loading,
  diagnostics,
}: {
  state: AUIRState | null;
  memory: AUIRMemory;
  localState: LocalUIState;
  turn: number;
  loading: boolean;
  diagnostics?: Record<string, unknown>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [tab, setTab] = useState<"state" | "local" | "memory" | "diag">("state");

  if (!expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        className="fixed bottom-4 right-4 z-40 bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-xs text-neutral-400 hover:text-neutral-200 transition-colors"
      >
        Debug
      </button>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 z-40 bg-neutral-900 border border-neutral-700 rounded-xl w-96 max-h-[60vh] flex flex-col shadow-2xl">
      <div className="flex items-center justify-between p-3 border-b border-neutral-800">
        <div className="flex gap-2">
          {(["state", "local", "memory", "diag"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-2 py-1 text-xs rounded ${tab === t ? "bg-blue-600 text-white" : "text-neutral-400 hover:text-neutral-200"}`}
            >
              {t}
            </button>
          ))}
        </div>
        <button
          onClick={() => setExpanded(false)}
          className="text-neutral-500 hover:text-neutral-300"
        >
          ✕
        </button>
      </div>
      <div className="p-3 overflow-auto flex-1 text-xs font-mono">
        <div className="text-neutral-500 mb-2">
          Turn: {turn} | Loading: {String(loading)}
        </div>
        {tab === "state" && (
          <pre className="whitespace-pre-wrap text-neutral-300">
            {state ? JSON.stringify({ app: state.app, memory: state.memory, uiNodeCount: "..." }, null, 2) : "null"}
          </pre>
        )}
        {tab === "local" && (
          <pre className="whitespace-pre-wrap text-neutral-300">
            {JSON.stringify(localState, null, 2)}
          </pre>
        )}
        {tab === "memory" && (
          <pre className="whitespace-pre-wrap text-neutral-300">
            {JSON.stringify(memory, null, 2)}
          </pre>
        )}
        {tab === "diag" && (
          <pre className="whitespace-pre-wrap text-neutral-300">
            {diagnostics ? JSON.stringify(diagnostics, null, 2) : "No diagnostics"}
          </pre>
        )}
      </div>
    </div>
  );
}
