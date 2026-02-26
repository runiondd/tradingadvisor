import React from "react";

export const AssetDetailScreen: React.FC = () => {
  return (
    <div>
      <h1 style={{ marginBottom: 8 }}>Research</h1>
      <p style={{ color: "#94a3b8", marginBottom: 24 }}>
        Enter a symbol to see price chart, technicals, macro & sentiment, and Buy/Hold/Sell
        recommendation. Options ideas will appear when a symbol is selected.
      </p>
      <div
        style={{
          padding: 24,
          border: "1px dashed #334155",
          borderRadius: 8,
          color: "#64748b"
        }}
      >
        Symbol lookup and chart will be wired here (e.g. AAPL, SPY).
      </div>
    </div>
  );
};
