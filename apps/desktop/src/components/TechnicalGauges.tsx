import React, { useState } from "react";
import type { TechnicalSnapshot } from "../domain/commonTypes";

interface GaugeProps {
  label: string;
  value: number;
  min: number;
  max: number;
  format: (v: number) => string;
  getColor: (v: number) => string;
  helpText?: string;
}

function Gauge({ label, value, min, max, format, getColor, helpText }: GaugeProps) {
  const [tooltipVisible, setTooltipVisible] = useState(false);
  const size = 100;
  const strokeWidth = 8;
  const radius = (size - strokeWidth) / 2;
  const normalized = Math.max(min, Math.min(max, value));
  const pct = (normalized - min) / (max - min);
  const arcLength = Math.PI * radius;
  const dashOffset = arcLength * (1 - pct);

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: 1, minWidth: 0 }}>
      <svg width={size} height={size / 2 + 16} viewBox={`0 0 ${size} ${size / 2 + 16}`} style={{ overflow: "visible" }}>
        <path
          d={`M ${strokeWidth / 2} ${size / 2} A ${radius} ${radius} 0 0 1 ${size - strokeWidth / 2} ${size / 2}`}
          fill="none"
          stroke="#334155"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />
        <path
          d={`M ${strokeWidth / 2} ${size / 2} A ${radius} ${radius} 0 0 1 ${size - strokeWidth / 2} ${size / 2}`}
          fill="none"
          stroke={getColor(value)}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={arcLength}
          strokeDashoffset={dashOffset}
          style={{ transition: "stroke-dashoffset 0.3s ease, stroke 0.2s ease" }}
        />
        <text
          x={size / 2}
          y={size / 2 - 4}
          textAnchor="middle"
          fill="#e2e8f0"
          fontSize={14}
          fontWeight={600}
          fontVariantNumeric="tabular-nums"
        >
          {format(value)}
        </text>
      </svg>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 4,
          marginTop: 2,
          position: "relative"
        }}
        onMouseEnter={() => helpText && setTooltipVisible(true)}
        onMouseLeave={() => setTooltipVisible(false)}
      >
        <span style={{ fontSize: 10, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em" }}>
          {label}
        </span>
        {helpText && (
          <>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: 14,
                height: 14,
                borderRadius: "50%",
                background: "#334155",
                color: "#94a3b8",
                fontSize: 10,
                fontWeight: 600,
                cursor: "help"
              }}
            >
              ?
            </span>
            {tooltipVisible && (
              <div
                style={{
                  position: "absolute",
                  left: "50%",
                  top: "100%",
                  transform: "translateX(-50%)",
                  marginTop: 6,
                  padding: "12px 16px",
                  background: "#1e293b",
                  border: "1px solid #475569",
                  borderRadius: 8,
                  fontSize: 13,
                  color: "#e2e8f0",
                  lineHeight: 1.5,
                  minWidth: 280,
                  maxWidth: 380,
                  zIndex: 1000,
                  boxShadow: "0 4px 12px rgba(0,0,0,0.4)"
                }}
              >
                {helpText}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export interface TechnicalGaugesProps {
  technicals: TechnicalSnapshot | null;
  summaryAction?: "buy" | "sell" | "hold";
}

function lerpHex(a: string, b: string, t: number): string {
  const parse = (h: string) => ({
    r: parseInt(h.slice(1, 3), 16),
    g: parseInt(h.slice(3, 5), 16),
    b: parseInt(h.slice(5, 7), 16)
  });
  const ca = parse(a);
  const cb = parse(b);
  const r = Math.round(ca.r + (cb.r - ca.r) * t);
  const g = Math.round(ca.g + (cb.g - ca.g) * t);
  const bl = Math.round(ca.b + (cb.b - ca.b) * t);
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${bl.toString(16).padStart(2, "0")}`;
}

export const TechnicalGauges: React.FC<TechnicalGaugesProps> = ({ technicals, summaryAction }) => {
  const oscillatorsColor = (v: number) => {
    if (v < 30) {
      const t = v / 30;
      return lerpHex("#00e676", "#ffeb3b", t);
    }
    if (v > 70) {
      const t = (v - 70) / 30;
      return lerpHex("#ffeb3b", "#ff1744", t);
    }
    if (v < 50) {
      const t = (v - 30) / 20;
      return lerpHex("#ffeb3b", "#fffde7", t);
    }
    const t = (v - 50) / 20;
    return lerpHex("#fffde7", "#ffeb3b", t);
  };

  const movingAvgColor = (v: number) => {
    if (v < -0.2) {
      const t = Math.min(1, (-0.2 - v) / 0.8);
      return lerpHex("#ffeb3b", "#ff1744", t);
    }
    if (v > 0.2) {
      const t = Math.min(1, (v - 0.2) / 0.8);
      return lerpHex("#ffeb3b", "#00e676", t);
    }
    if (v < 0) {
      const t = (v + 0.2) / 0.2;
      return lerpHex("#ffeb3b", "#fffde7", t);
    }
    const t = v / 0.2;
    return lerpHex("#fffde7", "#ffeb3b", t);
  };

  const summaryColor = (action: "buy" | "sell" | "hold") => {
    if (action === "buy") return "#00e676";
    if (action === "sell") return "#ff1744";
    return "#ffeb3b";
  };

  const summaryValue = summaryAction === "buy" ? 1 : summaryAction === "sell" ? -1 : 0;
  const summaryLabel = summaryAction === "buy" ? "Buy" : summaryAction === "sell" ? "Sell" : "Hold";

  return (
    <div
      style={{
        display: "flex",
        gap: 24,
        alignItems: "flex-end",
        justifyContent: "center",
        padding: "16px 20px",
        width: "100%"
      }}
    >
      <Gauge
        label="Oscillators (RSI)"
        value={technicals?.momentumScore ?? 50}
        min={0}
        max={100}
        format={(v) => Math.round(v).toString()}
        getColor={oscillatorsColor}
        helpText="Relative Strength Index (0–100). Below 30 = oversold (potential bounce). Above 70 = overbought (potential pullback). 30–70 = neutral."
      />
      <Gauge
        label="Moving averages"
        value={technicals?.trendScore ?? 0}
        min={-1}
        max={1}
        format={(v) => (v > 0 ? `+${v.toFixed(2)}` : v.toFixed(2))}
        getColor={movingAvgColor}
        helpText="Price vs 20-day simple moving average. Positive = price above SMA (bullish trend). Negative = price below SMA (bearish trend)."
      />
      <Gauge
        label="Summary"
        value={summaryValue}
        min={-1}
        max={1}
        format={() => summaryLabel}
        getColor={() => summaryColor(summaryAction ?? "hold")}
        helpText="Combined signal from oscillators, moving averages, news sentiment, and your view. Buy = bullish signals align. Sell = bearish. Hold = mixed or neutral."
      />
    </div>
  );
};
