import React from "react";

export const OptionsExplorerScreen: React.FC = () => {
  return (
    <div>
      <h1 style={{ marginBottom: 8 }}>Options</h1>
      <p style={{ color: "#94a3b8", marginBottom: 24 }}>
        View options chain and risk-adjusted trade ideas. Select an asset in Research first
        to see recommended contracts vs underlying.
      </p>
      <div
        style={{
          padding: 24,
          border: "1px dashed #334155",
          borderRadius: 8,
          color: "#64748b"
        }}
      >
        Options chain and optimizer results will appear here when an underlying is
        selected.
      </div>
    </div>
  );
};
