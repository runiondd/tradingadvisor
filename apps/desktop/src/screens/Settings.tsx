import React from "react";

export const SettingsScreen: React.FC = () => {
  return (
    <div>
      <h1 style={{ marginBottom: 8 }}>Settings</h1>
      <p style={{ color: "#94a3b8", marginBottom: 24 }}>
        Manage API keys, data providers, and risk preferences. Keys are stored in your
        system keychain.
      </p>
      <section style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 16, marginBottom: 8 }}>Data providers</h2>
        <ul style={{ color: "#94a3b8", margin: 0, paddingLeft: 20 }}>
          <li>Market: Alpha Vantage (configure in onboarding or here when wired)</li>
          <li>Options: Stub – add Polygon or other when ready</li>
          <li>Macro: FRED (optional)</li>
          <li>News: NewsAPI (optional)</li>
        </ul>
      </section>
      <section>
        <h2 style={{ fontSize: 16, marginBottom: 8 }}>Risk profile</h2>
        <p style={{ color: "#94a3b8" }}>
          Conservative / Balanced / Aggressive – to be wired to decision engine and options
          optimizer.
        </p>
      </section>
    </div>
  );
};
