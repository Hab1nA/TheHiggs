// ============================================================
// AIStatusStrip — AI 运行状态条
// ============================================================
// 位于 AppNavBar 下方，显示 AI 模式、Memory 占用和 Diagnostics 摘要。
// 紧凑的单行设计，信息密度高但视觉不喧宾夺主。

"use client";

import { useState } from "react";

export type AIStatusStripProps = {
  memorySize?: number;
  simulatedData?: boolean;
  diagnostics?: Record<string, unknown>;
};

export default function AIStatusStrip({
  memorySize = 0,
  simulatedData = false,
  diagnostics,
}: AIStatusStripProps) {
  const [showDiag, setShowDiag] = useState(false);

  // 从 localStorage 读取 AI 模式（与 SearchLauncher 同步）
  const refineMode =
    typeof window !== "undefined" &&
    localStorage.getItem("thehiggs_refineMode") === "true";
  const thinkingMode =
    typeof window !== "undefined" &&
    localStorage.getItem("thehiggs_thinkingMode") === "true";
  const postProcessMode =
    typeof window !== "undefined" &&
    localStorage.getItem("thehiggs_postProcessMode") === "true";

  const memoryKB = Math.round(memorySize / 1024);
  const memoryDisplay =
    memoryKB > 1024 ? `${(memoryKB / 1024).toFixed(1)}MB` : `${memoryKB}KB`;

  return (
    <div className="relative flex items-center gap-2 border-b border-neutral-900 bg-neutral-950/80 px-4 py-1 shrink-0">
      {/* AI 模式标签 */}
      {refineMode && <StatusBadge color="purple" label="细化" />}
      {thinkingMode && <StatusBadge color="amber" label="思考" />}
      {postProcessMode && <StatusBadge color="teal" label="复核" />}
      {!refineMode && !thinkingMode && !postProcessMode && (
        <StatusBadge color="neutral" label="标准" />
      )}

      <div className="h-3 w-px bg-neutral-800" />

      {/* Memory 状态 */}
      <div className="flex items-center gap-1">
        <svg
          width="10"
          height="10"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          className="text-neutral-600"
        >
          <rect x="2" y="6" width="12" height="6" rx="1" />
          <path d="M5 6V4M8 6V4M11 6V4" />
        </svg>
        <span className="text-[10px] text-neutral-500 tabular-nums">
          {memoryDisplay}
        </span>
      </div>

      {/* 模拟数据标记 */}
      {simulatedData && (
        <>
          <div className="h-3 w-px bg-neutral-800" />
          <StatusBadge color="yellow" label="示例数据" />
        </>
      )}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Diagnostics 切换 */}
      {diagnostics && Object.keys(diagnostics).length > 0 && (
        <button
          onClick={() => setShowDiag(!showDiag)}
          className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] text-neutral-500 hover:text-neutral-300 hover:bg-neutral-800/50 transition-colors"
        >
          <svg
            width="10"
            height="10"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          >
            <circle cx="8" cy="8" r="6" />
            <path d="M8 5v3M8 10v.5" />
          </svg>
          诊断
          <svg
            width="8"
            height="8"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className={`transition-transform ${showDiag ? "rotate-180" : ""}`}
          >
            <path d="M4 6l4 4 4-4" />
          </svg>
        </button>
      )}

      {/* Diagnostics 下拉面板 */}
      {showDiag && diagnostics && (
        <div className="absolute right-2 top-full z-50 mt-1 w-80 max-h-48 overflow-auto rounded-lg border border-neutral-700 bg-neutral-900 p-3 shadow-xl">
          <pre className="whitespace-pre-wrap text-[10px] font-mono text-neutral-400">
            {JSON.stringify(diagnostics, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

// ── 内部组件 ──────────────────────────────────────────────────

function StatusBadge({
  color,
  label,
}: {
  color: "purple" | "amber" | "teal" | "yellow" | "neutral";
  label: string;
}) {
  const classes = {
    purple: "border-purple-500/30 bg-purple-500/10 text-purple-300",
    amber: "border-amber-500/30 bg-amber-500/10 text-amber-300",
    teal: "border-teal-500/30 bg-teal-500/10 text-teal-300",
    yellow: "border-yellow-500/30 bg-yellow-500/10 text-yellow-300",
    neutral: "border-neutral-700 bg-neutral-800/50 text-neutral-400",
  }[color];

  return (
    <span
      className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-medium ${classes}`}
    >
      {label}
    </span>
  );
}
