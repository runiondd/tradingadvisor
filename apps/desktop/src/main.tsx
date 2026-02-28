import React from "react";
import ReactDOM from "react-dom/client";
import { AppStateProvider } from "./context/AppState";
import { AuthProvider } from "./context/AuthContext";
import { App } from "./screens/App";

import "./styles.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <AppStateProvider>
      <AuthProvider>
        <App />
      </AuthProvider>
    </AppStateProvider>
  </React.StrictMode>
);

