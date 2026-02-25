import { contextBridge } from "electron";

// IPC APIs will be added as the domain and data layers are implemented.
// Expose a minimal, versioned surface today.

contextBridge.exposeInMainWorld("tradingApp", {
  version: "0.1.0"
});

