// ============================================================
// SearchLauncher — App Launcher 搜索框
// ============================================================

"use client";

import type { AUIREvent } from "@/auir/types";
import { createAppSearchEvent } from "@/runtime/event";
import { useCallback, useState, type FormEvent } from "react";

export default function SearchLauncher({
  onSearch,
  disabled,
}: {
  onSearch: (event: AUIREvent) => void;
  disabled?: boolean;
}) {
  const [query, setQuery] = useState("");

  const handleSubmit = useCallback(
    (e: FormEvent) => {
      e.preventDefault();
      const trimmed = query.trim();
      if (!trimmed || disabled) return;
      onSearch(createAppSearchEvent(trimmed));
    },
    [query, disabled, onSearch]
  );

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-8">
      <h1 className="text-4xl font-bold mb-2 bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
        TheHiggs
      </h1>
      <p className="text-lg text-neutral-400 mb-8">
        AI-UI Co-Execution Runtime
      </p>
      <p className="text-sm text-neutral-500 mb-6 max-w-md text-center">
        AI 驻留在自己生成的 UI 中。描述你想要的应用，AI 将为你构建一个语义交互界面。
      </p>
      <form onSubmit={handleSubmit} className="w-full max-w-xl">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="描述你想要的应用，例如：做一个火箭发动机循环参数分析工具..."
          disabled={disabled}
          className="w-full px-5 py-4 rounded-xl border border-neutral-700 bg-neutral-900 text-lg text-neutral-100 placeholder-neutral-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
        />
        <div className="mt-3 text-center">
          <button
            type="submit"
            disabled={disabled || !query.trim()}
            className="px-6 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-neutral-700 disabled:text-neutral-500 text-white rounded-lg text-sm font-medium transition-colors"
          >
            Launch
          </button>
        </div>
      </form>
    </div>
  );
}
