import React, { useState, useEffect, useCallback } from "react";

export const SettingsScreen: React.FC = () => {
  const [marketKey, setMarketKey] = useState("");
  const [optionsKey, setOptionsKey] = useState("");
  const [flatFilesAccessKey, setFlatFilesAccessKey] = useState("");
  const [flatFilesSecretKey, setFlatFilesSecretKey] = useState("");
  const [saved, setSaved] = useState(false);

  const loadConfig = useCallback(async () => {
    if (typeof window.tradingApp?.invoke !== "function") return;
    const res = await window.tradingApp.invoke("config:get");
    if (res.ok && res.data && typeof res.data === "object") {
      const cfg = res.data as {
        market?: { apiKey?: string };
        options?: { apiKey?: string };
        flatFiles?: { accessKeyId?: string; secretAccessKey?: string };
      };
      setMarketKey(cfg.market?.apiKey ?? "");
      setOptionsKey(cfg.options?.apiKey ?? "");
      setFlatFilesAccessKey(cfg.flatFiles?.accessKeyId ?? "");
      setFlatFilesSecretKey(cfg.flatFiles?.secretAccessKey ?? "");
    }
  }, []);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  const save = async () => {
    if (typeof window.tradingApp?.invoke !== "function") return;
    const res = await window.tradingApp.invoke("config:get");
    const current = (res.ok && res.data ? res.data : {}) as Record<string, unknown>;
    await window.tradingApp.invoke("config:set", {
      config: {
        ...current,
        market: { type: "alpha-vantage", apiKey: marketKey.trim() || undefined },
        options: optionsKey.trim() ? { type: "polygon", apiKey: optionsKey.trim() } : undefined,
        flatFiles:
          flatFilesAccessKey.trim() && flatFilesSecretKey.trim()
            ? { accessKeyId: flatFilesAccessKey.trim(), secretAccessKey: flatFilesSecretKey.trim() }
            : undefined
      }
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div>
      <h1 style={{ marginBottom: 8 }}>Settings</h1>
      <p style={{ color: "#94a3b8", marginBottom: 24 }}>
        API keys are stored locally. Market data: Alpha Vantage. Options: Polygon.io (real-time
        pricing and greeks).
      </p>

      <section style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 16, marginBottom: 8 }}>Alpha Vantage (market & history)</h2>
        <input
          type="password"
          placeholder="API key"
          value={marketKey}
          onChange={(e) => setMarketKey(e.target.value)}
          style={{
            width: "100%",
            maxWidth: 320,
            padding: "8px 12px",
            borderRadius: 6,
            border: "1px solid #334155",
            background: "#0f172a",
            color: "#e2e8f0",
            marginBottom: 8
          }}
        />
      </section>

      <section style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 16, marginBottom: 8 }}>Polygon.io (options chain, real-time & greeks)</h2>
        <input
          type="password"
          placeholder="API key (optional)"
          value={optionsKey}
          onChange={(e) => setOptionsKey(e.target.value)}
          style={{
            width: "100%",
            maxWidth: 320,
            padding: "8px 12px",
            borderRadius: 6,
            border: "1px solid #334155",
            background: "#0f172a",
            color: "#e2e8f0",
            marginBottom: 8
          }}
        />
        <p style={{ fontSize: 12, color: "#64748b", margin: 0 }}>
          Required for Options screen. Get a key at polygon.io.
        </p>
      </section>

      <section style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 16, marginBottom: 8 }}>Flat files (S3) – historical options</h2>
        <input
          type="text"
          placeholder="S3 Access Key ID"
          value={flatFilesAccessKey}
          onChange={(e) => setFlatFilesAccessKey(e.target.value)}
          style={{
            width: "100%",
            maxWidth: 320,
            padding: "8px 12px",
            borderRadius: 6,
            border: "1px solid #334155",
            background: "#0f172a",
            color: "#e2e8f0",
            marginBottom: 8
          }}
        />
        <input
          type="password"
          placeholder="S3 Secret Access Key"
          value={flatFilesSecretKey}
          onChange={(e) => setFlatFilesSecretKey(e.target.value)}
          style={{
            width: "100%",
            maxWidth: 320,
            padding: "8px 12px",
            borderRadius: 6,
            border: "1px solid #334155",
            background: "#0f172a",
            color: "#e2e8f0",
            marginBottom: 8
          }}
        />
        <p style={{ fontSize: 12, color: "#64748b", margin: 0 }}>
          For &quot;Download from S3&quot; on the Options screen. Get S3 credentials from your Polygon/Massive dashboard (flat files subscription). See{" "}
          <a
            href="https://massive.com/docs/flat-files/quickstart#setting-up-s3-access"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "#93c5fd" }}
          >
            Setting up S3 access
          </a>
          .
        </p>
      </section>

      <button
        type="button"
        onClick={save}
        style={{
          padding: "8px 16px",
          borderRadius: 6,
          border: "none",
          background: saved ? "#22c55e" : "#3b82f6",
          color: "#fff",
          cursor: "pointer"
        }}
      >
        {saved ? "Saved" : "Save"}
      </button>

      <section style={{ marginTop: 32 }}>
        <h2 style={{ fontSize: 16, marginBottom: 8 }}>Risk profile</h2>
        <p style={{ color: "#94a3b8" }}>
          Conservative / Balanced / Aggressive – to be wired to decision engine and options
          optimizer.
        </p>
      </section>
    </div>
  );
};
