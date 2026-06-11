// ============================================================
// AppNavBar — 应用导航栏
// ============================================================
// 位于 ElectronTitleBar 下方，仅在 App 页面显示。
// 包含返回 Launcher 按钮、App 标题/描述、Turn 计数和 Session 时长。

"use client";

import { useCallback, useEffect, useState } from "react";

export type AppNavBarProps = {
  appTitle: string;
  appDescription?: string;
  turn: number;
  sessionId: string;
  sessionStartedAt?: string;
  loading: boolean;
  onBackToLauncher: () => void;
};

function formatElapsed(startedAt?: string): string {
  if (!startedAt) return "0s";
  const elapsed = Math.floor(
    (Date.now() - new Date(startedAt).getTime()) / 1000,
  );
  if (elapsed < 60) return `${elapsed}s`;
  const m = Math.floor(elapsed / 60);
  const s = elapsed % 60;
  return `${m}m ${s}s`;
}

export default function AppNavBar({
  appTitle,
  appDescription,
  turn,
  loading,
  onBackToLauncher,
}: AppNavBarProps) {
  const [elapsed, setElapsed] = useState("0s");
  const [startedAt] = useState(() => new Date().toISOString());

  useEffect(() => {
    const timer = setInterval(() => {
      setElapsed(formatElapsed(startedAt));
    }, 1000);
    return () => clearInterval(timer);
  }, [startedAt]);

  const handleBack = useCallback(() => {
    onBackToLauncher();
  }, [onBackToLauncher]);

  return (
    <div className="flex items-center justify-between border-b border-neutral-800/60 bg-neutral-950/95 backdrop-blur-sm px-4 py-2 shrink-0">
      {/* 左侧: 导航 + App 信息 */}
      <div className="flex items-center gap-3 min-w-0">
        <button
          onClick={handleBack}
          className="flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-md bg-neutral-800/80 border border-neutral-700/60 text-neutral-400 hover:text-neutral-100 hover:bg-neutral-700/80 hover:border-neutral-600 transition-all"
          title="返回 Launcher"
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M10 12L6 8l4-4" />
          </svg>
          Launcher
        </button>

        <div className="h-4 w-px bg-neutral-800" />

        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-neutral-100 truncate">
            {appTitle}
          </h2>
          {appDescription && (
            <p className="text-[11px] text-neutral-500 truncate max-w-md">
              {appDescription}
            </p>
          )}
        </div>
      </div>

      {/* 右侧: 运行时状态 */}
      <div className="flex items-center gap-2 shrink-0">
        {loading && (
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-cyan-500/10 border border-cyan-500/20">
            <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
            <span className="text-[10px] font-medium text-cyan-300">
              生成中
            </span>
          </div>
        )}

        <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-neutral-800/50 border border-neutral-800">
          <svg
            width="10"
            height="10"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            className="text-neutral-500"
          >
            <circle cx="8" cy="8" r="6" />
            <path d="M8 4v4l3 2" />
          </svg>
          <span className="text-[10px] font-medium text-neutral-400 tabular-nums">
            {elapsed}
          </span>
        </div>

        <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-neutral-800/50 border border-neutral-800">
          <span className="text-[10px] text-neutral-500">T</span>
          <span className="text-[10px] font-semibold text-neutral-300 tabular-nums">
            {turn}
          </span>
        </div>
      </div>
    </div>
  );
}
