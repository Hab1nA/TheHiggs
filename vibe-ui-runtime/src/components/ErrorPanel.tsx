"use client";

import React from "react";

type ErrorPanelProps = {
  message: string;
  onRetry?: () => void;
  onReset?: () => void;
};

export default function ErrorPanel({ message, onRetry, onReset }: ErrorPanelProps) {
  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="bg-neutral-900 border border-red-800 rounded-xl p-6 max-w-md w-full text-center">
        <div className="text-3xl mb-3">⚠️</div>
        <h2 className="text-lg font-semibold text-red-400 mb-2">
          Runtime Error
        </h2>
        <p className="text-sm text-neutral-400 mb-4">{message}</p>
        <div className="flex gap-3 justify-center">
          {onRetry && (
            <button
              onClick={onRetry}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors"
            >
              Retry
            </button>
          )}
          {onReset && (
            <button
              onClick={onReset}
              className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded-lg text-sm font-medium transition-colors"
            >
              Start Over
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
