import React, { useState, useCallback, useEffect, useMemo } from "react";
import { underlyingAssetName, underlyingTicker } from "../utils/underlyingAssetNames";

/** Fidelity CSV row fields stored in position.rawJson */
export interface FidelityData {
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

type SortKey = "account" | "quantity" | "averagePrice" | "value";
type FidelitySortKey =
  | "accountNumber"
  | "accountName"
  | "symbol"
  | "description"
  | "quantity"
  | "lastPrice"
  | "lastPriceChange"
  | "currentValue"
  | "todayGainLossDollar"
  | "todayGainLossPercent"
  | "totalGainLossDollar"
  | "totalGainLossPercent"
  | "percentOfAccount"
  | "costBasisTotal"
  | "averageCostBasis"
  | "type";
type SortDir = "asc" | "desc";

function positionValue(p: Position): number {
  return p.quantity * p.averagePrice;
}

function formatMoney(n: number): string {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function parseFidelity(rawJson: string | null | undefined): FidelityData | null {
  if (!rawJson) return null;
  try {
    return JSON.parse(rawJson) as FidelityData;
  } catch {
    return null;
  }
}

export const PortfolioScreen: React.FC = () => {
  const [positions, setPositions] = useState<Position[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [pricesLoading, setPricesLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState<string | null>(null);
  /** Per-account table sort (keyed by accountId) */
  const [accountSort, setAccountSort] = useState<Record<string, { sortKey: SortKey | FidelitySortKey; sortDir: SortDir }>>({});

  const loadPositions = useCallback(async () => {
    if (typeof window.tradingApp?.invoke !== "function") {
      setLoading(false);
      return;
    }
    setLoading(true);
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
      }
    } catch {
      setPositions([]);
      setAccounts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPositions();
  }, [loadPositions]);

  useEffect(() => {
    if (!positions.length || typeof window.tradingApp?.invoke !== "function") return;
    const tickers = Array.from(new Set(positions.map((p) => underlyingTicker(p.symbol)).filter(Boolean)));
    if (tickers.length === 0) return;
    setPricesLoading(true);
    const next: Record<string, number> = {};
    (async () => {
      for (const ticker of tickers) {
        try {
          const res = await window.tradingApp.invoke("market:quote", { symbol: ticker });
          if (res.ok && res.data && typeof (res.data as { last?: number }).last === "number") next[ticker] = (res.data as { last: number }).last;
        } catch {
          // skip
        }
        await new Promise((r) => setTimeout(r, 200));
      }
      setPrices((prev) => ({ ...prev, ...next }));
      setPricesLoading(false);
    })();
  }, [positions]);

  const hasIpc = typeof window.tradingApp?.invoke === "function";

  const handleImportClick = useCallback(async () => {
    if (!hasIpc) return;
    setImporting(true);
    setImportError(null);
    setImportSuccess(null);
    try {
      const res = await window.tradingApp.invoke("portfolio:selectAndImportCsv");
      if (res.ok) {
        if (res.data?.canceled) return;
        const count = (res.data as { imported?: number })?.imported ?? 0;
        await loadPositions();
        setImportSuccess(count === 0 ? "No valid rows found in file." : `Imported ${count} position${count === 1 ? "" : "s"}. They appear in the table below.`);
      } else {
        setImportError(res.error ?? "Import failed");
      }
    } catch (err) {
      setImportError(String(err));
    } finally {
      setImporting(false);
    }
  }, [hasIpc, loadPositions]);

  const accountByName = useMemo(() => {
    const map = new Map<string, Account>();
    for (const a of accounts) map.set(a.id, a);
    return map;
  }, [accounts]);

  const hasFidelity = useMemo(
    () => positions.some((p) => parseFidelity(p.rawJson) != null),
    [positions]
  );

  const overallTotals = useMemo(() => {
    if (!positions.length) return null;
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
      if (!totalCost && !totalValue) return null;
      const totalPnl = totalValue - totalCost;
      const totalPct = totalCost ? (totalPnl / totalCost) * 100 : null;
      return { totalCost, totalValue, totalPnl, totalPct };
    }
    // Fallback for non-Fidelity: use averagePrice and live prices
    const totalCost = positions.reduce((s, p) => s + positionValue(p), 0);
    const totalValue = positions.reduce((s, p) => {
      const t = underlyingTicker(p.symbol);
      const isEquity = t === p.symbol;
      const last = isEquity && t ? prices[t] : undefined;
      return s + (last != null ? p.quantity * last : 0);
    }, 0);
    if (!totalCost && !totalValue) return null;
    const totalPnl = totalValue - totalCost;
    const totalPct = totalCost ? (totalPnl / totalCost) * 100 : null;
    return { totalCost, totalValue, totalPnl, totalPct };
  }, [positions, prices, hasFidelity]);

  const groupedByAccount = useMemo(() => {
    const byAccount = new Map<string, { positions: Position[]; accountName: string }>();
    for (const p of positions) {
      const f = parseFidelity(p.rawJson);
      const accountKey = (f?.accountName ? String(f.accountName).trim() : null) || p.accountId;
      const displayName = (f?.accountName ? String(f.accountName).trim() : null) || (accountByName.get(p.accountId)?.name ?? p.accountId);
      const existing = byAccount.get(accountKey);
      if (existing) {
        existing.positions.push(p);
      } else {
        byAccount.set(accountKey, { positions: [p], accountName: displayName || accountKey });
      }
    }
    return Array.from(byAccount.entries())
      .map(([accountId, { positions: list, accountName }]) => ({ accountId, positions: list, accountName: accountName || accountId }))
      .sort((a, b) => (a.accountName ?? a.accountId).localeCompare(b.accountName ?? b.accountId));
  }, [positions, accountByName]);

  const getAccountSort = useCallback(
    (accountId: string): { sortKey: SortKey | FidelitySortKey; sortDir: SortDir } => {
      return accountSort[accountId] ?? { sortKey: hasFidelity ? "symbol" : "account", sortDir: "asc" };
    },
    [accountSort, hasFidelity]
  );

  const handleAccountSortClick = useCallback(
    (accountId: string, key: SortKey | FidelitySortKey) => {
      const current = getAccountSort(accountId);
      const sortDir = current.sortKey === key ? (current.sortDir === "asc" ? "desc" : "asc") : "asc";
      setAccountSort((prev) => ({ ...prev, [accountId]: { sortKey: key, sortDir } }));
    },
    [getAccountSort]
  );

  function getFidelitySortValue(p: Position, key: FidelitySortKey): string | number {
    const f = parseFidelity(p.rawJson);
    const str = (k: keyof FidelityData): string => (f && (f[k] != null) ? String(f[k]).trim() : "");
    const numFromStr = (s: string): number => parseFloat(String(s).replace(/[$,%+]/g, "")) || 0;
    switch (key) {
      case "accountNumber":
        return str("accountNumber");
      case "accountName":
        return str("accountName");
      case "symbol":
        return p.symbol;
      case "description":
        return str("description");
      case "quantity":
        return p.quantity;
      case "lastPrice":
        return str("lastPrice");
      case "lastPriceChange":
        return str("lastPriceChange");
      case "currentValue":
        return str("currentValue");
      case "todayGainLossDollar":
        return numFromStr(str("todayGainLossDollar"));
      case "todayGainLossPercent":
        return numFromStr(str("todayGainLossPercent"));
      case "totalGainLossDollar":
        return numFromStr(str("totalGainLossDollar"));
      case "totalGainLossPercent":
        return numFromStr(str("totalGainLossPercent"));
      case "percentOfAccount":
        return str("percentOfAccount");
      case "costBasisTotal":
        return str("costBasisTotal");
      case "averageCostBasis":
        return str("averageCostBasis");
      case "type":
        return str("type");
      default:
        return "";
    }
  }

  function getBasicSortValue(p: Position, key: SortKey): string | number {
    switch (key) {
      case "account":
        return accountByName.get(p.accountId)?.name ?? p.accountId;
      case "quantity":
        return p.quantity;
      case "averagePrice":
        return p.averagePrice;
      case "value":
        return positionValue(p);
      default:
        return accountByName.get(p.accountId)?.name ?? p.accountId;
    }
  }

  function sortPositions(list: Position[], accountId: string): Position[] {
    const { sortKey: key, sortDir: dir } = getAccountSort(accountId);
    const isFidelityKey = (k: string): k is FidelitySortKey =>
      ["accountNumber", "accountName", "symbol", "description", "quantity", "lastPrice", "lastPriceChange", "currentValue", "todayGainLossDollar", "todayGainLossPercent", "totalGainLossDollar", "totalGainLossPercent", "percentOfAccount", "costBasisTotal", "averageCostBasis", "type"].includes(k);
    const getVal = (p: Position): string | number =>
      hasFidelity && isFidelityKey(key) ? getFidelitySortValue(p, key) : getBasicSortValue(p, key as SortKey);
    return [...list].sort((a, b) => {
      const va = getVal(a);
      const vb = getVal(b);
      let c = 0;
      if (typeof va === "string" && typeof vb === "string") c = va.localeCompare(vb);
      else if (typeof va === "number" && typeof vb === "number") c = va - vb;
      return dir === "asc" ? c : -c;
    });
  }

  const SortHeader: React.FC<{
    label: string;
    column: SortKey | FidelitySortKey;
    accountId: string;
    align?: "left" | "right";
  }> = ({ label, column, accountId, align = "left" }) => {
    const { sortKey: sk, sortDir: sd } = getAccountSort(accountId);
    return (
      <th
        role="button"
        tabIndex={0}
        onClick={() => handleAccountSortClick(accountId, column)}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && handleAccountSortClick(accountId, column)}
        style={{
          textAlign: align,
          padding: "8px 12px",
          color: "#94a3b8",
          cursor: "pointer",
          userSelect: "none"
        }}
        title={`Sort by ${label} (click to toggle)`}
      >
        {label} {sk === column ? (sd === "asc" ? "↑" : "↓") : ""}
      </th>
    );
  };

  return (
    <div>
      <h1 style={{ marginBottom: 8 }}>Portfolio</h1>
      <p style={{ color: "#94a3b8", marginBottom: 24 }}>
        View positions and import via CSV for now (symbol, quantity, averagePrice). Fidelity account
        connection is planned for read-only sync.
      </p>

      {hasIpc && (
        <div style={{ marginBottom: 16 }}>
          <button
            type="button"
            onClick={handleImportClick}
            disabled={importing}
            style={{
              padding: "8px 16px",
              borderRadius: 6,
              border: "none",
              background: importing ? "#475569" : "#3b82f6",
              color: "#fff",
              cursor: importing ? "wait" : "pointer"
            }}
          >
            {importing ? "Importing…" : "Import CSV…"}
          </button>
          <span style={{ marginLeft: 8, fontSize: 12, color: "#64748b" }}>Fidelity brokerage CSV (all columns) or simple CSV (symbol, quantity, averagePrice)</span>
        </div>
      )}

      {importError && (
        <div style={{ padding: 12, background: "#7f1d1d", borderRadius: 8, color: "#fecaca", marginBottom: 16 }}>
          {importError}
        </div>
      )}

      {importSuccess && (
        <div style={{ padding: 12, background: "#14532d", borderRadius: 8, color: "#bbf7d0", marginBottom: 16 }}>
          {importSuccess}
        </div>
      )}

      {overallTotals && positions.length > 0 && !loading && (
        <div
          style={{
            margin: "0 auto 24px",
            padding: 20,
            borderRadius: 14,
            background: "radial-gradient(circle at top, #1e293b 0%, #020617 70%)",
            border: "1px solid #475569",
            maxWidth: 720,
            textAlign: "center",
            boxShadow: "0 12px 30px rgba(15,23,42,0.8)"
          }}
        >
          <div style={{ fontSize: 18, fontWeight: 700, color: "#e2e8f0", marginBottom: 6 }}>All accounts</div>
          <div style={{ fontSize: 16, color: "#cbd5f5" }}>
            <span style={{ opacity: 0.85 }}>Cost</span>: ${formatMoney(overallTotals.totalCost)}{" "}
            <span style={{ margin: "0 8px", opacity: 0.4 }}>•</span>
            <span style={{ opacity: 0.85 }}>Value</span>: ${formatMoney(overallTotals.totalValue)}{" "}
            <span style={{ margin: "0 8px", opacity: 0.4 }}>•</span>
            <span style={{ opacity: 0.85 }}>P&amp;L</span>:{" "}
            <span
              style={{
                fontWeight: 700,
                color: overallTotals.totalPnl >= 0 ? "#22c55e" : "#ef4444"
              }}
            >
              ${formatMoney(overallTotals.totalPnl)}
              {overallTotals.totalPct != null
                ? ` (${overallTotals.totalPct >= 0 ? "+" : ""}${overallTotals.totalPct.toFixed(1)}%)`
                : ""}
            </span>
          </div>
        </div>
      )}

      {loading ? (
        <p style={{ color: "#64748b" }}>Loading…</p>
      ) : positions.length === 0 ? (
        <div
          style={{
            padding: 24,
            border: "1px dashed #334155",
            borderRadius: 8,
            color: "#64748b",
            textAlign: "center"
          }}
        >
          {hasIpc
            ? 'No positions. Use "Import CSV" to add positions (columns: symbol, quantity, averagePrice). Fidelity link coming later.'
            : "Run the app in Electron to view and import positions."}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>
          <p style={{ fontSize: 13, color: "#94a3b8", margin: "0 0 8px" }}>
            Each account is in its own table below. The account name is the title above each table.
            {hasFidelity ? " Full Fidelity export columns are shown." : ""}
            {pricesLoading && !hasFidelity ? " Loading prices…" : ""}
          </p>
          {groupedByAccount
            .filter(({ positions }) => positions.length > 0)
            .map(({ accountId, accountName, positions: groupPositions }) => {
            const sorted = sortPositions(groupPositions, accountId);
            return (
              <section
                key={accountId}
                aria-label={`Account: ${accountName}`}
                style={{
                  border: "2px solid #475569",
                  borderRadius: 12,
                  background: "#0f172a",
                  overflow: "hidden",
                  boxShadow: "0 4px 12px rgba(0,0,0,0.3)"
                }}
              >
                <div
                  style={{
                    padding: "20px 24px",
                    borderBottom: "2px solid #475569",
                    background: "linear-gradient(180deg, #1e293b 0%, #334155 100%)"
                  }}
                >
                  <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", color: "#64748b", marginBottom: 6 }}>Account</div>
                  <h3 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "#f8fafc" }}>
                    {accountName}
                  </h3>
                  {groupPositions.length > 0 && (
                    <div style={{ fontSize: 16, color: "#e2e8f0", marginTop: 6, fontWeight: 600 }}>
                      {groupPositions.length} position{groupPositions.length === 1 ? "" : "s"}
                      {hasFidelity
                        ? (() => {
                            // Aggregate account-level performance from Fidelity fields
                            const parseMoney = (v: string | number | undefined): number => {
                              const raw = typeof v === "number" ? String(v) : v ?? "";
                              const n = Number(raw.replace(/[$,]/g, ""));
                              return Number.isFinite(n) ? n : 0;
                            };
                            let totalCost = 0;
                            let totalValue = 0;
                            for (const p of groupPositions) {
                              const f = parseFidelity(p.rawJson);
                              if (!f) continue;
                              totalCost += parseMoney(f.costBasisTotal);
                              totalValue += parseMoney(f.currentValue);
                            }
                            if (!totalCost && !totalValue) return null;
                            const totalPnl = totalValue - totalCost;
                            const totalPct = totalCost ? (totalPnl / totalCost) * 100 : null;
                            return (
                              <>
                                {" "}
                                · ${formatMoney(totalCost)} cost · ${formatMoney(totalValue)} value ·{" "}
                                <span style={{ color: totalPnl >= 0 ? "#22c55e" : "#ef4444" }}>
                                  ${formatMoney(totalPnl)}
                                  {totalPct != null ? ` (${totalPct >= 0 ? "+" : ""}${totalPct.toFixed(1)}%)` : ""}
                                </span>
                              </>
                            );
                          })()
                        : (() => {
                            const totalCost = groupPositions.reduce((s, p) => s + positionValue(p), 0);
                            const totalValue = groupPositions.reduce((s, p) => {
                              const t = underlyingTicker(p.symbol);
                              const isEquity = t === p.symbol;
                              const last = isEquity && t ? prices[t] : undefined;
                              return s + (last != null ? p.quantity * last : 0);
                            }, 0);
                            const totalPnl = totalValue !== 0 ? totalValue - totalCost : null;
                            return (
                              <>
                                {" "}
                                · ${formatMoney(totalCost)} cost
                                {totalValue !== 0 && (
                                  <>
                                    {" "}
                                    · ${formatMoney(totalValue)} value ·{" "}
                                    <span style={{ color: totalPnl != null && totalPnl >= 0 ? "#22c55e" : "#ef4444" }}>
                                      ${totalPnl != null ? formatMoney(totalPnl) : ""}
                                      {totalPnl != null ? `(${((totalPnl / totalCost) * 100).toFixed(1)}%)` : ""}
                                    </span>
                                  </>
                                )}
                              </>
                            );
                          })()}
                    </div>
                  )}
                </div>
                <div style={{ overflowX: "auto" }}>
                  {hasFidelity ? (
                    <table style={{ width: "100%", borderCollapse: "collapse" }} aria-label={`Positions for ${accountName}`}>
                      <thead>
                        <tr style={{ borderBottom: "1px solid #334155" }}>
                          <SortHeader label="Symbol" column="symbol" accountId={accountId} />
                          <SortHeader label="Description" column="description" accountId={accountId} />
                          <SortHeader label="Quantity" column="quantity" accountId={accountId} align="right" />
                          <SortHeader label="Last Price" column="lastPrice" accountId={accountId} align="right" />
                          <SortHeader label="Last Price Change" column="lastPriceChange" accountId={accountId} align="right" />
                          <SortHeader label="Current Value" column="currentValue" accountId={accountId} align="right" />
                          <SortHeader label="Today's G/L $" column="todayGainLossDollar" accountId={accountId} align="right" />
                          <SortHeader label="Today's G/L %" column="todayGainLossPercent" accountId={accountId} align="right" />
                          <SortHeader label="Total G/L $" column="totalGainLossDollar" accountId={accountId} align="right" />
                          <SortHeader label="Total G/L %" column="totalGainLossPercent" accountId={accountId} align="right" />
                          <SortHeader label="% Of Account" column="percentOfAccount" accountId={accountId} align="right" />
                          <SortHeader label="Cost Basis Total" column="costBasisTotal" accountId={accountId} align="right" />
                          <SortHeader label="Avg Cost Basis" column="averageCostBasis" accountId={accountId} align="right" />
                          <SortHeader label="Type" column="type" accountId={accountId} />
                        </tr>
                      </thead>
                      <tbody>
                        {sorted.map((p) => {
                          const f = parseFidelity(p.rawJson);
                          const cell = (v: string | number | undefined) => (v != null && String(v).trim() !== "" ? String(v) : "—");
                          return (
                            <tr key={p.id} style={{ borderBottom: "1px solid #1e293b" }}>
                              <td style={{ padding: "8px 12px" }}>{p.symbol}</td>
                              <td style={{ padding: "8px 12px" }}>{cell(f?.description)}</td>
                              <td style={{ padding: "8px 12px", textAlign: "right" }}>{p.quantity}</td>
                              <td style={{ padding: "8px 12px", textAlign: "right" }}>{cell(f?.lastPrice)}</td>
                              <td style={{ padding: "8px 12px", textAlign: "right" }}>{cell(f?.lastPriceChange)}</td>
                              <td style={{ padding: "8px 12px", textAlign: "right" }}>{cell(f?.currentValue)}</td>
                              <td style={{ padding: "8px 12px", textAlign: "right", color: f?.todayGainLossDollar?.startsWith("+") ? "#22c55e" : f?.todayGainLossDollar?.startsWith("-") ? "#ef4444" : undefined }}>{cell(f?.todayGainLossDollar)}</td>
                              <td style={{ padding: "8px 12px", textAlign: "right", color: f?.todayGainLossPercent?.startsWith("+") ? "#22c55e" : f?.todayGainLossPercent?.startsWith("-") ? "#ef4444" : undefined }}>{cell(f?.todayGainLossPercent)}</td>
                              <td style={{ padding: "8px 12px", textAlign: "right", color: f?.totalGainLossDollar?.startsWith("+") ? "#22c55e" : f?.totalGainLossDollar?.startsWith("-") ? "#ef4444" : undefined }}>{cell(f?.totalGainLossDollar)}</td>
                              <td style={{ padding: "8px 12px", textAlign: "right", color: f?.totalGainLossPercent?.startsWith("+") ? "#22c55e" : f?.totalGainLossPercent?.startsWith("-") ? "#ef4444" : undefined }}>{cell(f?.totalGainLossPercent)}</td>
                              <td style={{ padding: "8px 12px", textAlign: "right" }}>{cell(f?.percentOfAccount)}</td>
                              <td style={{ padding: "8px 12px", textAlign: "right" }}>{cell(f?.costBasisTotal)}</td>
                              <td style={{ padding: "8px 12px", textAlign: "right" }}>{cell(f?.averageCostBasis)}</td>
                              <td style={{ padding: "8px 12px" }}>{cell(f?.type)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  ) : (
                    <table style={{ width: "100%", borderCollapse: "collapse" }} aria-label={`Positions for ${accountName}`}>
                      <thead>
                        <tr style={{ borderBottom: "1px solid #334155" }}>
                          <th style={{ textAlign: "left", padding: "8px 12px", color: "#94a3b8" }}>Underlying</th>
                          <SortHeader label="Qty" column="quantity" accountId={accountId} align="right" />
                          <SortHeader label="Avg price" column="averagePrice" accountId={accountId} align="right" />
                          <th style={{ textAlign: "right", padding: "8px 12px", color: "#94a3b8" }}>Last</th>
                          <SortHeader label="Cost" column="value" accountId={accountId} align="right" />
                          <th style={{ textAlign: "right", padding: "8px 12px", color: "#94a3b8" }}>Value</th>
                          <th style={{ textAlign: "right", padding: "8px 12px", color: "#94a3b8" }}>P&L</th>
                          <th style={{ textAlign: "right", padding: "8px 12px", color: "#94a3b8" }}>P&L %</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sorted.map((p) => {
                          const ticker = underlyingTicker(p.symbol);
                          const isEquity = ticker === p.symbol;
                          const lastPrice = isEquity && ticker ? prices[ticker] : undefined;
                          const cost = positionValue(p);
                          const currentValue = lastPrice != null ? p.quantity * lastPrice : null;
                          const pnl = currentValue != null ? currentValue - cost : null;
                          const pnlPct = cost && pnl != null ? (pnl / cost) * 100 : null;
                          return (
                            <tr key={p.id} style={{ borderBottom: "1px solid #1e293b" }}>
                              <td style={{ padding: "8px 12px" }}>{underlyingAssetName(p.symbol)}</td>
                              <td style={{ padding: "8px 12px", textAlign: "right" }}>{p.quantity}</td>
                              <td style={{ padding: "8px 12px", textAlign: "right" }}>${p.averagePrice.toFixed(2)}</td>
                              <td style={{ padding: "8px 12px", textAlign: "right" }}>{lastPrice != null ? `$${lastPrice.toFixed(2)}` : "—"}</td>
                              <td style={{ padding: "8px 12px", textAlign: "right" }}>${cost.toFixed(2)}</td>
                              <td style={{ padding: "8px 12px", textAlign: "right" }}>{currentValue != null ? `$${currentValue.toFixed(2)}` : "—"}</td>
                              <td style={{ padding: "8px 12px", textAlign: "right", color: pnl != null ? (pnl >= 0 ? "#22c55e" : "#ef4444") : undefined }}>{pnl != null ? `$${pnl.toFixed(2)}` : "—"}</td>
                              <td style={{ padding: "8px 12px", textAlign: "right", color: pnlPct != null ? (pnlPct >= 0 ? "#22c55e" : "#ef4444") : undefined }}>{pnlPct != null ? `${pnlPct >= 0 ? "+" : ""}${pnlPct.toFixed(1)}%` : "—"}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
};
