import React, { useState, useCallback, useMemo } from "react";
import { technicalSnapshot } from "../domain/analytics/timeSeries";
import { decide } from "../domain/recommendations/decisionEngine";
import type { TimeSeriesPoint } from "../domain/commonTypes";
import type { Recommendation } from "../domain/recommendations/models";

export const AssetDetailScreen: React.FC = () => {
  const [symbol, setSymbol] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [quote, setQuote] = useState<{ symbol: string; last: number; asOf: string } | null>(null);
  const [points, setPoints] = useState<TimeSeriesPoint[]>([]);
  const [recommendation, setRecommendation] = useState<Recommendation | null>(null);

  const hasIpc = typeof window.tradingApp?.invoke === "function";

  const analyze = useCallback(async () => {
    const s = symbol.trim().toUpperCase();
    if (!s) return;
    if (!hasIpc) {
      setError("Run the app in Electron to load market data.");
      return;
    }
    setLoading(true);
    setError(null);
    setQuote(null);
    setPoints([]);
    setRecommendation(null);
    try {
      const quoteRes = await window.tradingApp.invoke("market:quote", { symbol: s });
      if (!quoteRes.ok) {
        setError(quoteRes.error ?? "Failed to get quote");
        return;
      }
      setQuote(quoteRes.data as { symbol: string; last: number; asOf: string });
      await new Promise((r) => setTimeout(r, 1100));
      const historyRes = await window.tradingApp.invoke("market:history", { symbol: s });
      if (!historyRes.ok) {
        setError(historyRes.error ?? "Failed to get history");
        return;
      }
      const hist = historyRes.data as { symbol: string; points: TimeSeriesPoint[] };
      setPoints(hist.points ?? []);
      if (hist.points?.length) {
        const technicals = technicalSnapshot(hist.points);
        const rec = decide({
          symbol: { symbol: s, assetClass: "equity", currency: "USD" },
          technicals,
          macroSignals: [],
          sentiment: null,
          existingExposureUsd: 0
        });
        setRecommendation(rec);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [symbol, hasIpc]);

  const chartData = useMemo(
    () => points.slice(-90).map((p) => ({ date: p.timestamp.slice(0, 10), close: p.close })),
    [points]
  );
  const chartBounds = useMemo(() => {
    if (chartData.length === 0) return null;
    const min = Math.min(...chartData.map((d) => d.close));
    const max = Math.max(...chartData.map((d) => d.close));
    return { min, max, range: max - min || 1 };
  }, [chartData]);
  const chartPath = useMemo(() => {
    if (chartData.length < 2 || !chartBounds) return "";
    const { min, range } = chartBounds;
    const w = 800;
    const h = 220;
    const padding = { left: 56, right: 16, top: 12, bottom: 28 };
    const plotW = w - padding.left - padding.right;
    const plotH = h - padding.top - padding.bottom;
    const x = (i: number) => padding.left + (i / (chartData.length - 1)) * plotW;
    const y = (c: number) => padding.top + plotH - ((c - min) / range) * plotH;
    return chartData.map((d, i) => `${i === 0 ? "M" : "L"} ${x(i)} ${y(d.close)}`).join(" ");
  }, [chartData, chartBounds]);

  return (
    <div>
      <h1 style={{ marginBottom: 8 }}>Research</h1>
      <p style={{ color: "#94a3b8", marginBottom: 24 }}>
        Enter a symbol and click Analyze to see price, chart, and Buy/Hold/Sell recommendation.
      </p>

      <div style={{ display: "flex", gap: 8, marginBottom: 24, flexWrap: "wrap" }}>
        <input
          type="text"
          placeholder="e.g. AAPL, SPY"
          value={symbol}
          onChange={(e) => setSymbol(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && analyze()}
          style={{
            width: 140,
            padding: "8px 12px",
            borderRadius: 6,
            border: "1px solid #334155",
            background: "#0f172a",
            color: "#e2e8f0"
          }}
        />
        <button
          type="button"
          onClick={analyze}
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
          {loading ? "Loading…" : "Analyze"}
        </button>
      </div>

      {error && (
        <div style={{ padding: 12, background: "#7f1d1d", borderRadius: 8, color: "#fecaca", marginBottom: 16 }}>
          {error}
        </div>
      )}

      {quote && (
        <div style={{ marginBottom: 16 }}>
          <strong>{quote.symbol}</strong> ${quote.last.toFixed(2)} <span style={{ color: "#64748b", fontSize: 12 }}>as of {quote.asOf.slice(0, 10)}</span>
        </div>
      )}

      {chartData.length > 0 && chartBounds && (
        <div style={{ marginBottom: 24, background: "#0f172a", borderRadius: 8, padding: 16, overflow: "hidden" }}>
          <h2 style={{ fontSize: 14, fontWeight: 600, color: "#e2e8f0", marginBottom: 12 }}>
            Price history ({chartData.length} days)
          </h2>
          <svg viewBox="0 0 800 220" preserveAspectRatio="xMidYMid meet" style={{ width: "100%", maxHeight: 280 }}>
            {/* Y-axis labels */}
            <text x={8} y={28} fill="#64748b" fontSize={10} textAnchor="start">
              {chartBounds.max.toFixed(2)}
            </text>
            <text x={8} y={212} fill="#64748b" fontSize={10} textAnchor="start">
              {chartBounds.min.toFixed(2)}
            </text>
            {/* Grid line (mid) */}
            <line x1={56} y1={110} x2={784} y2={110} stroke="#1e293b" strokeWidth={1} strokeDasharray="4 2" />
            <path d={chartPath} fill="none" stroke="#3b82f6" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          </svg>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#64748b", marginTop: 4, paddingLeft: 56 }}>
            <span>{chartData[0]?.date}</span>
            <span>{chartData[chartData.length - 1]?.date}</span>
          </div>
        </div>
      )}

      {recommendation && (
        <div
          style={{
            padding: 16,
            background: recommendation.action === "buy" ? "#14532d" : recommendation.action === "sell" ? "#7f1d1d" : "#1e293b",
            borderRadius: 8,
            border: "1px solid #334155"
          }}
        >
          <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 8, textTransform: "uppercase" }}>
            {recommendation.action}
          </div>
          <div style={{ color: "#94a3b8", marginBottom: 4 }}>Confidence: {(recommendation.confidence * 100).toFixed(0)}%</div>
          <div style={{ color: "#e2e8f0" }}>{recommendation.rationale}</div>
        </div>
      )}
    </div>
  );
};
