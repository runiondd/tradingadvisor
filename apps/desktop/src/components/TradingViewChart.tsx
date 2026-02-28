import React, { useEffect, useRef } from "react";

const WIDGET_SCRIPT_URL = "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";

/**
 * Maps a plain ticker to TradingView symbol (exchange:symbol).
 * Defaults to NASDAQ for US equities; common ETFs use NYSE.
 */
function toTradingViewSymbol(symbol: string): string {
  const s = symbol.trim().toUpperCase();
  if (!s) return "NASDAQ:AAPL";
  const nyseEtfs = ["SPY", "QQQ", "IWM", "DIA", "GLD", "SLV", "TLT", "HYG", "LQD", "VOO", "VTI"];
  if (nyseEtfs.includes(s)) return `AMEX:${s}`;
  return `NASDAQ:${s}`;
}

/** One chart: RSI, Bollinger Bands, Detrended Price Oscillator, and Moving Average. */
const DEFAULT_STUDIES = [
  "RSI@tv-basicstudies",
  "BB@tv-basicstudies",
  "DetrendedPriceOscillator@tv-basicstudies",
  "MASimple@tv-basicstudies"
];

export interface TradingViewChartProps {
  /** Ticker symbol, e.g. AAPL, SPY */
  symbol: string;
  /** Height in pixels (default 400) */
  height?: number;
  /** Chart interval: 15, 60, 120, 240 (min), D, W, 1M */
  interval?: "15" | "60" | "120" | "240" | "D" | "W" | "1M";
  /** Override default studies (e.g. mean reversion set). If not set, uses RSI + BB + MA. */
  studies?: string[];
}

export const TradingViewChart: React.FC<TradingViewChartProps> = ({
  symbol,
  height = 400,
  interval = "D",
  studies = DEFAULT_STUDIES
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const tvSymbol = toTradingViewSymbol(symbol);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !tvSymbol) return;

    let cancelled = false;
    const cleanup = () => {
      container.innerHTML = "";
    };

    const inject = () => {
      if (cancelled) return;
      const w = container.offsetWidth || 800;
      const h = height;

      const widgetDiv = document.createElement("div");
      widgetDiv.className = "tradingview-widget-container__widget";
      widgetDiv.style.cssText = `height: ${h - 32}px; width: 100%; min-height: ${h - 32}px;`;

      const script = document.createElement("script");
      script.src = WIDGET_SCRIPT_URL;
      script.type = "text/javascript";
      script.async = true;
      script.innerHTML = JSON.stringify({
        autosize: false,
        width: w,
        height: h - 32,
        symbol: tvSymbol,
        interval: interval === "1M" ? "1M" : interval,
        timezone: "exchange",
        theme: "dark",
        backgroundColor: "rgba(15, 23, 42, 1)",
        style: "1",
        hide_top_toolbar: false,
        hide_side_toolbar: false,
        allow_symbol_change: true,
        withdateranges: true,
        save_image: true,
        locale: "en",
        calendar: false,
        show_popup_button: true,
        popup_width: "1000",
        popup_height: "650",
        studies,
        support_host: "https://www.tradingview.com"
      });

      container.innerHTML = "";
      container.appendChild(widgetDiv);
      container.appendChild(script);
    };

    container.innerHTML = "";
    container.appendChild(document.createElement("div"));
    requestAnimationFrame(() => {
      if (cancelled) return;
      inject();
    });

    return () => {
      cancelled = true;
      cleanup();
    };
  }, [tvSymbol, interval, height, studies]);

  return (
    <div
      ref={containerRef}
      className="tradingview-widget-container"
      style={{
        height: `${height}px`,
        minHeight: `${height}px`,
        width: "100%",
        minWidth: 320,
        background: "#0f172a",
        borderRadius: 8,
        overflow: "hidden",
        flexShrink: 0
      }}
    />
  );
};
