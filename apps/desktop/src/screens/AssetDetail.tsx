import React, { useState, useCallback, useEffect } from "react";
import { useAppState } from "../context/AppState";
import { technicalSnapshot, type ChartInterval } from "../domain/analytics/timeSeries";
import { decide } from "../domain/recommendations/decisionEngine";
import type { TimeSeriesPoint } from "../domain/commonTypes";
import type { Recommendation } from "../domain/recommendations/models";
import { TradingViewChart } from "../components/TradingViewChart";
import { TechnicalGauges } from "../components/TechnicalGauges";

const SENTIMENT_STORAGE_KEY = "trading-app.sentiment";

function getStoredSentiment(symbol: string): number | null {
  try {
    const raw = localStorage.getItem(SENTIMENT_STORAGE_KEY);
    if (!raw) return null;
    const obj = JSON.parse(raw) as Record<string, number>;
    const v = obj[symbol?.toUpperCase()];
    return typeof v === "number" && v >= -1 && v <= 1 ? v : null;
  } catch {
    return null;
  }
}

function setStoredSentiment(symbol: string, value: number | null): void {
  try {
    const key = symbol?.toUpperCase();
    if (!key) return;
    const raw = localStorage.getItem(SENTIMENT_STORAGE_KEY);
    const obj = (raw ? JSON.parse(raw) : {}) as Record<string, number>;
    if (value === null) delete obj[key];
    else obj[key] = value;
    localStorage.setItem(SENTIMENT_STORAGE_KEY, JSON.stringify(obj));
  } catch {
    // ignore
  }
}

type NewsWithSentiment = {
  id: string;
  source: string;
  headline: string;
  url: string;
  publishedAt: string;
  summary?: string;
  sentiment: number | null;
};

export const AssetDetailScreen: React.FC = () => {
  const { activeSymbol, setActiveSymbol, addToWatchlist } = useAppState();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [quote, setQuote] = useState<{ symbol: string; last: number; asOf: string } | null>(null);
  const [points, setPoints] = useState<TimeSeriesPoint[]>([]);
  const [recommendation, setRecommendation] = useState<Recommendation | null>(null);
  const [userSentiment, setUserSentiment] = useState<number | null>(null);
  const [newsWithSentiment, setNewsWithSentiment] = useState<NewsWithSentiment[] | null>(null);
  const [confidenceTooltipVisible, setConfidenceTooltipVisible] = useState(false);
  const [chartInterval, setChartInterval] = useState<ChartInterval>("D");

  const hasIpc = typeof window.tradingApp?.invoke === "function";

  const analyze = useCallback(
    async (s: string) => {
      const sym = s.trim().toUpperCase();
      if (!sym) return;
      if (!hasIpc) {
        setError("Run the app in Electron to load market data.");
        return;
      }
      setLoading(true);
      setError(null);
      setQuote(null);
      setPoints([]);
      setRecommendation(null);
      setNewsWithSentiment(null);
      try {
        const quoteRes = await window.tradingApp.invoke("market:quote", { symbol: sym });
        if (!quoteRes.ok) {
          if (activeSymbol === sym) setError(quoteRes.error ?? "Failed to get quote");
          return;
        }
        setQuote(quoteRes.data as { symbol: string; last: number; asOf: string });
        await new Promise((r) => setTimeout(r, 1100));
        const newsRes = await window.tradingApp.invoke("market:newsForSymbol", { symbol: sym, limit: 20 }).catch(() => ({ ok: false, data: null }));
        const stored = getStoredSentiment(sym);
        setUserSentiment(stored);
        const news = newsRes.ok && newsRes.data ? (newsRes.data as NewsWithSentiment[]) : null;
        setNewsWithSentiment(news);
        setActiveSymbol(sym);
        addToWatchlist(sym);
      } catch (e) {
        if (activeSymbol === sym) setError(String(e));
      } finally {
        setLoading(false);
      }
    },
    [hasIpc, setActiveSymbol, addToWatchlist, activeSymbol]
  );

  useEffect(() => {
    if (activeSymbol && activeSymbol.trim() && hasIpc) {
      analyze(activeSymbol);
    } else if (!activeSymbol || !activeSymbol.trim()) {
      setQuote(null);
      setPoints([]);
      setRecommendation(null);
      setUserSentiment(null);
      setNewsWithSentiment(null);
      setError(null);
    }
  }, [activeSymbol, hasIpc, analyze]);

  useEffect(() => {
    const sym = activeSymbol?.trim().toUpperCase();
    if (!sym || !hasIpc || !quote) return;
    let cancelled = false;
    (async () => {
      const res = await window.tradingApp.invoke("market:history", { symbol: sym, interval: chartInterval });
      if (cancelled) return;
      if (res.ok && res.data) {
        const hist = res.data as { symbol: string; points: TimeSeriesPoint[] };
        setPoints(hist.points ?? []);
      } else if (activeSymbol === sym) {
        setError(res.error ?? "Failed to load history for this timeframe.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [chartInterval, activeSymbol, quote, hasIpc]);

  useEffect(() => {
    const sym = activeSymbol?.trim().toUpperCase();
    if (!sym || points.length === 0) return;
    const minBars = chartInterval === "W" ? 100 : chartInterval === "1M" ? 252 : 30;
    if (points.length < minBars) return;
    const technicals = technicalSnapshot(points, chartInterval);
    const scores: number[] = [];
    if (userSentiment != null) scores.push(userSentiment);
    if (newsWithSentiment && newsWithSentiment.length > 0) {
      const avgNews = newsWithSentiment.reduce((s, a) => s + (a.sentiment ?? 0), 0) / newsWithSentiment.length;
      if (Number.isFinite(avgNews)) scores.push(avgNews);
    }
    const averageScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : undefined;
    const sentiment =
      averageScore != null ? { symbol: sym, windowDays: 0, averageScore, sampleCount: Math.max(1, scores.length) } : null;
    const rec = decide({
      symbol: { symbol: sym, assetClass: "equity", currency: "USD" },
      technicals,
      macroSignals: [],
      sentiment,
      existingExposureUsd: 0
    });
    setRecommendation(rec);
  }, [activeSymbol, points, chartInterval, userSentiment, newsWithSentiment]);

  const handleSentimentChange = useCallback(
    (value: number) => {
      const sym = activeSymbol?.trim().toUpperCase();
      if (!sym) return;
      setStoredSentiment(sym, value);
      setUserSentiment(value);
    },
    [activeSymbol]
  );

  const newsAggregate =
    newsWithSentiment && newsWithSentiment.length > 0
      ? (() => {
          const withScore = newsWithSentiment.filter((a) => a.sentiment != null);
          return withScore.length > 0
            ? withScore.reduce((s, a) => s + (a.sentiment ?? 0), 0) / withScore.length
            : 0;
        })()
      : null;
  const newsAggLabel =
    newsAggregate != null
      ? newsAggregate > 0.2
        ? "Bullish"
        : newsAggregate > 0.1
          ? "Slightly +"
          : newsAggregate < -0.2
            ? "Bearish"
            : newsAggregate < -0.1
              ? "Slightly −"
              : "Neutral"
      : null;
  const newsAggColor =
    newsAggregate != null
      ? newsAggregate > 0.1
        ? "#22c55e"
        : newsAggregate < -0.1
          ? "#ef4444"
          : "#94a3b8"
      : "#64748b";

  return (
    <div style={{ minWidth: 0, width: "100%", maxWidth: 1400, margin: "0 auto" }}>
      <h1 style={{ marginBottom: 4, fontSize: 22 }}>Research</h1>
      <p style={{ color: "#94a3b8", fontSize: 13, marginBottom: 20 }}>
        Pick a symbol from the watch list to load price, chart, signals, and a clear action.
      </p>

      {!activeSymbol && (
        <p style={{ color: "#64748b", fontSize: 13 }}>Add a symbol in the watch list above, then click it to load research.</p>
      )}

      {loading && <p style={{ color: "#94a3b8", fontSize: 13 }}>Loading {activeSymbol}…</p>}

      {error && activeSymbol && (
        <div style={{ padding: 12, background: "rgba(127,29,29,0.4)", borderRadius: 8, color: "#fecaca", marginBottom: 16, fontSize: 13 }}>
          {error}
        </div>
      )}

      {quote && (
        <>
          {/* At-a-glance: symbol, price, verdict (if any), confidence */}
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              gap: 16,
              marginBottom: 20,
              padding: "14px 18px",
              background: "#0f172a",
              borderRadius: 10,
              border: "1px solid #334155"
            }}
          >
            <div style={{ fontSize: 20, fontWeight: 700, color: "#e2e8f0" }}>{quote.symbol}</div>
            <div style={{ fontSize: 18, color: "#e2e8f0" }}>${quote.last.toFixed(2)}</div>
            {recommendation && (
              <>
                <div
                  style={{
                    padding: "6px 14px",
                    borderRadius: 8,
                    background:
                      recommendation.action === "buy"
                        ? "rgba(34,197,94,0.2)"
                        : recommendation.action === "sell"
                          ? "rgba(239,68,68,0.2)"
                          : "rgba(148,163,184,0.15)",
                    border: `2px solid ${recommendation.action === "buy" ? "#22c55e" : recommendation.action === "sell" ? "#ef4444" : "#64748b"}`,
                    color: recommendation.action === "buy" ? "#4ade80" : recommendation.action === "sell" ? "#f87171" : "#94a3b8",
                    fontWeight: 700,
                    fontSize: 14,
                    letterSpacing: "0.05em"
                  }}
                >
                  {recommendation.action}
                </div>
                <div
                  style={{ position: "relative", display: "inline-flex", alignItems: "center" }}
                  onMouseEnter={() => setConfidenceTooltipVisible(true)}
                  onMouseLeave={() => setConfidenceTooltipVisible(false)}
                >
                  <div style={{ fontSize: 13, color: "#94a3b8", display: "flex", alignItems: "center", gap: 6 }}>
                    {(recommendation.confidence * 100).toFixed(0)}% confidence
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        width: 16,
                        height: 16,
                        borderRadius: "50%",
                        background: "#334155",
                        color: "#94a3b8",
                        fontSize: 11,
                        fontWeight: 600,
                        cursor: "help"
                      }}
                    >
                      ?
                    </span>
                  </div>
                  {confidenceTooltipVisible && (
                    <div
                      style={{
                        position: "absolute",
                        left: 0,
                        top: "100%",
                        marginTop: 8,
                        padding: "10px 12px",
                        background: "#1e293b",
                        border: "1px solid #475569",
                        borderRadius: 8,
                        fontSize: 12,
                        color: "#e2e8f0",
                        lineHeight: 1.45,
                        maxWidth: 260,
                        zIndex: 1000,
                        boxShadow: "0 4px 12px rgba(0,0,0,0.4)"
                      }}
                    >
                      Confidence reflects how strongly the signals agree: trend (40%), momentum (30%), news sentiment (20%), and your existing position size. Higher = more conviction.
                    </div>
                  )}
                </div>
              </>
            )}
            <div style={{ fontSize: 12, color: "#64748b", marginLeft: "auto" }}>as of {quote.asOf.slice(0, 10)}</div>
          </div>

          {/* Signals row: your view + news aggregate */}
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              gap: 20,
              marginBottom: 20
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 12, color: "#94a3b8" }}>Your view:</span>
              {[
                { label: "Bearish", value: -0.5 },
                { label: "Neutral", value: 0 },
                { label: "Bullish", value: 0.5 }
              ].map(({ label, value }) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => handleSentimentChange(value)}
                  style={{
                    padding: "5px 12px",
                    borderRadius: 6,
                    border: userSentiment === value ? "2px solid #64748b" : "1px solid #334155",
                    background: userSentiment === value ? "#1e293b" : "transparent",
                    color: "#e2e8f0",
                    fontSize: 12,
                    cursor: "pointer",
                    fontWeight: userSentiment === value ? 600 : 400
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
            {newsWithSentiment !== null && (
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 12, color: "#94a3b8" }}>News:</span>
                {newsWithSentiment.length === 0 ? (
                  <span style={{ fontSize: 12, color: "#64748b" }}>No data (add API key in Settings)</span>
                ) : (
                  <span style={{ fontSize: 13, fontWeight: 600, color: newsAggColor }} title={`Aggregate: ${(newsAggregate ?? 0).toFixed(2)}`}>
                    {newsAggLabel} ({(newsAggregate ?? 0).toFixed(2)})
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Timeframe: single control for technical analysis + price chart */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              marginBottom: 12,
              flexWrap: "wrap"
            }}
          >
            <span style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Timeframe
            </span>
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                {(
                  [
                    ["15", "15m"],
                    ["60", "1H"],
                    ["120", "2H"],
                    ["240", "4H"],
                    ["D", "1D"],
                    ["W", "1W"],
                    ["1M", "1M"]
                  ] as [ChartInterval, string][]
                ).map(([iv, label]) => (
                  <button
                    key={iv}
                    type="button"
                    onClick={() => setChartInterval(iv)}
                    style={{
                      padding: "4px 8px",
                      borderRadius: 6,
                      border: chartInterval === iv ? "2px solid #64748b" : "1px solid #334155",
                      background: chartInterval === iv ? "#1e293b" : "transparent",
                      color: chartInterval === iv ? "#e2e8f0" : "#94a3b8",
                      fontSize: 10,
                      fontWeight: chartInterval === iv ? 600 : 400,
                      cursor: "pointer",
                      textTransform: "uppercase"
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
          </div>

          {/* Technical analysis: custom gauges */}
          <div style={{ marginBottom: 20 }}>
            <div
              style={{
                marginBottom: 6,
                fontSize: 11,
                color: "#64748b",
                textTransform: "uppercase",
                letterSpacing: "0.05em"
              }}
            >
              Technical analysis for {quote.symbol}
            </div>
            <div
              style={{
                borderRadius: 10,
                border: "1px solid #334155",
                background: "#0f172a"
              }}
            >
              <TechnicalGauges
                technicals={
                  points.length >= (chartInterval === "W" ? 100 : chartInterval === "1M" ? 252 : 30)
                    ? technicalSnapshot(points, chartInterval)
                    : null
                }
                summaryAction={recommendation?.action}
              />
            </div>
          </div>

          {/* Main content: chart + recommendation side by side, aligned at top */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: recommendation ? "minmax(0, 2fr) 300px" : "1fr",
              gap: 20,
              marginBottom: 24,
              alignItems: "stretch"
            }}
          >
            <div
              style={{
                minWidth: 0,
                padding: 16,
                borderRadius: 10,
                border: "1px solid #334155",
                background: "#0f172a"
              }}
            >
              <div style={{ fontSize: 11, color: "#64748b", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Price chart · RSI, Bollinger Bands, DPO, MA
              </div>
              <div style={{ width: "100%", minHeight: 400, borderRadius: 6, overflow: "hidden" }}>
                <TradingViewChart symbol={quote.symbol} height={400} interval={chartInterval} />
              </div>
            </div>
            {recommendation && (
              <div
                style={{
                  padding: 16,
                  borderRadius: 10,
                  border: "1px solid #334155",
                  background:
                    recommendation.action === "buy"
                      ? "rgba(34,197,94,0.08)"
                      : recommendation.action === "sell"
                        ? "rgba(239,68,68,0.08)"
                        : "#1e293b"
                }}
              >
                <div style={{ fontSize: 11, color: "#64748b", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Why this call
                </div>
                <p style={{ color: "#e2e8f0", fontSize: 14, lineHeight: 1.5, margin: 0 }}>{recommendation.rationale}</p>
                <p style={{ margin: "12px 0 0", fontSize: 11, color: "#64748b" }}>
                  Based on trend (20d SMA), momentum (RSI), news sentiment, and your view.
                </p>
              </div>
            )}
          </div>

          {/* News: expanded, prominent section */}
          {quote && newsWithSentiment !== null && newsWithSentiment.length > 0 && (
            <section
              style={{
                marginBottom: 24,
                padding: 20,
                borderRadius: 10,
                border: "1px solid #334155",
                background: "#0f172a"
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  marginBottom: 16,
                  paddingBottom: 12,
                  borderBottom: "1px solid #334155"
                }}
              >
                <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: "#e2e8f0" }}>News &amp; Sentiment</h2>
                <span
                  style={{
                    padding: "4px 10px",
                    borderRadius: 6,
                    fontSize: 12,
                    fontWeight: 600,
                    background: `${newsAggColor}22`,
                    color: newsAggColor
                  }}
                >
                  {newsAggLabel} ({(newsAggregate ?? 0).toFixed(2)})
                </span>
                <span style={{ fontSize: 12, color: "#64748b" }}>{newsWithSentiment.length} articles</span>
              </div>
              <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {newsWithSentiment.slice(0, 15).map((a) => {
                  const s = a.sentiment ?? 0;
                  const sentimentColor = s > 0.1 ? "#22c55e" : s < -0.1 ? "#ef4444" : "#94a3b8";
                  const stripHtml = (s: string) =>
                    (s ?? "")
                      .replace(/<[^>]*>/g, "")
                      .replace(/&nbsp;/g, " ")
                      .replace(/&amp;/g, "&")
                      .replace(/&lt;/g, "<")
                      .replace(/&gt;/g, ">")
                      .replace(/&quot;/g, '"')
                      .trim();
                  const h = stripHtml(a.headline ?? "").trim();
                  const urlTrimmed = (a.url ?? "").trim();
                  const headlineLooksLikeUrl =
                    !h || /^https?:\/\/|^www\./i.test(h) || h === urlTrimmed;
                  const summaryText = stripHtml(a.summary ?? "").trim();
                  const summaryLooksLikeUrl = /^https?:\/\/|^www\./i.test(summaryText) || summaryText === urlTrimmed;
                  const safeSummary = summaryText && !summaryLooksLikeUrl
                    ? (summaryText.length > 120 ? `${summaryText.slice(0, 120).trim()}…` : summaryText)
                    : null;
                  let linkText =
                    h && !headlineLooksLikeUrl
                      ? h
                      : safeSummary ?? "Read article";
                  if (/^https?:\/\/|^www\./i.test(linkText) || linkText === urlTrimmed) {
                    linkText = "Read article";
                  }
                  return (
                    <li
                      key={a.id}
                      style={{
                        marginBottom: 16,
                        paddingBottom: 16,
                        borderBottom: "1px solid #1e293b"
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 4 }}>
                        <span
                          style={{
                            color: sentimentColor,
                            fontVariantNumeric: "tabular-nums",
                            fontSize: 13,
                            fontWeight: 600,
                            minWidth: 36
                          }}
                        >
                          {s.toFixed(2)}
                        </span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <a
                            href={a.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              color: "#93c5fd",
                              textDecoration: "none",
                              fontSize: 14,
                              fontWeight: 500,
                              lineHeight: 1.4
                            }}
                          >
                            {linkText}
                          </a>
                          {summaryText && linkText !== summaryText && (
                            <p style={{ margin: "6px 0 0", fontSize: 13, color: "#94a3b8", lineHeight: 1.45 }}>{summaryText}</p>
                          )}
                          <span style={{ fontSize: 11, color: "#64748b", marginTop: 4, display: "inline-block" }}>{a.source}</span>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
              {newsWithSentiment.length > 15 && (
                <p style={{ fontSize: 12, color: "#64748b", marginTop: 8 }}>Showing 15 of {newsWithSentiment.length}</p>
              )}
            </section>
          )}

          {!recommendation && !loading && (
            <div style={{ padding: 12, background: "#1e293b", borderRadius: 8, border: "1px solid #334155", color: "#94a3b8", fontSize: 13, marginTop: 8 }}>
              Not enough data for a recommendation. Ensure history loaded for {quote.symbol}.
            </div>
          )}
        </>
      )}
    </div>
  );
};
