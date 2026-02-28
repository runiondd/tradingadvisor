import React, { useState, useMemo } from "react";
import { useAppState } from "../context/AppState";
import type { ScreenId } from "../context/AppState";
import type { AuthUser } from "../context/AuthContext";

export type { ScreenId };

interface LayoutProps {
  currentScreen: ScreenId;
  onNavigate: (screen: ScreenId) => void;
  onLogout: () => void;
  currentUser: AuthUser | null;
  children: React.ReactNode;
}

const SIDEBAR_WIDTH = 220;

const BASE_NAV: { id: ScreenId; label: string }[] = [
  { id: "dashboard", label: "Dashboard" },
  { id: "portfolio", label: "Portfolio" },
  { id: "asset", label: "Research" },
  { id: "options", label: "Options" },
  { id: "settings", label: "Settings" }
];

export const Layout: React.FC<LayoutProps> = ({ currentScreen, onNavigate, onLogout, currentUser, children }) => {
  const { watchList, activeSymbol, setActiveSymbol, addToWatchlist, removeFromWatchlist } = useAppState();
  const [watchInput, setWatchInput] = useState("");
  const nav = useMemo(() => {
    if (currentUser?.role === "admin") {
      return [...BASE_NAV, { id: "admin" as ScreenId, label: "Admin" }];
    }
    return BASE_NAV;
  }, [currentUser?.role]);

  const handleAddWatch = () => {
    const s = watchInput.trim().toUpperCase();
    if (!s) return;
    addToWatchlist(s);
    setActiveSymbol(s);
    setWatchInput("");
  };

  const handleWatchSymbolClick = (sym: string) => {
    setActiveSymbol(sym);
    // Stay on current page when already on Research or Options so the page can refresh for the new symbol
    if (currentScreen !== "asset" && currentScreen !== "options") {
      onNavigate("asset");
    }
  };

  return (
    <div style={{ display: "flex", flex: 1, minHeight: 0, height: "100%", background: "#0b0f1a" }}>
      {/* Left sidebar – TradingView style */}
      <aside
        style={{
          width: SIDEBAR_WIDTH,
          minWidth: SIDEBAR_WIDTH,
          display: "flex",
          flexDirection: "column",
          borderRight: "1px solid #1e293b",
          background: "#0f172a"
        }}
      >
        <nav
          style={{
            padding: "12px 0",
            borderBottom: "1px solid #1e293b"
          }}
        >
          {nav.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              onClick={() => onNavigate(id)}
              style={{
                display: "block",
                width: "100%",
                padding: "10px 16px",
                border: "none",
                borderLeft: "3px solid transparent",
                background: currentScreen === id ? "#1e293b" : "transparent",
                color: currentScreen === id ? "#f1f5f9" : "#94a3b8",
                cursor: "pointer",
                fontSize: 13,
                fontWeight: currentScreen === id ? 600 : 400,
                textAlign: "left"
              }}
            >
              {label}
            </button>
          ))}
        </nav>

        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            minHeight: 0,
            padding: "8px 0"
          }}
        >
          <div style={{ padding: "0 12px 8px", borderBottom: "1px solid #1e293b" }}>
            <div style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>
              Watch list
            </div>
            <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
              <input
                type="text"
                placeholder="Symbol"
                value={watchInput}
                onChange={(e) => setWatchInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddWatch()}
                style={{
                  flex: 1,
                  minWidth: 0,
                  padding: "6px 8px",
                  fontSize: 12,
                  borderRadius: 4,
                  border: "1px solid #334155",
                  background: "#0b0f1a",
                  color: "#e2e8f0"
                }}
              />
              <button
                type="button"
                onClick={handleAddWatch}
                style={{
                  padding: "6px 10px",
                  fontSize: 12,
                  borderRadius: 4,
                  border: "none",
                  background: "#3b82f6",
                  color: "#fff",
                  cursor: "pointer",
                  fontWeight: 500
                }}
              >
                Add
              </button>
            </div>
          </div>

          <div style={{ flex: 1, overflowY: "auto", padding: "4px 0", minHeight: 0 }}>
            {watchList.map((sym) => (
              <div
                key={sym}
                role="button"
                tabIndex={0}
                onClick={() => handleWatchSymbolClick(sym)}
                onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && handleWatchSymbolClick(sym)}
                title={currentScreen === "options" ? `Load options for ${sym}` : `Select ${sym}`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "8px 12px",
                  margin: "2px 8px",
                  borderRadius: 4,
                  background: activeSymbol === sym ? "#1e293b" : "transparent",
                  color: activeSymbol === sym ? "#f1f5f9" : "#94a3b8",
                  cursor: "pointer",
                  fontSize: 13,
                  fontWeight: activeSymbol === sym ? 600 : 400
                }}
              >
                <span>{sym}</span>
                {activeSymbol === sym && watchList.length > 0 && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeFromWatchlist(sym);
                    }}
                    title="Remove from watch list"
                    style={{
                      padding: "2px 6px",
                      fontSize: 10,
                      borderRadius: 2,
                      border: "none",
                      background: "transparent",
                      color: "#64748b",
                      cursor: "pointer"
                    }}
                  >
                    −
                  </button>
                )}
              </div>
            ))}
            {watchList.length === 0 && (
              <p style={{ padding: "8px 12px", margin: 0, fontSize: 12, color: "#64748b" }}>
                Add symbols above
              </p>
            )}
          </div>

          {currentUser && (
            <div
              style={{
                padding: "12px 16px",
                borderTop: "1px solid #1e293b",
                marginTop: "auto"
              }}
            >
              <div style={{ fontSize: 12, color: "#64748b", marginBottom: 4 }}>{currentUser.email}</div>
              <button
                type="button"
                onClick={onLogout}
                style={{
                  padding: "4px 8px",
                  fontSize: 11,
                  borderRadius: 4,
                  border: "1px solid #475569",
                  background: "transparent",
                  color: "#94a3b8",
                  cursor: "pointer"
                }}
              >
                Sign out
              </button>
            </div>
          )}
        </div>
      </aside>

      <main style={{ flex: 1, minWidth: 0, minHeight: 0, overflow: "auto", padding: "16px" }}>{children}</main>
    </div>
  );
};
