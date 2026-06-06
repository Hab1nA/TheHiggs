// ============================================================
// ErrorPanel — 错误显示面板
// ============================================================

"use client";


export default function ErrorPanel({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="bg-red-950 border border-red-800 rounded-xl p-4 max-w-lg mx-auto mt-8">
      <h3 className="text-red-300 font-semibold mb-2">Runtime Error</h3>
      <p className="text-red-200 text-sm mb-4">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="px-4 py-2 bg-red-700 hover:bg-red-600 text-white rounded-lg text-sm font-medium transition-colors"
        >
          Retry
        </button>
      )}
    </div>
  );
}
