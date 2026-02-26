import React, { useState, useCallback, useEffect } from "react";

const OPTIONS_FORM_KEY = "trading-app.options-form";
const PC_HISTORY_KEY = "trading-app.pc-history";

interface PcHistoryEntry {
  date: string;
  symbol: string;
  ratioVol: number;
  ratioOI: number;
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function fiveDaysAgoStr(): string {
  const d = new Date();
  d.setDate(d.getDate() - 5);
  return d.toISOString().slice(0, 10);
}

function loadOptionsForm(): { symbol: string; expiryFrom: string; expiryTo: string } {
  try {
    const raw = localStorage.getItem(OPTIONS_FORM_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { symbol?: string; expiryFrom?: string; expiryTo?: string };
      const from = parsed.expiryFrom ?? fiveDaysAgoStr();
      let to = parsed.expiryTo ?? todayStr();
      if (!to || to <= from) to = todayStr();
      return { symbol: parsed.symbol ?? "", expiryFrom: from, expiryTo: to };
    }
  } catch {
    // ignore
  }
  return { symbol: "", expiryFrom: fiveDaysAgoStr(), expiryTo: todayStr() };
}

function saveOptionsForm(data: { symbol: string; expiryFrom: string; expiryTo: string }) {
  try {
    localStorage.setItem(OPTIONS_FORM_KEY, JSON.stringify(data));
  } catch {
    // ignore
  }
}

function mean(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function std(arr: number[], m?: number): number {
  if (arr.length < 2) return 0;
  const mu = m ?? mean(arr);
  const variance = arr.reduce((s, x) => s + (x - mu) ** 2, 0) / (arr.length - 1);
  return Math.sqrt(variance);
}

/** Choose lookback length from data: if recent volatility is high vs longer window, use shorter lookback. */
function chooseLookback(history: PcHistoryEntry[], maxDays: number = 90, minPoints: number = 5): PcHistoryEntry[] {
  const byDate = history.slice(0, maxDays);
  if (byDate.length < minPoints) return byDate;
  const recent = byDate.slice(0, 20);
  const full = byDate.slice(0, Math.min(60, byDate.length));
  if (recent.length >= 5 && full.length >= 10) {
    const valsR = recent.map((e) => e.ratioVol);
    const valsF = full.map((e) => e.ratioVol);
    const stdR = std(valsR);
    const stdF = std(valsF);
    if (stdF > 0 && stdR > 1.5 * stdF) return recent;
  }
  return byDate;
}

function pcStats(current: number, history: PcHistoryEntry[], symbol: string): {
  lookbackN: number;
  zScore: number | null;
  percentile: number | null;
  label: "Bullish" | "Neutral" | "Bearish";
  heatPosition: number;
} {
  const selected = chooseLookback(history, 90, 5);
  if (selected.length < 5) {
    const heatPosition = 0.5;
    const label: "Bullish" | "Neutral" | "Bearish" = "Neutral";
    return { lookbackN: 0, zScore: null, percentile: null, label, heatPosition };
  }
  const vals = selected.map((e) => e.ratioVol);
  const m = mean(vals);
  const s = std(vals, m);
  const zScore = s > 0 ? (current - m) / s : 0;
  const percentile = vals.filter((v) => v <= current).length / vals.length;
  const heatPosition = Math.min(1, Math.max(0, 0.5 + zScore * 0.25));
  const label: "Bullish" | "Neutral" | "Bearish" =
    zScore < -0.5 ? "Bullish" : zScore > 0.5 ? "Bearish" : "Neutral";
  return { lookbackN: selected.length, zScore, percentile, label, heatPosition };
}

interface OptionRow {
  id: string;
  symbol: string;
  expiry: string;
  strike: number;
  right: string;
  bid: number;
  ask: number;
  last?: number;
  impliedVolatility?: number;
  delta?: number;
  gamma?: number;
  theta?: number;
  vega?: number;
  openInterest?: number;
  volume?: number;
}

export const OptionsExplorerScreen: React.FC = () => {
  const [symbol, setSymbol] = useState("");
  const [expiryFrom, setExpiryFrom] = useState(fiveDaysAgoStr());
  const [expiryTo, setExpiryTo] = useState(todayStr());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [contracts, setContracts] = useState<OptionRow[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [pcHistory, setPcHistory] = useState<PcHistoryEntry[]>([]);
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const [downloadDate, setDownloadDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 5);
    return d.toISOString().slice(0, 10);
  });
  const [downloadLoading, setDownloadLoading] = useState(false);
  const [downloadRangeFrom, setDownloadRangeFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  });
  const [downloadRangeTo, setDownloadRangeTo] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 5);
    return d.toISOString().slice(0, 10);
  });
  const [rangeDownloadLoading, setRangeDownloadLoading] = useState(false);

  useEffect(() => {
    const saved = loadOptionsForm();
    setSymbol(saved.symbol);
    setExpiryFrom(saved.expiryFrom || fiveDaysAgoStr());
    setExpiryTo(saved.expiryTo || todayStr());
  }, []);

  useEffect(() => {
    saveOptionsForm({ symbol, expiryFrom, expiryTo });
  }, [symbol, expiryFrom, expiryTo]);

  const hasIpc = typeof window.tradingApp?.invoke === "function";

  // One-time migration: move localStorage P/C history into SQLite (main process)
  useEffect(() => {
    if (!hasIpc) return;
    try {
      const raw = localStorage.getItem(PC_HISTORY_KEY);
      if (!raw) return;
      const arr = JSON.parse(raw) as PcHistoryEntry[];
      if (arr.length === 0) return;
      void window.tradingApp.invoke("options:importPcHistoryFromJson", { entries: arr }).then((res: { ok: boolean }) => {
        if (res?.ok) localStorage.removeItem(PC_HISTORY_KEY);
      });
    } catch {
      // ignore
    }
  }, [hasIpc]);

  // Load P/C history from main when symbol is set (coalesced: flat-file + real-time)
  const loadPcHistory = useCallback(async (sym: string) => {
    if (!hasIpc || !sym) return;
    const res = await window.tradingApp.invoke("options:getPcHistory", { symbol: sym });
    if (res?.ok && Array.isArray(res.data)) setPcHistory(res.data as PcHistoryEntry[]);
    else setPcHistory([]);
  }, [hasIpc]);

  useEffect(() => {
    const s = symbol.trim().toUpperCase();
    if (s) void loadPcHistory(s);
    else setPcHistory([]);
  }, [symbol, loadPcHistory]);

  const loadChain = useCallback(async () => {
    const s = symbol.trim().toUpperCase();
    if (!s) return;
    const from = expiryFrom.trim() || fiveDaysAgoStr();
    const to = expiryTo.trim() || todayStr();
    setLoading(true);
    setError(null);
    setContracts([]);
    setHasSearched(false);
    try {
      const res = await window.tradingApp.invoke("options:chain", { symbol: s, expiryFrom: from, expiryTo: to });
      setHasSearched(true);
      if (!res.ok) {
        setError(res.error ?? "Failed to load chain");
        return;
      }
      const data = res.data as { contracts?: OptionRow[] };
      const list = data.contracts ?? [];
      setContracts(list);
      if (list.length > 0 && hasIpc) {
        const pv = list.filter((c) => c.right === "put").reduce((s, c) => s + (c.volume ?? 0), 0);
        const cv = list.filter((c) => c.right === "call").reduce((s, c) => s + (c.volume ?? 0), 0);
        const po = list.filter((c) => c.right === "put").reduce((s, c) => s + (c.openInterest ?? 0), 0);
        const co = list.filter((c) => c.right === "call").reduce((s, c) => s + (c.openInterest ?? 0), 0);
        if (cv > 0) {
          await window.tradingApp.invoke("options:appendPcHistory", {
            symbol: s,
            ratioVol: pv / cv,
            ratioOI: co > 0 ? po / co : 0
          });
          await loadPcHistory(s);
        }
      }
    } catch (e) {
      setHasSearched(true);
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [symbol, expiryFrom, expiryTo, hasIpc, loadPcHistory]);

  const importFlatFile = useCallback(async () => {
    if (!hasIpc) return;
    setImportMessage(null);
    try {
      const res = await window.tradingApp.invoke("options:selectAndImportFlatFile");
      if (res?.ok && res.data) {
        if (res.data.canceled) return;
        const msg = `Imported ${res.data.imported ?? 0} P/C rows.`;
        setImportMessage(res.data.errors?.length ? `${msg} (${res.data.errors.length} warnings)` : msg);
        const s = symbol.trim().toUpperCase();
        if (s) await loadPcHistory(s);
      } else {
        setImportMessage(res?.error ?? "Import failed");
      }
    } catch (e) {
      setImportMessage(String(e));
    }
  }, [hasIpc, symbol, loadPcHistory]);

  const downloadFromS3 = useCallback(async () => {
    if (!hasIpc) return;
    setImportMessage(null);
    setDownloadLoading(true);
    try {
      const res = await window.tradingApp.invoke("options:downloadFlatFile", { date: downloadDate });
      if (res?.ok && res.data) {
        const n = res.data.imported ?? 0;
        setImportMessage(n > 0 ? `Downloaded ${n} P/C rows for ${downloadDate}.` : (res.data.message ?? `No data for ${downloadDate}.`));
        const s = symbol.trim().toUpperCase();
        if (s) await loadPcHistory(s);
      } else {
        setImportMessage(res?.error ?? "Download failed");
      }
    } catch (e) {
      setImportMessage(String(e));
    } finally {
      setDownloadLoading(false);
    }
  }, [hasIpc, downloadDate, symbol, loadPcHistory]);

  const downloadRangeFromS3 = useCallback(async () => {
    if (!hasIpc) return;
    setImportMessage(null);
    setRangeDownloadLoading(true);
    try {
      const res = await window.tradingApp.invoke("options:downloadFlatFileRange", {
        dateFrom: downloadRangeFrom,
        dateTo: downloadRangeTo
      });
      if (res?.ok && res.data) {
        const n = res.data.imported ?? 0;
        const days = res.data.daysDownloaded ?? 0;
        setImportMessage(`Downloaded ${n} P/C rows from ${days} days (${downloadRangeFrom} to ${downloadRangeTo}).`);
        const s = symbol.trim().toUpperCase();
        if (s) await loadPcHistory(s);
      } else {
        setImportMessage(res?.error ?? "Download failed");
      }
    } catch (e) {
      setImportMessage(String(e));
    } finally {
      setRangeDownloadLoading(false);
    }
  }, [hasIpc, downloadRangeFrom, downloadRangeTo, symbol, loadPcHistory]);

  return (
    <div>
      <h1 style={{ marginBottom: 8 }}>Options</h1>
      <p style={{ color: "#94a3b8", marginBottom: 24 }}>
        Real-time options chain from Polygon.io (pricing and greeks). Set your Polygon API key in
        Settings, then enter a symbol and load. Use <strong>Import historical P/C</strong> to add
        flat-file data (CSV with date, symbol, ratio_vol, ratio_oi—or date, symbol, option_type, volume, open_interest);
        it is coalesced with real-time data for the heatmap. Historical data can come from{" "}
        <a
          href="https://massive.com/docs/flat-files/quickstart#setting-up-s3-access"
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: "#93c5fd" }}
        >
          Massive flat files via S3
        </a>{" "}
        Configure S3 credentials in Settings, then use <strong>Download from S3</strong> to fetch options day-aggregates for a date, or import a CSV manually.
      </p>

      {!hasIpc && (
        <div style={{ padding: 12, background: "#334155", borderRadius: 8, marginBottom: 16 }}>
          Run the app in Electron to load options data.
        </div>
      )}

      {hasIpc && (
        <>
          <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
            <input
              type="text"
              placeholder="Underlying (e.g. AAPL)"
              value={symbol}
              onChange={(e) => setSymbol(e.target.value)}
              style={{
                width: 120,
                padding: "8px 12px",
                borderRadius: 6,
                border: "1px solid #334155",
                background: "#0f172a",
                color: "#e2e8f0"
              }}
            />
            <input
              type="date"
              value={expiryFrom}
              onChange={(e) => setExpiryFrom(e.target.value)}
              style={{
                padding: "8px 12px",
                borderRadius: 6,
                border: "1px solid #334155",
                background: "#0f172a",
                color: "#e2e8f0"
              }}
            />
            <span style={{ color: "#64748b" }}>to</span>
            <input
              type="date"
              value={expiryTo}
              onChange={(e) => setExpiryTo(e.target.value)}
              style={{
                padding: "8px 12px",
                borderRadius: 6,
                border: "1px solid #334155",
                background: "#0f172a",
                color: "#e2e8f0"
              }}
            />
            <button
              type="button"
              onClick={loadChain}
              disabled={loading}
              style={{
                padding: "8px 16px",
                borderRadius: 6,
                border: "none",
                background: loading ? "#475569" : "#3b82f6",
                color: "#fff",
                cursor: loading ? "wait" : "pointer"
              }}
            >
              {loading ? "Loading…" : "Load chain"}
            </button>
            <button
              type="button"
              onClick={importFlatFile}
              style={{
                padding: "8px 16px",
                borderRadius: 6,
                border: "1px solid #475569",
                background: "#1e293b",
                color: "#e2e8f0",
                cursor: "pointer"
              }}
            >
              Import historical P/C
            </button>
            <input
              type="date"
              value={downloadDate}
              onChange={(e) => setDownloadDate(e.target.value)}
              style={{
                padding: "8px 12px",
                borderRadius: 6,
                border: "1px solid #334155",
                background: "#0f172a",
                color: "#e2e8f0"
              }}
            />
            <button
              type="button"
              onClick={downloadFromS3}
              disabled={downloadLoading || rangeDownloadLoading}
              style={{
                padding: "8px 16px",
                borderRadius: 6,
                border: "1px solid #475569",
                background: downloadLoading ? "#334155" : "#1e293b",
                color: "#e2e8f0",
                cursor: downloadLoading ? "wait" : "pointer"
              }}
            >
              {downloadLoading ? "Downloading…" : "Download from S3"}
            </button>
            <input
              type="date"
              value={downloadRangeFrom}
              onChange={(e) => setDownloadRangeFrom(e.target.value)}
              style={{
                padding: "8px 12px",
                borderRadius: 6,
                border: "1px solid #334155",
                background: "#0f172a",
                color: "#e2e8f0"
              }}
            />
            <span style={{ color: "#64748b" }}>to</span>
            <input
              type="date"
              value={downloadRangeTo}
              onChange={(e) => setDownloadRangeTo(e.target.value)}
              style={{
                padding: "8px 12px",
                borderRadius: 6,
                border: "1px solid #334155",
                background: "#0f172a",
                color: "#e2e8f0"
              }}
            />
            <button
              type="button"
              onClick={downloadRangeFromS3}
              disabled={downloadLoading || rangeDownloadLoading}
              style={{
                padding: "8px 16px",
                borderRadius: 6,
                border: "1px solid #475569",
                background: rangeDownloadLoading ? "#334155" : "#1e293b",
                color: "#e2e8f0",
                cursor: rangeDownloadLoading ? "wait" : "pointer"
              }}
            >
              {rangeDownloadLoading ? "Downloading range…" : "Download range from S3"}
            </button>
          </div>
          {importMessage && (
            <div
              style={{
                padding: 10,
                marginBottom: 16,
                borderRadius: 8,
                background: importMessage.startsWith("Imported") ? "#1e3a5f" : "#7f1d1d",
                color: "#e2e8f0",
                fontSize: 14
              }}
            >
              {importMessage}
            </div>
          )}

          {error && (
            <div
              style={{
                padding: 12,
                background: error.includes("API key") ? "#1e3a5f" : "#7f1d1d",
                borderRadius: 8,
                color: "#e2e8f0",
                marginBottom: 16
              }}
            >
              {error.includes("No options API key") ? (
                <>
                  <strong>Polygon API key required</strong>
                  <p style={{ margin: "8px 0 0", fontSize: 14 }}>
                    Open the <strong>Settings</strong> tab in the nav above, enter your Polygon.io API key in the
                    &quot;Polygon.io (options chain)&quot; field, and click <strong>Save</strong>. This is a separate
                    key from Alpha Vantage (get one at polygon.io).
                  </p>
                </>
              ) : error.includes("403") ? (
                <>
                  <strong>HTTP 403 Forbidden</strong>
                  <p style={{ margin: "8px 0 0", fontSize: 14 }}>
                    Your API key may not have options snapshot access, or the key may be invalid. Check your plan at
                    polygon.io / massive.com and re-save the key in Settings.
                  </p>
                </>
              ) : (
                error
              )}
            </div>
          )}

          {hasSearched && !loading && contracts.length === 0 && !error && (
            <p style={{ color: "#94a3b8", marginTop: 16 }}>
              No contracts in this expiry range. Try setting &quot;to&quot; to a date further out (e.g. 1–3 months from today).
            </p>
          )}

          {contracts.length > 0 && (() => {
            const putVol = contracts.filter((c) => c.right === "put").reduce((s, c) => s + (c.volume ?? 0), 0);
            const callVol = contracts.filter((c) => c.right === "call").reduce((s, c) => s + (c.volume ?? 0), 0);
            const putOI = contracts.filter((c) => c.right === "put").reduce((s, c) => s + (c.openInterest ?? 0), 0);
            const callOI = contracts.filter((c) => c.right === "call").reduce((s, c) => s + (c.openInterest ?? 0), 0);
            const ratioVol = callVol > 0 ? putVol / callVol : null;
            const ratioOI = callOI > 0 ? putOI / callOI : null;
            return (
              <>
                <div
                  style={{
                    marginTop: 16,
                    marginBottom: 16,
                    padding: 12,
                    background: "#0f172a",
                    borderRadius: 8,
                    border: "1px solid #1e293b"
                  }}
                >
                  <div style={{ display: "flex", gap: 24, marginBottom: 12 }}>
                    <div>
                      <span style={{ color: "#94a3b8", fontSize: 12 }}>Put/Call (volume)</span>
                      <div style={{ fontWeight: 600 }}>
                        {ratioVol != null ? ratioVol.toFixed(2) : "—"}
                      </div>
                    </div>
                    <div>
                      <span style={{ color: "#94a3b8", fontSize: 12 }}>Put/Call (open interest)</span>
                      <div style={{ fontWeight: 600 }}>
                        {ratioOI != null ? ratioOI.toFixed(2) : "—"}
                      </div>
                    </div>
                  </div>
                  <p style={{ margin: 0, fontSize: 12, color: "#94a3b8", lineHeight: 1.45 }}>
                    <strong style={{ color: "#cbd5e1" }}>What it tells you:</strong> A ratio above 1 means more put than call activity (volume or open interest)—often read as bearish or hedging. Below 1 means more call activity—often read as bullish. Very high ratios can signal fear or heavy hedging (some use it as a contrarian bullish signal); very low ratios can signal complacency. Use with price action and other indicators, not alone.
                  </p>
                  {ratioVol != null && (() => {
                    const history = pcHistory;
                    const stats = pcStats(ratioVol, history, symbol);
                    if (stats.lookbackN < 5) {
                      return (
                        <p style={{ margin: "12px 0 0", fontSize: 12, color: "#64748b" }}>
                          Load chain on more days to see sentiment vs history (need at least 5 days).
                        </p>
                      );
                    }
                    return (
                      <div style={{ marginTop: 16 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6 }}>
                          <span style={{ fontSize: 12, color: "#94a3b8" }}>Sentiment vs history</span>
                          <span
                            style={{
                              fontWeight: 600,
                              color: stats.label === "Bullish" ? "#22c55e" : stats.label === "Bearish" ? "#ef4444" : "#eab308"
                            }}
                          >
                            {stats.label}
                          </span>
                          {stats.percentile != null && (
                            <span style={{ fontSize: 12, color: "#64748b" }}>
                              ({(stats.percentile * 100).toFixed(0)}th percentile vs. last {stats.lookbackN} days)
                            </span>
                          )}
                        </div>
                        <div
                          style={{
                            height: 20,
                            borderRadius: 4,
                            background: "linear-gradient(to right, #22c55e 0%, #eab308 50%, #ef4444 100%)",
                            position: "relative"
                          }}
                        >
                          <div
                            style={{
                              position: "absolute",
                              left: `${stats.heatPosition * 100}%`,
                              top: "50%",
                              transform: "translate(-50%, -50%)",
                              width: 3,
                              height: 24,
                              borderRadius: 2,
                              background: "#0f172a",
                              boxShadow: "0 0 0 1px #94a3b8"
                            }}
                          />
                        </div>
                        <p style={{ margin: "6px 0 0", fontSize: 11, color: "#64748b" }}>
                          Lookback chosen by volatility: {stats.lookbackN} days. Green = low P/C (bullish), red = high P/C (bearish).
                        </p>
                      </div>
                    );
                  })()}
                </div>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid #334155" }}>
                    <th style={{ textAlign: "left", padding: "6px 8px", color: "#94a3b8" }}>Type</th>
                    <th style={{ textAlign: "left", padding: "6px 8px", color: "#94a3b8" }}>Expiry</th>
                    <th style={{ textAlign: "right", padding: "6px 8px", color: "#94a3b8" }}>Strike</th>
                    <th style={{ textAlign: "right", padding: "6px 8px", color: "#94a3b8" }}>Bid</th>
                    <th style={{ textAlign: "right", padding: "6px 8px", color: "#94a3b8" }}>Ask</th>
                    <th style={{ textAlign: "right", padding: "6px 8px", color: "#94a3b8" }}>IV</th>
                    <th style={{ textAlign: "right", padding: "6px 8px", color: "#94a3b8" }}>Delta</th>
                    <th style={{ textAlign: "right", padding: "6px 8px", color: "#94a3b8" }}>Gamma</th>
                    <th style={{ textAlign: "right", padding: "6px 8px", color: "#94a3b8" }}>Theta</th>
                    <th style={{ textAlign: "right", padding: "6px 8px", color: "#94a3b8" }}>Vega</th>
                    <th style={{ textAlign: "right", padding: "6px 8px", color: "#94a3b8" }}>OI</th>
                    <th style={{ textAlign: "right", padding: "6px 8px", color: "#94a3b8" }}>Vol</th>
                  </tr>
                </thead>
                <tbody>
                  {contracts.map((c) => (
                    <tr key={c.id} style={{ borderBottom: "1px solid #1e293b" }}>
                      <td style={{ padding: "6px 8px" }}>{c.right}</td>
                      <td style={{ padding: "6px 8px" }}>{c.expiry}</td>
                      <td style={{ padding: "6px 8px", textAlign: "right" }}>{c.strike}</td>
                      <td style={{ padding: "6px 8px", textAlign: "right" }}>{c.bid.toFixed(2)}</td>
                      <td style={{ padding: "6px 8px", textAlign: "right" }}>{c.ask.toFixed(2)}</td>
                      <td style={{ padding: "6px 8px", textAlign: "right" }}>
                        {c.impliedVolatility != null ? `${(c.impliedVolatility * 100).toFixed(1)}%` : "—"}
                      </td>
                      <td style={{ padding: "6px 8px", textAlign: "right" }}>{c.delta != null ? c.delta.toFixed(3) : "—"}</td>
                      <td style={{ padding: "6px 8px", textAlign: "right" }}>{c.gamma != null ? c.gamma.toFixed(4) : "—"}</td>
                      <td style={{ padding: "6px 8px", textAlign: "right" }}>{c.theta != null ? c.theta.toFixed(4) : "—"}</td>
                      <td style={{ padding: "6px 8px", textAlign: "right" }}>{c.vega != null ? c.vega.toFixed(4) : "—"}</td>
                      <td style={{ padding: "6px 8px", textAlign: "right" }}>{c.openInterest ?? "—"}</td>
                      <td style={{ padding: "6px 8px", textAlign: "right" }}>{c.volume ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
                </div>
              </>
            );
          })()}
        </>
      )}
    </div>
  );
};
