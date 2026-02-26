import React from "react";

export const PortfolioScreen: React.FC = () => {
  return (
    <div>
      <h1 style={{ marginBottom: 8 }}>Portfolio</h1>
      <p style={{ color: "#94a3b8", marginBottom: 24 }}>
        View positions and P&L. Import via CSV or connect a broker (read-only) when
        available.
      </p>
      <div
        style={{
          padding: 24,
          border: "1px dashed #334155",
          borderRadius: 8,
          color: "#64748b",
          textAlign: "center"
        }}
      >
        No positions loaded. Use &quot;Import CSV&quot; to add positions from your broker
        export.
      </div>
    </div>
  );
};
