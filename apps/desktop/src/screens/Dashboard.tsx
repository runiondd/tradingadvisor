import React from "react";

export const DashboardScreen: React.FC = () => {
  return (
    <div>
      <h1 style={{ marginBottom: 4 }}>Dashboard</h1>
      <p style={{ color: "#94a3b8", marginBottom: 24 }}>
        Portfolio summary, watchlist, and recommendations will appear here.
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <section
          style={{
            padding: 16,
            background: "#0f172a",
            borderRadius: 8,
            border: "1px solid #1e293b"
          }}
        >
          <h2 style={{ fontSize: 14, marginBottom: 8, color: "#94a3b8" }}>Portfolio</h2>
          <p style={{ margin: 0, color: "#64748b" }}>Total value and P&L – connect data to see.</p>
        </section>
        <section
          style={{
            padding: 16,
            background: "#0f172a",
            borderRadius: 8,
            border: "1px solid #1e293b"
          }}
        >
          <h2 style={{ fontSize: 14, marginBottom: 8, color: "#94a3b8" }}>Watchlist</h2>
          <p style={{ margin: 0, color: "#64748b" }}>
            Add symbols in Research; Buy/Hold/Sell badges will show here.
          </p>
        </section>
      </div>
    </div>
  );
};
