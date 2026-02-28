import React, { useState, useCallback, useEffect } from "react";
import { useAppState } from "../context/AppState";
import { useAuth } from "../context/AuthContext";
import { Layout, type ScreenId } from "../components/Layout";
import { ErrorBoundary } from "../components/ErrorBoundary";
import { AuthScreen } from "./AuthScreen";
import { DashboardScreen } from "./Dashboard";
import { OnboardingScreen } from "./Onboarding";
import { AssetDetailScreen } from "./AssetDetail";
import { OptionsExplorerScreen } from "./OptionsExplorer";
import { PortfolioScreen } from "./Portfolio";
import { SettingsScreen } from "./Settings";
import { AdminScreen } from "./AdminScreen";

export const App: React.FC = () => {
  const { currentScreen, setCurrentScreen } = useAppState();
  const { user, setUser, logout } = useAuth();
  const [onboardingComplete, setOnboardingComplete] = useState(true);
  const [authChecked, setAuthChecked] = useState(false);
  const [hasUsers, setHasUsers] = useState(false);

  useEffect(() => {
    if (typeof window.tradingApp?.invoke !== "function") {
      setAuthChecked(true);
      setUser({ id: "dev", email: "dev@local", role: "admin" });
      return;
    }
    (async () => {
      try {
        const res = await window.tradingApp.invoke("auth:status");
        if (res.ok && res.data) {
          const data = res.data as { hasUsers?: boolean };
          setHasUsers(!!data.hasUsers);
        } else {
          setHasUsers(true);
        }
        const raw = localStorage.getItem("trading-app.remember-me");
        if (raw) {
          try {
            const stored = JSON.parse(raw) as { id?: string };
            if (stored?.id) {
              const check = await window.tradingApp.invoke("auth:checkRemembered", { userId: stored.id });
              if (check.ok && check.data) {
                const user = (check.data as { user: { id: string; email: string; role: "admin" | "user" } }).user;
                setUser(user);
                setCurrentScreen("dashboard");
                setAuthChecked(true);
                return;
              }
            }
          } catch {
            localStorage.removeItem("trading-app.remember-me");
          }
        }
      } catch {
        setHasUsers(true);
      } finally {
        setAuthChecked(true);
      }
    })();
  }, [setUser, setCurrentScreen]);

  const REMEMBER_KEY = "trading-app.remember-me";

  const handleLogin = useCallback(
    (u: { id: string; email: string; role: "admin" | "user" }, rememberMe?: boolean) => {
      setUser(u);
      setCurrentScreen("dashboard");
      try {
        if (rememberMe) {
          localStorage.setItem("trading-app.remember-me", JSON.stringify({ id: u.id, email: u.email, role: u.role }));
        } else {
          localStorage.removeItem("trading-app.remember-me");
        }
      } catch {
        // ignore
      }
    },
    [setUser, setCurrentScreen]
  );

  const handleNavigate = useCallback(
    (screen: ScreenId) => {
      setCurrentScreen(screen);
    },
    [setCurrentScreen]
  );

  if (!authChecked) {
    return (
      <div style={{ padding: 32, color: "#94a3b8" }}>Loading…</div>
    );
  }

  if (!user) {
    return (
      <AuthScreen
        hasUsers={hasUsers}
        onLogin={handleLogin}
        onSignup={handleLogin}
      />
    );
  }

  if (!onboardingComplete) {
    return (
      <OnboardingScreen
        onComplete={() => {
          setOnboardingComplete(true);
        }}
      />
    );
  }

  const renderScreen = () => {
    switch (currentScreen) {
      case "dashboard":
        return <DashboardScreen />;
      case "onboarding":
        return (
          <OnboardingScreen
            onComplete={() => {
              setOnboardingComplete(true);
              setCurrentScreen("dashboard");
            }}
          />
        );
      case "asset":
        return <AssetDetailScreen />;
      case "options":
        return <OptionsExplorerScreen />;
      case "portfolio":
        return <PortfolioScreen />;
      case "settings":
        return <SettingsScreen />;
      case "admin":
        return <AdminScreen />;
      default:
        return <DashboardScreen />;
    }
  };

  return (
    <ErrorBoundary>
      <div style={{ height: "100%", minHeight: "100vh", display: "flex", flexDirection: "column", background: "#0b0f1a" }}>
        <Layout
          currentScreen={currentScreen}
          onNavigate={handleNavigate}
          onLogout={() => {
            logout();
            try {
              localStorage.removeItem("trading-app.remember-me");
            } catch {
              // ignore
            }
          }}
          currentUser={user}
        >
          {renderScreen()}
        </Layout>
      </div>
    </ErrorBoundary>
  );
};
