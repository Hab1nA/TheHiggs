"use client";

import React from "react";

type ShellProps = {
  children: React.ReactNode;
};

export default function Shell({ children }: ShellProps) {
  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <header className="border-b border-neutral-800 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-blue-500" />
          <span className="text-sm font-semibold text-neutral-200">
            AUIR Runtime v0.1
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-neutral-500">
            LLM-Driven Semantic UI
          </span>
        </div>
      </header>
      <main>{children}</main>
    </div>
  );
}
