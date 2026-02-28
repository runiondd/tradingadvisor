import { app, BrowserWindow, session } from "electron";
import { join } from "node:path";
import { format } from "node:url";
import "./ipcHandlers";
import { initStorage, closeStorage } from "./storage";
import { setRealtimeSender, close as closeRealtime } from "./realtimeSocket";

const isDev = process.env.NODE_ENV === "development";

// Suppress the "Insecure Content-Security-Policy" console warning in development (Vite uses eval for HMR).
if (isDev) {
  process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = "1";
}

// In production, set a strict CSP so Electron does not warn about insecure Content-Security-Policy.
if (!isDev) {
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const csp = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' https://*.googleapis.com https://oauth2.googleapis.com https://*.polygon.io wss:; frame-ancestors 'none'";
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": [csp]
      }
    });
  });
}

async function createMainWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: join(__dirname, "preload.js")
    },
    title: "Mac Trading Assistant"
  });

  setRealtimeSender((data) => {
    try {
      win.webContents.send("realtime:data", data);
    } catch {
      // window may be destroyed
    }
  });

  if (isDev) {
    await win.loadURL("http://localhost:5173");
    win.webContents.openDevTools({ mode: "detach" });
  } else {
    await win.loadURL(
      format({
        pathname: join(__dirname, "../renderer/index.html"),
        protocol: "file",
        slashes: true
      })
    );
  }
}

app.whenReady().then(() => {
  initStorage({ userDataPath: app.getPath("userData") });
  return createMainWindow();
});

app.on("window-all-closed", () => {
  closeRealtime();
  closeStorage();
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    void createMainWindow();
  }
});

