import { app, BrowserWindow } from "electron";
import { join } from "node:path";
import { format } from "node:url";
import { initStorage, closeStorage } from "./storage";

const isDev = process.env.NODE_ENV === "development";

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

