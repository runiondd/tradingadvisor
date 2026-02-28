import React, { useState } from "react";

interface OnboardingProps {
  onComplete: () => void;
}

export const OnboardingScreen: React.FC<OnboardingProps> = ({ onComplete }) => {
  const [step, setStep] = useState(0);
  const [apiKey, setApiKey] = useState("");

  return (
    <div style={{ maxWidth: 480, margin: "0 auto" }}>
      <h1 style={{ marginBottom: 8 }}>Welcome to Mac Trading Assistant</h1>
      <p style={{ color: "#94a3b8", marginBottom: 24 }}>
        Set up data providers and preferences. You can change these later in Settings.
      </p>

      {step === 0 && (
        <>
          <h2 style={{ fontSize: 16, marginBottom: 12 }}>Polygon.io (Research & Options)</h2>
          <p style={{ color: "#94a3b8", marginBottom: 8 }}>
            Enter your Polygon API key for Research (quotes & history) and Options. Get one at polygon.io.
          </p>
          <input
            type="password"
            placeholder="API key"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            style={{
              width: "100%",
              padding: "10px 12px",
              borderRadius: 6,
              border: "1px solid #334155",
              background: "#0f172a",
              color: "#e2e8f0",
              marginBottom: 16
            }}
          />
          <button
            type="button"
            onClick={async () => {
              if (typeof window.tradingApp?.invoke === "function" && apiKey.trim()) {
                await window.tradingApp.invoke("config:set", { config: { options: { type: "polygon", apiKey: apiKey.trim() } } });
              }
              setStep(1);
            }}
            style={{
              padding: "10px 20px",
              borderRadius: 6,
              border: "none",
              background: "#3b82f6",
              color: "#fff",
              cursor: "pointer"
            }}
          >
            Next
          </button>
        </>
      )}

      {step === 1 && (
        <>
          <h2 style={{ fontSize: 16, marginBottom: 12 }}>Portfolio</h2>
          <p style={{ color: "#94a3b8", marginBottom: 16 }}>
            You can import positions via CSV later from Portfolio, or connect a broker when
            available.
          </p>
          <button
            type="button"
            onClick={onComplete}
            style={{
              padding: "10px 20px",
              borderRadius: 6,
              border: "none",
              background: "#22c55e",
              color: "#fff",
              cursor: "pointer"
            }}
          >
            Finish
          </button>
        </>
      )}
    </div>
  );
};
