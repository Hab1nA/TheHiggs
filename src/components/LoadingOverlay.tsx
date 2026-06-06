// ============================================================
// LoadingOverlay — 加载状态遮罩
// ============================================================

"use client";


export default function LoadingOverlay({ message }: { message?: string }) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-neutral-950/80 backdrop-blur-sm">
      <div className="w-10 h-10 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mb-4" />
      <p className="text-neutral-400 text-sm">{message ?? "AI is generating UI..."}</p>
    </div>
  );
}
