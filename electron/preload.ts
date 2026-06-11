// ============================================================
// TheHiggs — Electron Preload Script
// ============================================================
// 在渲染进程的沙箱环境中安全地暴露有限的 Node.js 能力。
// 包含平台信息和窗口控制 API。

import { contextBridge, ipcRenderer } from "electron";

// 通过 contextBridge 向渲染进程暴露安全的 API
contextBridge.exposeInMainWorld("electronAPI", {
  /** 当前平台标识 */
  platform: process.platform,

  /** 是否运行在 Electron 环境中 */
  isElectron: true,

  /** 应用版本号 */
  version: process.env.npm_package_version ?? "unknown",

  /** 窗口控制 */
  windowControls: {
    minimize: () => ipcRenderer.send("window:minimize"),
    maximize: () => ipcRenderer.send("window:maximize"),
    close: () => ipcRenderer.send("window:close"),
    isMaximized: (): Promise<boolean> =>
      ipcRenderer.invoke("window:isMaximized"),
    onMaximized: (callback: () => void) => {
      ipcRenderer.on("window:maximized", () => callback());
    },
    onUnmaximized: (callback: () => void) => {
      ipcRenderer.on("window:unmaximized", () => callback());
    },
  },
});
