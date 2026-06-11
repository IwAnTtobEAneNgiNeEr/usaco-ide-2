"use strict";

// USACO IDE 2.0 — thin Electron wrapper. Starts the existing Express backend
// (no app rewrite) and loads it in a native desktop window. No browser tab,
// no localhost URL in the user's face.

const { app, BrowserWindow, Menu, shell, dialog } = require("electron");
const { fork } = require("child_process");
const path = require("path");
const http = require("http");

const PORT = Number(process.env.USACO_IDE_PORT || 5050);
const URL = `http://127.0.0.1:${PORT}`;

// Backend lives beside the app in dev; under resources/ when packaged.
const ROOT = app.isPackaged ? process.resourcesPath : path.join(__dirname, "..");
const BACKEND = path.join(ROOT, "backend", "server.js");

let backend = null;
let win = null;

function startBackend() {
  backend = fork(BACKEND, [], {
    cwd: path.dirname(BACKEND),
    env: { ...process.env, ELECTRON_RUN_AS_NODE: "1", USACO_IDE_PORT: String(PORT) },
    stdio: ["ignore", "inherit", "inherit", "ipc"]
  });
  backend.on("exit", () => { backend = null; });
}

function ping() {
  return new Promise((resolve) => {
    const req = http.get(`${URL}/api/health`, (res) => { res.resume(); resolve(res.statusCode === 200); });
    req.on("error", () => resolve(false));
    req.setTimeout(1000, () => { req.destroy(); resolve(false); });
  });
}

async function waitForServer(timeoutMs = 25000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await ping()) return true;
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

function createWindow() {
  win = new BrowserWindow({
    width: 1440, height: 900, minWidth: 1080, minHeight: 680,
    backgroundColor: "#111827", title: "USACO IDE 2.0",
    icon: path.join(__dirname, "build", "icon.ico"),
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true }
  });
  const template = [
    {
      label: "Chỉnh sửa",
      submenu: [
        { role: "undo", label: "Hoàn tác" },
        { role: "redo", label: "Làm lại" },
        { type: "separator" },
        { role: "cut", label: "Cắt" },
        { role: "copy", label: "Sao chép" },
        { role: "paste", label: "Dán" },
        { role: "selectAll", label: "Chọn tất cả" }
      ]
    },
    {
      label: "Giao diện",
      submenu: [
        { role: "reload", label: "Tải lại trang" },
        { role: "forceReload", label: "Buộc tải lại" },
        { role: "toggleDevTools", label: "Công cụ phát triển (DevTools)" },
        { type: "separator" },
        { role: "resetZoom", label: "Đặt lại thu phóng" },
        { role: "zoomIn", label: "Phóng to" },
        { role: "zoomOut", label: "Thu nhỏ" },
        { type: "separator" },
        { role: "togglefullscreen", label: "Toàn màn hình" }
      ]
    }
  ];
  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
  win.loadURL(URL);
  // External links open in the real browser, not inside the app.
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: "deny" }; });
  win.on("closed", () => { win = null; });
}

app.whenReady().then(async () => {
  if (!(await ping())) startBackend(); // reuse a backend that's already running
  const ok = await waitForServer();
  if (!ok) {
    dialog.showErrorBox("USACO IDE 2.0", `Không khởi động được backend ở ${URL}.\nKiểm tra Node.js và thư mục backend/.`);
  }
  createWindow();
  app.on("activate", () => { if (!win) createWindow(); });
});

function stopBackend() { if (backend) { try { backend.kill(); } catch { /* ignore */ } backend = null; } }
app.on("before-quit", stopBackend);
app.on("window-all-closed", () => { stopBackend(); app.quit(); });
