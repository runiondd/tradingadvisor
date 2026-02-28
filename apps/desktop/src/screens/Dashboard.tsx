import React, { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { useAppState } from "../context/AppState";

interface Position {
  id: string;
  accountId: string;
  symbol: string;
  quantity: number;
  positionType: string;
  averagePrice: number;
  rawJson?: string | null;
}

interface Account {
  id: string;
  name: string;
  broker: string;
}

interface FidelityData {
  accountNumber?: string;
  accountName?: string;
  symbol?: string;
  description?: string;
  quantity?: number;
  lastPrice?: string;
  lastPriceChange?: string;
  currentValue?: string;
  todayGainLossDollar?: string;
  todayGainLossPercent?: string;
  totalGainLossDollar?: string;
  totalGainLossPercent?: string;
  percentOfAccount?: string;
  costBasisTotal?: string;
  averageCostBasis?: string;
  type?: string;
}

function parseFidelity(rawJson: string | null | undefined): FidelityData | null {
  if (!rawJson) return null;
  try {
    return JSON.parse(rawJson) as FidelityData;
  } catch {
    return null;
  }
}

function positionCost(p: Position): number {
  return p.quantity * p.averagePrice;
}

function formatMoney(n: number): string {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** TradingView-style symbol for widget (NASDAQ:AAPL, etc.) */
function toTvSymbol(symbol: string): string {
  const s = symbol.trim().toUpperCase();
  if (!s) return "NASDAQ:AAPL";
  const nyseEtfs = ["SPY", "QQQ", "IWM", "DIA", "GLD", "SLV", "TLT", "HYG", "LQD", "VOO", "VTI"];
  if (nyseEtfs.includes(s)) return `AMEX:${s}`;
  return `NASDAQ:${s}`;
}

const TICKER_TAPE_SCRIPT = "https://s3.tradingview.com/external-embedding/embed-widget-ticker-tape.js";

export const DashboardScreen: React.FC = () => {
  const { watchList, setActiveSymbol, setCurrentScreen, removeFromWatchlist } = useAppState();
  const [positions, setPositions] = useState<Position[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [watchQuotes, setWatchQuotes] = useState<Record<string, { last: number; prevClose?: number; change?: number; changePerc?: number }>>({});
  const [watchQuotesLoading, setWatchQuotesLoading] = useState(false);
  const [companyNames, setCompanyNames] = useState<Record<string, string>>({});
  const tickerTapeRef = useRef<HTMLDivElement>(null);

  const hasIpc = typeof window.tradingApp?.invoke === "function";

  const loadPortfolio = useCallback(async () => {
    if (!hasIpc) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await window.tradingApp.invoke("portfolio:list");
      if (res.ok && res.data) {
        const data = res.data as { positions?: Position[]; accounts?: Account[] } | Position[];
        if (Array.isArray(data)) {
          setPositions(data);
          setAccounts([]);
        } else {
          setPositions(Array.isArray(data.positions) ? data.positions : []);
          setAccounts(Array.isArray(data.accounts) ? data.accounts : []);
        }
      } else {
        setPositions([]);
        setAccounts([]);
        setError(res.error ?? "Failed to load portfolio.");
      }
    } catch (e) {
      setPositions([]);
      setAccounts([]);
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [hasIpc]);

  useEffect(() => {
    void loadPortfolio();
  }, [loadPortfolio]);

  useEffect(() => {
    if (!hasIpc || watchList.length === 0) {
      setWatchQuotes({});
      return;
    }
    setWatchQuotesLoading(true);
    const next: Record<string, { last: number; prevClose?: number; change?: number; changePerc?: number }> = {};
    (async () => {
      for (const sym of watchList) {
        try {
          const res = await window.tradingApp.invoke("market:quote", { symbol: sym });
          const data = res.ok && res.data ? (res.data as { last?: number; prevClose?: number; change?: number; changePerc?: number }) : null;
          if (data && typeof data.last === "number") {
            next[sym] = {
              last: data.last,
              prevClose: typeof data.prevClose === "number" ? data.prevClose : undefined,
              change: typeof data.change === "number" ? data.change : undefined,
              changePerc: typeof data.changePerc === "number" ? data.changePerc : undefined
            };
          }
        } catch {
          // skip
        }
        await new Promise((r) => setTimeout(r, 180));
      }
      setWatchQuotes((prev) => ({ ...prev, ...next }));
      setWatchQuotesLoading(false);
    })();
  }, [hasIpc, watchList]);

  useEffect(() => {
    if (!hasIpc || watchList.length === 0) {
      setCompanyNames({});
      return;
    }
    const next: Record<string, string> = {};
    (async () => {
      for (const sym of watchList) {
        try {
          const res = await window.tradingApp.invoke("market:tickerDetails", { symbol: sym });
          if (res.ok && res.data && typeof (res.data as { name?: string }).name === "string") {
            next[sym] = (res.data as { name: string }).name;
          }
        } catch {
          // skip
        }
        await new Promise((r) => setTimeout(r, 220));
      }
      setCompanyNames((prev) => ({ ...prev, ...next }));
    })();
  }, [hasIpc, watchList]);

  const tickerTapeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const container = tickerTapeRef.current;
    const symbols = watchList.slice(0, 20);
    if (!container || symbols.length === 0) return;

    if (tickerTapeTimeoutRef.current) {
      clearTimeout(tickerTapeTimeoutRef.current);
      tickerTapeTimeoutRef.current = null;
    }

    const inject = () => {
      if (!container.isConnected) return;
      const widgetDiv = document.createElement("div");
      widgetDiv.className = "tradingview-widget-container__widget";
      widgetDiv.style.cssText = "height: 46px; width: 100%;";
      const script = document.createElement("script");
      script.src = TICKER_TAPE_SCRIPT;
      script.type = "text/javascript";
      script.async = true;
      script.innerHTML = JSON.stringify({
        symbols: symbols.map((s) => ({ description: s, proName: toTvSymbol(s) })),
        showSymbolLogo: true,
        isTransparent: true,
        displayMode: "adaptive",
        colorTheme: "dark",
        locale: "en",
        width: "100%",
        height: 46
      });
      container.innerHTML = "";
      container.appendChild(widgetDiv);
      container.appendChild(script);
    };

    // Defer injection so we don't inject if user navigates away quickly.
    // If container already has content (re-run), wait longer so TradingView script can finish before we clear.
    const delay = container.innerHTML ? 200 : 50;
    tickerTapeTimeoutRef.current = setTimeout(inject, delay);
    return () => {
      if (tickerTapeTimeoutRef.current) {
        clearTimeout(tickerTapeTimeoutRef.current);
        tickerTapeTimeoutRef.current = null;
      }
      // Delay clear on unmount so TradingView script can finish; avoid clearing if container is gone.
      if (container?.isConnected) {
        tickerTapeTimeoutRef.current = setTimeout(() => {
          tickerTapeTimeoutRef.current = null;
          if (container?.isConnected) {
            container.innerHTML = "";
          }
        }, 150);
      }
    };
  }, [watchList]);

  const hasFidelity = useMemo(
    () => positions.some((p) => parseFidelity(p.rawJson) != null),
    [positions]
  );

  const summary = useMemo(() => {
    if (!positions.length) {
      return null;
    }
    const accountCount = new Set(positions.map((p) => p.accountId)).size;
    const positionCount = positions.length;

    if (hasFidelity) {
      const parseMoney = (v: string | number | undefined): number => {
        const raw = typeof v === "number" ? String(v) : v ?? "";
        const n = Number(raw.replace(/[$,]/g, ""));
        return Number.isFinite(n) ? n : 0;
      };
      let totalCost = 0;
      let totalValue = 0;
      for (const p of positions) {
        const f = parseFidelity(p.rawJson);
        if (!f) continue;
        totalCost += parseMoney(f.costBasisTotal);
        totalValue += parseMoney(f.currentValue);
      }
      if (!totalCost && !totalValue) {
        return { accountCount, positionCount, totalCost: 0, totalValue: 0, totalPnl: 0, totalPct: null as number | null };
      }
      const totalPnl = totalValue - totalCost;
      const totalPct = totalCost ? (totalPnl / totalCost) * 100 : null;
      return { accountCount, positionCount, totalCost, totalValue, totalPnl, totalPct };
    }

    const totalCost = positions.reduce((sum, p) => sum + positionCost(p), 0);
    const totalValue = totalCost; // without live quotes, treat cost as proxy
    return {
      accountCount,
      positionCount,
      totalCost,
      totalValue,
      totalPnl: 0,
      totalPct: 0
    };
  }, [positions, hasFidelity]);

  const hasPortfolio = !!summary && summary.positionCount > 0;

  return (
    <div>
      <h1 style={{ marginBottom: 8 }}>Dashboard</h1>
      <p style={{ color: "#94a3b8", marginBottom: 24 }}>
        At-a-glance view of your accounts, performance, and key actions.
      </p>

      {loading && (
        <p style={{ color: "#64748b", marginBottom: 24 }}>Loading portfolio…</p>
      )}

      {error && (
        <div
          style={{
            padding: 12,
            borderRadius: 8,
            background: "#7f1d1d",
            color: "#fecaca",
            marginBottom: 16
          }}
        >
          {error}
        </div>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 2fr) minmax(0, 1.2fr)",
          gap: 16,
          marginBottom: 16,
          alignItems: "stretch"
        }}
      >
        <section
          style={{
            padding: 20,
            borderRadius: 16,
            background: "radial-gradient(circle at top, #1e293b 0%, #020617 70%)",
            border: "1px solid #475569",
            boxShadow: "0 12px 30px rgba(15,23,42,0.8)",
            minHeight: 140
          }}
        >
          <div style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.12em", color: "#64748b", marginBottom: 4 }}>
            Overall
          </div>
          <h2 style={{ fontSize: 22, margin: 0, color: "#e2e8f0" }}>All accounts</h2>
          {hasPortfolio ? (
            <>
              <div style={{ marginTop: 8, fontSize: 13, color: "#94a3b8" }}>
                {summary?.accountCount ?? 0} account{summary && summary.accountCount === 1 ? "" : "s"} ·{" "}
                {summary?.positionCount ?? 0} position{summary && summary.positionCount === 1 ? "" : "s"}
              </div>
              <div style={{ marginTop: 12, fontSize: 15, color: "#cbd5f5" }}>
                <span style={{ opacity: 0.85 }}>Cost</span>: ${formatMoney(summary!.totalCost)}{" "}
                <span style={{ margin: "0 8px", opacity: 0.4 }}>•</span>
                <span style={{ opacity: 0.85 }}>Value</span>: ${formatMoney(summary!.totalValue)}{" "}
                <span style={{ margin: "0 8px", opacity: 0.4 }}>•</span>
                <span style={{ opacity: 0.85 }}>P&amp;L</span>:{" "}
                <span
                  style={{
                    fontWeight: 700,
                    color: (summary!.totalPnl ?? 0) >= 0 ? "#22c55e" : "#ef4444"
                  }}
                >
                  ${formatMoney(summary!.totalPnl ?? 0)}
                  {summary!.totalPct != null
                    ? ` (${summary!.totalPct >= 0 ? "+" : ""}${summary!.totalPct.toFixed(1)}%)`
                    : ""}
                </span>
              </div>
            </>
          ) : (
            <p style={{ marginTop: 12, color: "#94a3b8", fontSize: 14 }}>
              No positions yet. Go to the Portfolio tab to import your Fidelity CSV or a simple positions file.
            </p>
          )}
        </section>

        <section
          style={{
            padding: 16,
            borderRadius: 12,
            background: "#0f172a",
            border: "1px solid #1e293b",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            minHeight: 140
          }}
        >
          <div>
            <h2 style={{ fontSize: 14, margin: "0 0 8px", color: "#e2e8f0" }}>Quick actions</h2>
            <p style={{ margin: 0, color: "#94a3b8", fontSize: 13 }}>
              Jump into Portfolio to review positions or open Research to analyze a symbol.
            </p>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
            <a
              href="#portfolio"
              onClick={(e) => {
                e.preventDefault();
                if (typeof window !== "undefined") {
                  // Notify Layout via hash; AppState controls actual navigation.
                  window.location.hash = "#portfolio";
                }
              }}
              style={{
                padding: "8px 14px",
                borderRadius: 999,
                border: "1px solid #3b82f6",
                background: "rgba(59,130,246,0.1)",
                color: "#bfdbfe",
                fontSize: 13,
                textDecoration: "none",
                cursor: "pointer"
              }}
            >
              View portfolio
            </a>
            <a
              href="#asset"
              onClick={(e) => {
                e.preventDefault();
                if (typeof window !== "undefined") {
                  window.location.hash = "#asset";
                }
              }}
              style={{
                padding: "8px 14px",
                borderRadius: 999,
                border: "1px solid #334155",
                background: "rgba(15,23,42,0.9)",
                color: "#e2e8f0",
                fontSize: 13,
                textDecoration: "none",
                cursor: "pointer"
              }}
            >
              Open Research
            </a>
          </div>
        </section>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 16
        }}
      >
        <section
          style={{
            padding: 16,
            background: "#0f172a",
            borderRadius: 12,
            border: "1px solid #1e293b"
          }}
        >
          <h2 style={{ fontSize: 14, marginBottom: 8, color: "#94a3b8" }}>Accounts</h2>
          {hasPortfolio ? (
            <p style={{ margin: 0, color: "#e2e8f0", fontSize: 14 }}>
              {summary?.accountCount ?? 0} account{summary && summary.accountCount === 1 ? "" : "s"} connected.
            </p>
          ) : (
            <p style={{ margin: 0, color: "#64748b", fontSize: 13 }}>
              Import a Fidelity CSV in Portfolio to see account-level analytics here.
            </p>
          )}
        </section>

        <section
          style={{
            padding: 0,
            background: "#131722",
            borderRadius: 12,
            border: "1px solid #2a2e39",
            overflow: "hidden",
            gridColumn: "1 / -1"
          }}
        >
          <div
            style={{
              padding: "12px 16px",
              borderBottom: "1px solid #2a2e39",
              background: "#1e222d",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: 8
            }}
          >
            <h2 style={{ fontSize: 14, margin: 0, color: "#d1d4dc", fontWeight: 600 }}>Watch list</h2>
            <span style={{ fontSize: 12, color: "#787b86" }}>
              Add symbols in the sidebar. Click a row to open Research.
            </span>
          </div>
          {watchList.length > 0 ? (
            <>
              <div
                ref={tickerTapeRef}
                className="tradingview-widget-container"
                style={{
                  height: 46,
                  minHeight: 46,
                  width: "100%",
                  background: "transparent",
                  margin: "8px 0 0"
                }}
              />
              <div style={{ overflowX: "auto" }}>
                <table
                  style={{
                    width: "100%",
                    borderCollapse: "collapse",
                    fontSize: 13
                  }}
                  aria-label="Watch list quotes"
                >
                  <thead>
                    <tr style={{ borderBottom: "1px solid #2a2e39", background: "#1e222d" }}>
                      <th style={{ padding: "10px 16px", textAlign: "left", color: "#787b86", fontWeight: 600, width: 140, maxWidth: 180 }}>
                        Symbol
                      </th>
                      <th style={{ padding: "10px 16px", textAlign: "right", color: "#787b86", fontWeight: 600 }}>
                        Last
                      </th>
                      <th style={{ padding: "10px 16px", textAlign: "right", color: "#787b86", fontWeight: 600 }}>
                        Chg
                      </th>
                      <th style={{ padding: "10px 16px", textAlign: "right", color: "#787b86", fontWeight: 600 }}>
                        Chg%
                      </th>
                      <th style={{ padding: "10px 16px", width: 40 }} />
                    </tr>
                  </thead>
                  <tbody>
                    {watchList.map((sym) => {
                      const q = watchQuotes[sym];
                      const chg = q?.change ?? (q?.prevClose != null && q.prevClose !== 0 ? q.last - q.prevClose : null);
                      const chgPct = q?.changePerc ?? (q?.prevClose != null && q.prevClose !== 0 ? ((q.last - q.prevClose) / q.prevClose) * 100 : null);
                      const isUp = chg != null && chg > 0;
                      const isDown = chg != null && chg < 0;
                      const chgColor = isUp ? "#26a69a" : isDown ? "#ef5350" : "#787b86";
                      const chgStr = chg != null ? `${chg >= 0 ? "+" : ""}${chg.toFixed(2)}` : "—";
                      const chgPctStr = chgPct != null ? `${chgPct >= 0 ? "+" : ""}${chgPct.toFixed(2)}%` : "—";
                      return (
                        <tr
                          key={sym}
                          role="button"
                          tabIndex={0}
                          onClick={() => {
                            setActiveSymbol(sym);
                            setCurrentScreen("asset");
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              setActiveSymbol(sym);
                              setCurrentScreen("asset");
                            }
                          }}
                          style={{
                            borderBottom: "1px solid #2a2e39",
                            cursor: "pointer",
                            background: "transparent"
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = "#2a2e39";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = "transparent";
                          }}
                        >
                          <td style={{ padding: "10px 16px", color: "#d1d4dc", fontWeight: 500, width: 140, maxWidth: 180, verticalAlign: "top" }}>
                            <div style={{ lineHeight: 1.3 }}>
                              <div style={{ fontWeight: 600 }}>{sym}</div>
                              {companyNames[sym] && (
                                <div style={{ fontSize: 11, color: "#787b86", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={companyNames[sym]}>
                                  {companyNames[sym]}
                                </div>
                              )}
                            </div>
                          </td>
                          <td style={{ padding: "10px 16px", textAlign: "right", color: "#d1d4dc" }}>
                            {watchQuotesLoading && !q ? "—" : q ? `$${q.last.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—"}
                          </td>
                          <td style={{ padding: "10px 16px", textAlign: "right", color: chgColor, fontWeight: 500 }}>
                            {watchQuotesLoading && !q ? "—" : chgStr}
                          </td>
                          <td style={{ padding: "10px 16px", textAlign: "right", color: chgColor, fontWeight: 500 }}>
                            {watchQuotesLoading && !q ? "—" : chgPctStr}
                          </td>
                          <td style={{ padding: "8px" }}>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                removeFromWatchlist(sym);
                              }}
                              title="Remove from watch list"
                              style={{
                                padding: "4px 8px",
                                fontSize: 11,
                                borderRadius: 4,
                                border: "none",
                                background: "transparent",
                                color: "#787b86",
                                cursor: "pointer"
                              }}
                            >
                              −
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <p style={{ margin: 0, padding: 24, color: "#787b86", fontSize: 13, textAlign: "center" }}>
              Add symbols in the sidebar to see them here. Then go to Research or Options to load charts and chains.
            </p>
          )}
        </section>

        <section
          style={{
            padding: 16,
            background: "#0f172a",
            borderRadius: 12,
            border: "1px solid #1e293b"
          }}
        >
          <h2 style={{ fontSize: 14, marginBottom: 8, color: "#94a3b8" }}>Data status</h2>
          <ul style={{ margin: 0, paddingLeft: 18, color: "#94a3b8", fontSize: 13 }}>
            <li>Options &amp; Research use your Polygon API key (set in Settings).</li>
            <li>Portfolio uses local CSV imports and never uploads your data.</li>
            {hasFidelity && <li>Fidelity CSV detected – performance uses Fidelity cost and value fields.</li>}
          </ul>
        </section>
      </div>
    </div>
  );
};
