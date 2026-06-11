// ============================================================
// Shell — 应用外壳组件
// ============================================================
// 三层顶部栏系统：
//   Layer 0: ElectronTitleBar — 自定义窗口标题栏（仅 Electron 环境）
//   Layer 1: AppNavBar — 应用导航栏（仅 App 页面）
//   Layer 2: AIStatusStrip — AI 状态条（仅 App 页面）
// 内容区自动适配顶部栏高度。

"use client";

import React from "react";
import AIStatusStrip from "./AIStatusStrip";
import AppNavBar from "./AppNavBar";
import ElectronTitleBar from "./ElectronTitleBar";

export type ShellRuntimeState = {
  isLauncher: boolean;
  appTitle?: string;
  appDescription?: string;
  turn?: number;
  sessionId?: string;
  loading?: boolean;
  memorySize?: number;
  simulatedData?: boolean;
  diagnostics?: Record<string, unknown>;
  onBackToLauncher?: () => void;
};

export default function Shell({
  children,
  runtimeState,
}: {
  children: React.ReactNode;
  runtimeState?: ShellRuntimeState;
}) {
  const isApp = runtimeState && !runtimeState.isLauncher;

  return (
    <div className="h-screen bg-neutral-950 text-neutral-100 flex flex-col overflow-hidden">
      {/* Layer 0: Electron 自定义标题栏 */}
      <ElectronTitleBar />

      {/* Layer 1: App 导航栏（仅 App 页面显示） */}
      {isApp && runtimeState.onBackToLauncher && (
        <AppNavBar
          appTitle={runtimeState.appTitle ?? "App"}
          appDescription={runtimeState.appDescription}
          turn={runtimeState.turn ?? 0}
          sessionId={runtimeState.sessionId ?? ""}
          loading={runtimeState.loading ?? false}
          onBackToLauncher={runtimeState.onBackToLauncher}
        />
      )}

      {/* Layer 2: AI 状态条（仅 App 页面显示） */}
      {isApp && (
        <AIStatusStrip
          memorySize={runtimeState.memorySize}
          simulatedData={runtimeState.simulatedData}
          diagnostics={runtimeState.diagnostics}
        />
      )}

      {/* 内容区 — 可滚动 */}
      <main className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
        {children}
      </main>
    </div>
  );
}
