"use client";

import React from "react";

export default function LoadingOverlay() {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-neutral-950/80 backdrop-blur-sm">
      <div className="flex flex-col items-center gap-4">
        <div className="relative w-12 h-12">
          <div className="absolute inset-0 border-4 border-neutral-800 rounded-full" />
          <div className="absolute inset-0 border-4 border-transparent border-t-blue-500 rounded-full animate-spin" />
        </div>
        <div className="text-sm text-neutral-400">
          <span className="animate-pulse">Generating UI...</span>
        </div>
      </div>
    </div>
  );
}
