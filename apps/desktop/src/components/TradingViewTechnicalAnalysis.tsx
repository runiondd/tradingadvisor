import React, { useEffect, useRef } from "react";

const WIDGET_SCRIPT_URL = "https://s3.tradingview.com/external-embedding/embed-widget-technical-analysis.js";

const HIDE_COPYRIGHT_STYLE = `
  .tradingview-widget-container .tradingview-widget-copyright { display: none !important; }
`;

function toTradingViewSymbol(symbol: string): string {
  const s = symbol.trim().toUpperCase();
  if (!s) return "NASDAQ:AAPL";
  const nyseEtfs = ["SPY", "QQQ", "IWM", "DIA", "GLD", "SLV", "TLT", "HYG", "LQD", "VOO", "VTI"];
  if (nyseEtfs.includes(s)) return `AMEX:${s}`;
  return `NASDAQ:${s}`;
}

export interface TradingViewTechnicalAnalysisProps {
  /** Ticker symbol, e.g. AAPL, SPY */
  symbol: string;
  /** Height in pixels (default 400) */
  height?: number;
  /** When true, scales the widget down to fit - use for compact layouts with all 3 dials visible */
  compact?: boolean;
}

/**
 * TradingView Technical Analysis widget: summary ratings including RSI,
 * oscillators, moving averages (mean reversion context), and buy/sell/neutral.
 * In compact mode: renders at full size then scales down to fit, no scrolling.
 */
const COMPACT_RENDER_HEIGHT = 220;

export const TradingViewTechnicalAnalysis: React.FC<TradingViewTechnicalAnalysisProps> = ({
  symbol,
  height = 420,
  compact = false
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const tvSymbol = toTradingViewSymbol(symbol);
  const renderHeight = compact ? Math.max(COMPACT_RENDER_HEIGHT, height) : height;
  const scale = compact && height < renderHeight ? height / renderHeight : 1;

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !tvSymbol) return;

    if (!document.getElementById("tv-ta-hide-copyright")) {
      const styleEl = document.createElement("style");
      styleEl.id = "tv-ta-hide-copyright";
      styleEl.textContent = HIDE_COPYRIGHT_STYLE;
      document.head.appendChild(styleEl);
    }

    let cancelled = false;
    const cleanup = () => {
      container.innerHTML = "";
    };

    const inject = () => {
      if (cancelled) return;
      const w = container.offsetWidth || 800;

      const widgetDiv = document.createElement("div");
      widgetDiv.className = "tradingview-widget-container__widget";
      widgetDiv.style.cssText = `height: ${renderHeight}px; width: 100%; min-height: ${renderHeight}px;`;

      const script = document.createElement("script");
      script.src = WIDGET_SCRIPT_URL;
      script.type = "text/javascript";
      script.async = true;
      script.innerHTML = JSON.stringify({
        interval: "1D",
        width: w,
        height: renderHeight,
        isTransparent: false,
        symbol: tvSymbol,
        showIntervalTabs: false,
        displayMode: "multiple",
        locale: "en",
        colorTheme: "dark"
      });

      container.innerHTML = "";
      container.appendChild(widgetDiv);
      container.appendChild(script);
    };

    requestAnimationFrame(() => {
      if (cancelled) return;
      inject();
    });

    return () => {
      cancelled = true;
      cleanup();
      document.getElementById("tv-ta-hide-copyright")?.remove();
    };
  }, [tvSymbol, renderHeight]);

  return (
    <div
      style={{
        height: `${height}px`,
        minHeight: `${height}px`,
        width: "100%",
        overflow: "hidden",
        flexShrink: 0
      }}
    >
      <div
        ref={containerRef}
        className="tradingview-widget-container"
        style={{
          height: `${renderHeight}px`,
          minHeight: `${renderHeight}px`,
          width: "100%",
          minWidth: 320,
          background: "#0f172a",
          borderRadius: 8,
          transform: scale < 1 ? `scale(${scale})` : undefined,
          transformOrigin: "top center"
        }}
      />
    </div>
  );
};
