// ============================================================
// TheHiggs — Electron Main Process
// ============================================================
// 开发模式: 加载 http://localhost:3000 (需先运行 npm run dev)
// 生产模式: 启动 Next.js standalone server，加载对应端口

import { app, BrowserWindow, ipcMain, shell } from "electron";
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import net from "node:net";
import { join } from "node:path";

// ── 状态 ──────────────────────────────────────────────────────

let mainWindow: BrowserWindow | null = null;
let serverProcess: ChildProcess | null = null;
let serverPort = 0;

const DEV_PORT = 3000;
const WINDOW_WIDTH = 1440;
const WINDOW_HEIGHT = 900;

// ── 环境变量加载 ──────────────────────────────────────────────

/**
 * 简易 .env 文件解析器。
 * 从指定路径读取 KEY=VALUE 格式的环境变量并注入 process.env。
 */
function loadEnvFile(filePath: string): void {
  if (!existsSync(filePath)) return;

  const content = readFileSync(filePath, "utf-8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;

    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();

    // 去除引号
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

/**
 * 加载 .env.local 环境变量。
 * 开发模式: 从项目根目录加载
 * 生产模式: 从 userData 目录或 resources 目录加载
 */
function loadEnvironment(): void {
  if (!app.isPackaged) {
    // 开发模式 — 项目根目录
    const projectRoot = join(__dirname, "..", "..");
    loadEnvFile(join(projectRoot, ".env.local"));
    loadEnvFile(join(projectRoot, ".env"));
  } else {
    // 生产模式 — 优先 userData，其次 resources
    const userDataPath = join(app.getPath("userData"), ".env.local");
    const resourcePath = join(process.resourcesPath, ".env.local");
    loadEnvFile(userDataPath);
    loadEnvFile(resourcePath);
  }
}

// ── 端口管理 ──────────────────────────────────────────────────

/** 查找一个空闲端口 */
function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("Failed to get server address"));
        return;
      }
      const port = address.port;
      server.close(() => resolve(port));
    });
    server.on("error", reject);
  });
}

// ── Next.js Server 管理 ───────────────────────────────────────

/** 启动 Next.js standalone server，等待就绪后返回端口号 */
function startNextServer(port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const standaloneDir = join(process.resourcesPath, "next-app");
    const serverScript = join(standaloneDir, "server.js");

    if (!existsSync(serverScript)) {
      reject(new Error(`Standalone server not found: ${serverScript}`));
      return;
    }

    console.log(`[electron] Starting Next.js server on port ${port}...`);
    console.log(`[electron] Server dir: ${standaloneDir}`);

    serverProcess = spawn(process.execPath, [serverScript], {
      cwd: standaloneDir,
      env: {
        ...process.env,
        PORT: String(port),
        HOSTNAME: "127.0.0.1",
        NODE_ENV: "production",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let resolved = false;

    serverProcess.stdout?.on("data", (data: Buffer) => {
      const text = data.toString();
      console.log("[next-server]", text.trim());
      // Next.js standalone 输出 "Ready" 或包含端口号时表示就绪
      if (
        !resolved &&
        (text.includes("Ready") ||
          text.includes("ready") ||
          text.includes(`localhost:${port}`))
      ) {
        resolved = true;
        resolve();
      }
    });

    serverProcess.stderr?.on("data", (data: Buffer) => {
      console.error("[next-server:err]", data.toString().trim());
    });

    serverProcess.on("error", (err) => {
      console.error("[electron] Failed to start server:", err);
      if (!resolved) {
        resolved = true;
        reject(err);
      }
    });

    serverProcess.on("exit", (code) => {
      console.log(`[electron] Server exited with code ${code}`);
      serverProcess = null;
      if (!resolved) {
        resolved = true;
        reject(new Error(`Server exited with code ${code}`));
      }
    });

    // 超时保护: 30 秒内未就绪则报错
    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        reject(new Error("Next.js server startup timed out (30s)"));
      }
    }, 30_000);
  });
}

// ── 窗口管理 ──────────────────────────────────────────────────

function createWindow(port: number): void {
  mainWindow = new BrowserWindow({
    width: WINDOW_WIDTH,
    height: WINDOW_HEIGHT,
    minWidth: 800,
    minHeight: 600,
    title: "TheHiggs — AI-UI Co-Execution Runtime",
    frame: false,
    titleBarStyle: "hidden",
    titleBarOverlay: {
      color: "#09090b",
      symbolColor: "#a3a3a3",
      height: 36,
    },
    backgroundColor: "#09090b",
    webPreferences: {
      preload: join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  const url = `http://127.0.0.1:${port}`;
  console.log(`[electron] Loading ${url}`);
  mainWindow.loadURL(url);

  // 外部链接在系统浏览器中打开
  mainWindow.webContents.setWindowOpenHandler(({ url: targetUrl }) => {
    if (targetUrl.startsWith("http")) {
      shell.openExternal(targetUrl);
    }
    return { action: "deny" };
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  // 向渲染进程发送最大化/还原事件
  mainWindow.on("maximize", () => {
    mainWindow?.webContents.send("window:maximized");
  });
  mainWindow.on("unmaximize", () => {
    mainWindow?.webContents.send("window:unmaximized");
  });
}

// ── IPC: 窗口控制 ────────────────────────────────────────────

ipcMain.on("window:minimize", () => {
  mainWindow?.minimize();
});

ipcMain.on("window:maximize", () => {
  if (mainWindow?.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow?.maximize();
  }
});

ipcMain.on("window:close", () => {
  mainWindow?.close();
});

ipcMain.handle("window:isMaximized", () => {
  return mainWindow?.isMaximized() ?? false;
});

// ── 清理 ──────────────────────────────────────────────────────

function cleanup(): void {
  if (serverProcess) {
    console.log("[electron] Stopping Next.js server...");
    serverProcess.kill("SIGTERM");
    serverProcess = null;
  }
}

// ── 应用生命周期 ──────────────────────────────────────────────

// 禁止多实例
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    loadEnvironment();

    if (!app.isPackaged) {
      // ── 开发模式: 直接加载已运行的 dev server ──
      console.log(`[electron] Dev mode — loading http://localhost:${DEV_PORT}`);
      createWindow(DEV_PORT);
    } else {
      // ── 生产模式: 启动 standalone server ──
      try {
        serverPort = await findFreePort();
        await startNextServer(serverPort);
        createWindow(serverPort);
      } catch (err) {
        console.error("[electron] Failed to start:", err);
        app.quit();
      }
    }
  });

  app.on("window-all-closed", () => {
    cleanup();
    // macOS 上关闭窗口不退出
    if (process.platform !== "darwin") {
      app.quit();
    }
  });

  app.on("activate", () => {
    // macOS: 点击 dock 图标时重新创建窗口
    if (BrowserWindow.getAllWindows().length === 0) {
      if (app.isPackaged && serverPort > 0) {
        createWindow(serverPort);
      } else if (!app.isPackaged) {
        createWindow(DEV_PORT);
      }
    }
  });

  app.on("before-quit", () => {
    cleanup();
  });
}
