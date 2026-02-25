import React from "react";

export const DashboardScreen: React.FC = () => {
  return (
    <div style={{ padding: "16px", fontFamily: "system-ui" }}>
      <h1>Mac Trading Assistant</h1>
      <p>
        This is the initial dashboard shell. Portfolio, research, and options
        views will be wired into this layout as we implement the domain logic.
      </p>
    </div>
  );
};

