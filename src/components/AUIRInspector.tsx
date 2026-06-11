// ============================================================
// AUIRInspector — UI 状态检查器
// ============================================================

"use client";

import type { AUIRState } from "@/auir/types";
import { useState } from "react";

export default function AUIRInspector({ state }: { state: AUIRState | null }) {
  const [open, setOpen] = useState(false);

  if (!state) return null;

  return (
    <div className="fixed top-20 left-4 z-40">
      <button
        onClick={() => setOpen(!open)}
        className="bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-xs text-neutral-400 hover:text-neutral-200 transition-colors"
      >
        {open ? "Close Inspector" : "Inspect UI"}
      </button>
      {open && (
        <div className="mt-2 bg-neutral-900 border border-neutral-700 rounded-xl p-4 w-80 max-h-[70vh] overflow-auto text-xs font-mono">
          <div className="text-neutral-400 mb-2">
            App: {state.app.title} ({state.app.kind})
          </div>
          <div className="text-neutral-500 mb-2">ID: {state.app.id}</div>
          <pre className="whitespace-pre-wrap text-neutral-300 max-h-64 overflow-auto">
            {JSON.stringify(state.ui, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
