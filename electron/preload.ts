// ============================================================
// TheHiggs — Electron Preload Script
// ============================================================
// 在渲染进程的沙箱环境中安全地暴露有限的 Node.js 能力。
// 当前版本仅暴露平台信息，后续可扩展 IPC 通信。

import { contextBridge } from "electron";

// 通过 contextBridge 向渲染进程暴露安全的 API
contextBridge.exposeInMainWorld("electronAPI", {
  /** 当前平台标识 */
  platform: process.platform,

  /** 是否运行在 Electron 环境中 */
  isElectron: true,

  /** 应用版本号 */
  version: process.env.npm_package_version ?? "unknown",
});
