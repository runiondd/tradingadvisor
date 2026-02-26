import React from "react";

export type ScreenId =
  | "dashboard"
  | "onboarding"
  | "asset"
  | "options"
  | "portfolio"
  | "settings";

interface LayoutProps {
  currentScreen: ScreenId;
  onNavigate: (screen: ScreenId) => void;
  children: React.ReactNode;
}

const NAV: { id: ScreenId; label: string }[] = [
  { id: "dashboard", label: "Dashboard" },
  { id: "portfolio", label: "Portfolio" },
  { id: "asset", label: "Research" },
  { id: "options", label: "Options" },
  { id: "settings", label: "Settings" }
];

export const Layout: React.FC<LayoutProps> = ({ currentScreen, onNavigate, children }) => {
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#0b0f1a" }}>
      <nav
        style={{
          display: "flex",
          gap: "8px",
          padding: "12px 16px",
          borderBottom: "1px solid #1e293b",
          background: "#0f172a"
        }}
      >
        {NAV.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            onClick={() => onNavigate(id)}
            style={{
              padding: "8px 14px",
              borderRadius: "6px",
              border: "none",
              background: currentScreen === id ? "#334155" : "transparent",
              color: "#e2e8f0",
              cursor: "pointer",
              fontWeight: currentScreen === id ? 600 : 400
            }}
          >
            {label}
          </button>
        ))}
      </nav>
      <main style={{ flex: 1, overflow: "auto", padding: "16px" }}>{children}</main>
    </div>
  );
};
