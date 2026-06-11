// ============================================================
// ElectronTitleBar — 自定义无边框窗口标题栏
// ============================================================
// 在 Electron 环境中替代 OS 原生标题栏。
// 包含 Logo、应用名称和窗口控制按钮（最小化/最大化/关闭）。
// 使用 -webkit-app-region: drag 实现窗口拖拽。

"use client";

import { useCallback, useEffect, useState } from "react";

export default function ElectronTitleBar() {
  const isElectron =
    typeof window !== "undefined" && !!window.electronAPI?.isElectron;
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    if (!isElectron || !window.electronAPI?.windowControls) return;
    const wc = window.electronAPI.windowControls;
    void wc.isMaximized().then(setIsMaximized);
    wc.onMaximized(() => setIsMaximized(true));
    wc.onUnmaximized(() => setIsMaximized(false));
  }, [isElectron]);

  const handleMinimize = useCallback(() => {
    window.electronAPI?.windowControls?.minimize();
  }, []);

  const handleMaximize = useCallback(() => {
    window.electronAPI?.windowControls?.maximize();
  }, []);

  const handleClose = useCallback(() => {
    window.electronAPI?.windowControls?.close();
  }, []);

  if (!isElectron) return null;

  return (
    <div
      className="electron-title-bar sticky top-0 z-50 flex items-center justify-between bg-neutral-950 border-b border-neutral-900 select-none shrink-0"
      style={{ height: 36, WebkitAppRegion: "drag" } as React.CSSProperties}
    >
      {/* 左侧: Logo + 应用名 */}
      <div className="flex items-center gap-2 pl-3 h-full">
        <div className="grid h-6 w-6 place-items-center rounded border border-cyan-400/30 bg-cyan-400/10 text-[10px] font-bold text-cyan-300">
          TH
        </div>
        <span className="text-[11px] font-medium text-neutral-400 tracking-wide">
          TheHiggs
        </span>
      </div>

      {/* 右侧: 占位（原生 titleBarOverlay 控件在此区域） */}
      <div className="h-full" />
    </div>
  );
}
