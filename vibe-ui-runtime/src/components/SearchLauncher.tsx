"use client";

import React, { useState, useCallback } from "react";
import type { AUIREvent } from "@/src/auir/types";
import { createAppSearchEvent } from "@/src/runtime/event";

type SearchLauncherProps = {
  onEvent: (event: AUIREvent) => void;
};

export default function SearchLauncher({ onEvent }: SearchLauncherProps) {
  const [query, setQuery] = useState("");

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const trimmed = query.trim();
      if (!trimmed) return;
      onEvent(createAppSearchEvent(trimmed));
    },
    [query, onEvent]
  );

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-lg text-center">
        {/* Logo / Icon */}
        <div className="mb-6 flex justify-center">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
            <svg
              className="w-8 h-8 text-white"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z"
              />
            </svg>
          </div>
        </div>

        <h1 className="text-3xl font-bold text-neutral-100 mb-2">
          Vibe UI Runtime
        </h1>
        <p className="text-neutral-400 mb-8">
          Search for the app you want to hallucinate.
        </p>

        <form onSubmit={handleSubmit} className="w-full">
          <div className="relative">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="e.g. build me a rocket engine cycle analyzer"
              className="w-full bg-neutral-900 border border-neutral-700 rounded-xl px-5 py-4 text-lg text-neutral-100 placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-shadow shadow-lg"
              autoFocus
            />
            <button
              type="submit"
              disabled={!query.trim()}
              className="absolute right-2 top-1/2 -translate-y-1/2 bg-blue-600 hover:bg-blue-500 disabled:bg-neutral-700 disabled:text-neutral-500 text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors"
            >
              Generate
            </button>
          </div>
        </form>

        <p className="text-xs text-neutral-600 mt-6">
          The AI generates a UI description. The frontend renders it. No code
          execution.
        </p>
      </div>
    </div>
  );
}
