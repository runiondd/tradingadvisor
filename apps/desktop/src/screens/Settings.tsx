import React, { useState, useEffect, useCallback } from "react";

export const SettingsScreen: React.FC = () => {
  const [optionsKey, setOptionsKey] = useState("");
  const [alphaVantageOptionsKey, setAlphaVantageOptionsKey] = useState("");
  const [flatFilesAccessKey, setFlatFilesAccessKey] = useState("");
  const [flatFilesSecretKey, setFlatFilesSecretKey] = useState("");
  const [googleClientId, setGoogleClientId] = useState("");
  const [googleClientSecret, setGoogleClientSecret] = useState("");
  const [newsApiKey, setNewsApiKey] = useState("");
  const [llmProvider, setLlmProvider] = useState<"openai" | "anthropic">("openai");
  const [llmApiKey, setLlmApiKey] = useState("");
  const [saved, setSaved] = useState(false);

  const loadConfig = useCallback(async () => {
    if (typeof window.tradingApp?.invoke !== "function") return;
    const res = await window.tradingApp.invoke("config:get");
    if (res.ok && res.data && typeof res.data === "object") {
      const cfg = res.data as {
        options?: { apiKey?: string; alphaVantageApiKey?: string };
        flatFiles?: { accessKeyId?: string; secretAccessKey?: string };
        googleOAuth?: { clientId?: string; clientSecret?: string };
        news?: { apiKey?: string };
        llm?: { provider?: "openai" | "anthropic"; apiKey?: string };
      };
      setOptionsKey(cfg.options?.apiKey ?? "");
      setAlphaVantageOptionsKey(cfg.options?.alphaVantageApiKey ?? "");
      setFlatFilesAccessKey(cfg.flatFiles?.accessKeyId ?? "");
      setFlatFilesSecretKey(cfg.flatFiles?.secretAccessKey ?? "");
      setGoogleClientId(cfg.googleOAuth?.clientId ?? "");
      setGoogleClientSecret(cfg.googleOAuth?.clientSecret ?? "");
      setNewsApiKey(cfg.news?.apiKey ?? "");
      setLlmProvider((cfg.llm?.provider as "openai" | "anthropic") ?? "openai");
      setLlmApiKey(cfg.llm?.apiKey ?? "");
    }
  }, []);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  const save = async () => {
    if (typeof window.tradingApp?.invoke !== "function") return;
    const res = await window.tradingApp.invoke("config:get");
    const current = (res.ok && res.data ? res.data : {}) as Record<string, unknown>;
    const { market: _m, ...rest } = current;
    await window.tradingApp.invoke("config:set", {
      config: {
        ...rest,
        options:
          optionsKey.trim() || alphaVantageOptionsKey.trim()
            ? {
                type: "polygon",
                apiKey: optionsKey.trim() || undefined,
                alphaVantageApiKey: alphaVantageOptionsKey.trim() || undefined
              }
            : undefined,
        flatFiles:
          flatFilesAccessKey.trim() && flatFilesSecretKey.trim()
            ? { accessKeyId: flatFilesAccessKey.trim(), secretAccessKey: flatFilesSecretKey.trim() }
            : undefined,
        googleOAuth:
          googleClientId.trim() && googleClientSecret.trim()
            ? { clientId: googleClientId.trim(), clientSecret: googleClientSecret.trim() }
            : undefined,
        news: newsApiKey.trim() ? { type: "newsapi", apiKey: newsApiKey.trim() } : undefined,
        llm: llmApiKey.trim() ? { provider: llmProvider, apiKey: llmApiKey.trim() } : undefined
      }
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div>
      <h1 style={{ marginBottom: 8 }}>Settings</h1>
      <p style={{ color: "#94a3b8", marginBottom: 24 }}>
        API keys are stored locally. Polygon.io is used for Options and for Research (quotes & history).
      </p>

      <section style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 16, marginBottom: 8 }}>Polygon.io (options, Research quotes & history)</h2>
        <input
          type="password"
          placeholder="API key"
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
          Required for Options and Research. Get a key at polygon.io.
        </p>
      </section>

      <section style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 16, marginBottom: 8 }}>Alpha Vantage (options fallback – Greeks, bid/ask)</h2>
        <input
          type="password"
          placeholder="API key (optional)"
          value={alphaVantageOptionsKey}
          onChange={(e) => setAlphaVantageOptionsKey(e.target.value)}
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
          Optional. Used when Polygon lacks Greeks/bid/ask. Requires Alpha Vantage Premium (Historical Options). Get a key at{" "}
          <a href="https://www.alphavantage.co/premium/" target="_blank" rel="noopener noreferrer" style={{ color: "#93c5fd" }}>
            alphavantage.co
          </a>
          .
        </p>
      </section>

      <section style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 16, marginBottom: 8 }}>News API (Research sentiment)</h2>
        <input
          type="password"
          placeholder="News API key (e.g. NewsAPI.org)"
          value={newsApiKey}
          onChange={(e) => setNewsApiKey(e.target.value)}
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
          Optional. Enables the &quot;News sentiment&quot; section on the Research page. Get a free key at{" "}
          <a href="https://newsapi.org" target="_blank" rel="noopener noreferrer" style={{ color: "#93c5fd" }}>
            newsapi.org
          </a>
          .
        </p>
      </section>

      <section style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 16, marginBottom: 8 }}>LLM (news summarization &amp; sentiment)</h2>
        <p style={{ fontSize: 12, color: "#64748b", margin: "0 0 8px" }}>
          News is aggregated from Yahoo Finance and Google News RSS (no API key). Add an LLM key for AI summarization and sentiment scoring.
        </p>
        <select
          value={llmProvider}
          onChange={(e) => setLlmProvider(e.target.value as "openai" | "anthropic")}
          style={{
            padding: "8px 12px",
            borderRadius: 6,
            border: "1px solid #334155",
            background: "#0f172a",
            color: "#e2e8f0",
            marginBottom: 8,
            marginRight: 8
          }}
        >
          <option value="openai">OpenAI (GPT-4o-mini)</option>
          <option value="anthropic">Anthropic (Claude)</option>
        </select>
        <input
          type="password"
          placeholder="API key (optional)"
          value={llmApiKey}
          onChange={(e) => setLlmApiKey(e.target.value)}
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
          Get keys at{" "}
          <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer" style={{ color: "#93c5fd" }}>OpenAI</a>
          {" "}or{" "}
          <a href="https://console.anthropic.com/" target="_blank" rel="noopener noreferrer" style={{ color: "#93c5fd" }}>Anthropic</a>.
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
          {" "}and{" "}
          <a
            href="https://massive.com/docs/flat-files/quickstart#aws-s3-cli"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "#93c5fd" }}
          >
            AWS S3 CLI
          </a>
          .
        </p>
      </section>

      <section style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 16, marginBottom: 8 }}>Google sign-in (OAuth)</h2>
        <input
          type="text"
          placeholder="Google OAuth Client ID"
          value={googleClientId}
          onChange={(e) => setGoogleClientId(e.target.value)}
          style={{
            width: "100%",
            maxWidth: 400,
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
          placeholder="Google OAuth Client Secret"
          value={googleClientSecret}
          onChange={(e) => setGoogleClientSecret(e.target.value)}
          style={{
            width: "100%",
            maxWidth: 400,
            padding: "8px 12px",
            borderRadius: 6,
            border: "1px solid #334155",
            background: "#0f172a",
            color: "#e2e8f0",
            marginBottom: 8
          }}
        />
        <p style={{ fontSize: 12, color: "#64748b", margin: 0 }}>
          Required for &quot;Sign in with Google&quot; on the login screen. In{" "}
          <a
            href="https://console.cloud.google.com/apis/credentials"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "#93c5fd" }}
          >
            Google Cloud Console
          </a>
          : create OAuth 2.0 credentials (application type &quot;Web application&quot;). Add this exact Authorized redirect URI:{" "}
          <code style={{ fontSize: 11, background: "#1e293b", padding: "2px 4px", borderRadius: 4 }}>http://127.0.0.1:3456</code>
          . Copy the Client ID and Client Secret here and Save.
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
