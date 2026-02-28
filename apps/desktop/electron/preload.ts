import { contextBridge, ipcRenderer } from "electron";

let realtimeDataCallback: ((data: unknown) => void) | null = null;
ipcRenderer.on("realtime:data", (_event, data: unknown) => {
  if (realtimeDataCallback) realtimeDataCallback(data);
});

contextBridge.exposeInMainWorld("tradingApp", {
  version: "0.1.0",
  invoke: (channel: string, payload?: unknown) => ipcRenderer.invoke(channel, payload),
  onRealtimeData: (callback: (data: unknown) => void) => {
    realtimeDataCallback = callback;
  }
});

