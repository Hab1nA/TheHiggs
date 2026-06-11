// ============================================================
// Electron API 类型定义
// ============================================================

interface ElectronWindowControls {
  minimize: () => void;
  maximize: () => void;
  close: () => void;
  isMaximized: () => Promise<boolean>;
  onMaximized: (callback: () => void) => void;
  onUnmaximized: (callback: () => void) => void;
}

interface ElectronAPI {
  platform: string;
  isElectron: boolean;
  version: string;
  windowControls?: ElectronWindowControls;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

export type { ElectronAPI, ElectronWindowControls };
