import React, { createContext, useCallback, useContext, useMemo, useState } from "react";

export type ScreenId =
  | "dashboard"
  | "onboarding"
  | "asset"
  | "options"
  | "portfolio"
  | "settings"
  | "admin";

const STORAGE_KEY = "trading-app.app-state";

interface PersistedState {
  watchList: string[];
  activeSymbol: string | null;
  currentScreen: ScreenId;
}

function loadPersisted(): PersistedState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<PersistedState>;
      return {
        watchList: Array.isArray(parsed.watchList) ? parsed.watchList : [],
        activeSymbol:
          typeof parsed.activeSymbol === "string" && parsed.activeSymbol.trim()
            ? parsed.activeSymbol.trim().toUpperCase()
            : null,
        currentScreen:
          parsed.currentScreen && ["dashboard", "asset", "options", "portfolio", "settings", "admin", "onboarding"].includes(parsed.currentScreen)
            ? (parsed.currentScreen as ScreenId)
            : "dashboard"
      };
    }
  } catch {
    // ignore
  }
  return {
    watchList: [],
    activeSymbol: null,
    currentScreen: "dashboard"
  };
}

function savePersisted(state: PersistedState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
}

interface AppStateContextValue extends PersistedState {
  setActiveSymbol: (symbol: string | null) => void;
  setCurrentScreen: (screen: ScreenId) => void;
  addToWatchlist: (symbol: string) => void;
  removeFromWatchlist: (symbol: string) => void;
  setWatchList: (list: string[]) => void;
}

const AppStateContext = createContext<AppStateContextValue | null>(null);

export function AppStateProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<PersistedState>(loadPersisted);

  const persist = useCallback((getNext: (prev: PersistedState) => PersistedState) => {
    setState((prev) => {
      const next = getNext(prev);
      savePersisted(next);
      return next;
    });
  }, []);

  const setActiveSymbol = useCallback(
    (symbol: string | null) => {
      const s = symbol?.trim().toUpperCase() ?? null;
      persist((prev) => ({ ...prev, activeSymbol: s || null }));
    },
    [persist]
  );

  const setCurrentScreen = useCallback(
    (screen: ScreenId) => {
      persist((prev) => ({ ...prev, currentScreen: screen }));
    },
    [persist]
  );

  const addToWatchlist = useCallback(
    (symbol: string) => {
      const s = symbol.trim().toUpperCase();
      if (!s) return;
      persist((prev) => {
        if (prev.watchList.includes(s)) return prev;
        const watchList = [...prev.watchList, s].sort((a, b) => a.localeCompare(b));
        return { ...prev, watchList };
      });
    },
    [persist]
  );

  const removeFromWatchlist = useCallback(
    (symbol: string) => {
      const s = symbol.trim().toUpperCase();
      persist((prev) => {
        const watchList = prev.watchList.filter((t) => t !== s);
        const activeSymbol = prev.activeSymbol === s ? (watchList[0] ?? null) : prev.activeSymbol;
        return { ...prev, watchList, activeSymbol };
      });
    },
    [persist]
  );

  const setWatchList = useCallback(
    (list: string[]) => {
      const uniq = [...new Set(list.map((t) => t.trim().toUpperCase()).filter(Boolean))].sort((a, b) =>
        a.localeCompare(b)
      );
      persist((prev) => {
        const activeSymbol =
          prev.activeSymbol && uniq.includes(prev.activeSymbol) ? prev.activeSymbol : uniq[0] ?? null;
        return { ...prev, watchList: uniq, activeSymbol };
      });
    },
    [persist]
  );

  const value = useMemo<AppStateContextValue>(
    () => ({
      ...state,
      setActiveSymbol,
      setCurrentScreen,
      addToWatchlist,
      removeFromWatchlist,
      setWatchList
    }),
    [state, setActiveSymbol, setCurrentScreen, addToWatchlist, removeFromWatchlist, setWatchList]
  );

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

export function useAppState(): AppStateContextValue {
  const ctx = useContext(AppStateContext);
  if (!ctx) throw new Error("useAppState must be used within AppStateProvider");
  return ctx;
}
