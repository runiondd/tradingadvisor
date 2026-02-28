import React, { useState, useCallback } from "react";
import type { AuthUser } from "../context/AuthContext";

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 6,
  border: "1px solid #334155",
  background: "#0f172a",
  color: "#e2e8f0",
  fontSize: 14,
  boxSizing: "border-box"
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 13,
  color: "#e2e8f0",
  marginBottom: 4
};

const sectionStyle: React.CSSProperties = { marginBottom: 16 };

type AuthMode = "login" | "signup";

interface AuthScreenProps {
  hasUsers: boolean;
  onLogin: (user: AuthUser, rememberMe?: boolean) => void;
  onSignup: (user: AuthUser, rememberMe?: boolean) => void;
}

export const AuthScreen: React.FC<AuthScreenProps> = ({ hasUsers, onLogin, onSignup }) => {
  const [mode, setMode] = useState<AuthMode>(hasUsers ? "login" : "signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);
      const inv = window.tradingApp?.invoke;
      if (!inv) {
        onLogin({ id: "dev", email: "dev@local", role: "admin" }, rememberMe);
        return;
      }
      setLoading(true);
      try {
        if (mode === "signup") {
          if (password.length < 8) {
            setError("Password must be at least 8 characters long.");
            return;
          }
          if (password !== confirmPassword) {
            setError("Passwords do not match.");
            return;
          }
          const res = await inv("auth:signup", { email: email.trim(), password });
          if (!res.ok) {
            setError(res.error ?? "Signup failed.");
            return;
          }
          const data = res.data as { user: AuthUser };
          onSignup(data.user, rememberMe);
        } else {
          const res = await inv("auth:login", { email: email.trim(), password });
          if (!res.ok) {
            setError(res.error ?? "Login failed.");
            return;
          }
          const data = res.data as { user: AuthUser };
          onLogin(data.user, rememberMe);
        }
      } catch (err) {
        setError(String(err));
      } finally {
        setLoading(false);
      }
    },
    [mode, email, password, confirmPassword, rememberMe, onLogin, onSignup]
  );

  const handleGoogleSignIn = useCallback(async () => {
    setError(null);
    const inv = window.tradingApp?.invoke;
    if (!inv) {
      setError("Google sign-in is not available in browser preview.");
      return;
    }
    setGoogleLoading(true);
    try {
      const res = await inv("auth:loginWithGoogle");
      if (!res.ok) {
        setError(res.error ?? "Google sign-in failed.");
        return;
      }
      const data = res.data as { user: AuthUser };
      onLogin(data.user, rememberMe);
    } catch (err) {
      setError(String(err));
    } finally {
      setGoogleLoading(false);
    }
  }, [onLogin, rememberMe]);

  return (
    <div style={{ maxWidth: 400, margin: "0 auto", padding: 32 }}>
      <h1 style={{ marginBottom: 8, color: "#f1f5f9" }}>
        {hasUsers ? "Sign in" : "Create your account"}
      </h1>
      <p style={{ color: "#94a3b8", marginBottom: 24, fontSize: 14 }}>
        {hasUsers
          ? "Sign in with email or use Google to access your portfolio."
          : "Create the first account. The first user is an administrator."}
      </p>

      <form onSubmit={handleSubmit}>
        <div style={sectionStyle}>
          <label style={labelStyle}>Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            style={inputStyle}
            required
            autoComplete="email"
          />
        </div>
        <div style={sectionStyle}>
          <label style={labelStyle}>{mode === "signup" ? "Password" : "Password"}</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={mode === "signup" ? "At least 8 characters" : ""}
            style={inputStyle}
            required={mode === "login"}
            minLength={mode === "signup" ? 8 : undefined}
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
          />
        </div>
        {mode === "login" && (
          <div style={{ ...sectionStyle, display: "flex", alignItems: "center", gap: 8 }}>
            <input
              type="checkbox"
              id="rememberMe"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              style={{ width: 18, height: 18, cursor: "pointer" }}
            />
            <label htmlFor="rememberMe" style={{ ...labelStyle, marginBottom: 0, cursor: "pointer" }}>
              Remember me
            </label>
          </div>
        )}
        {mode === "signup" && (
          <div style={sectionStyle}>
            <label style={labelStyle}>Confirm password</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Repeat password"
              style={inputStyle}
              required
              autoComplete="new-password"
            />
          </div>
        )}

        {error && (
          <div
            style={{
              marginBottom: 16,
              padding: 12,
              borderRadius: 6,
              background: "rgba(185, 28, 28, 0.3)",
              color: "#fecaca",
              fontSize: 13
            }}
          >
            {error}
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <button
            type="submit"
            disabled={loading}
            style={{
              padding: "10px 16px",
              borderRadius: 6,
              border: "none",
              background: "#3b82f6",
              color: "#fff",
              cursor: loading ? "not-allowed" : "pointer",
              fontWeight: 600,
              fontSize: 14
            }}
          >
            {loading ? "Please wait…" : mode === "signup" ? "Create account" : "Sign in"}
          </button>

          <>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ flex: 1, height: 1, background: "#334155" }} />
              <span style={{ fontSize: 12, color: "#64748b" }}>or</span>
              <div style={{ flex: 1, height: 1, background: "#334155" }} />
            </div>
            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={googleLoading}
              style={{
                padding: "10px 16px",
                borderRadius: 6,
                border: "1px solid #475569",
                background: "#1e293b",
                color: "#e2e8f0",
                cursor: googleLoading ? "not-allowed" : "pointer",
                fontWeight: 500,
                fontSize: 14,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8
              }}
            >
              {googleLoading ? (
                "Signing in…"
              ) : (
                <>
                  <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                    <path
                      d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"
                      fill="#4285F4"
                    />
                    <path
                      d="M9 18c2.43 0 4.467-.806 6.168-2.172l-2.908-2.258c-.806.54-1.837.86-3.26.86-2.508 0-4.64-1.693-5.4-4.042H.957v2.332C2.438 15.983 5.482 18 9 18z"
                      fill="#34A853"
                    />
                    <path
                      d="M3.6 10.712c-.18-.54-.282-1.117-.282-1.71 0-.593.102-1.17.282-1.71V5.67H.957C.347 6.983 0 8.44 0 9.998c0 1.558.348 3.015.957 4.329l2.643-2.258z"
                      fill="#FBBC05"
                    />
                    <path
                      d="M9 3.58c1.414 0 2.69.486 3.7 1.418l2.78-2.78C13.463.693 11.428 0 9 0 5.482 0 2.438 1.017.957 3.67L3.6 5.93C4.36 3.592 6.492 1.9 9 1.9z"
                      fill="#EA4335"
                    />
                  </svg>
                  {hasUsers ? "Sign in with Google" : "Create account with Google"}
                </>
              )}
            </button>
          </>
        </div>
      </form>

      {hasUsers && (
        <p style={{ marginTop: 20, fontSize: 13, color: "#94a3b8" }}>
          Don&apos;t have an account?{" "}
          <button
            type="button"
            onClick={() => {
              setMode("signup");
              setError(null);
            }}
            style={{
              background: "none",
              border: "none",
              color: "#60a5fa",
              cursor: "pointer",
              textDecoration: "underline",
              padding: 0
            }}
          >
            Create account
          </button>
        </p>
      )}
      {mode === "signup" && (
        <p style={{ marginTop: 20, fontSize: 13, color: "#94a3b8" }}>
          Already have an account?{" "}
          <button
            type="button"
            onClick={() => {
              setMode("login");
              setError(null);
            }}
            style={{
              background: "none",
              border: "none",
              color: "#60a5fa",
              cursor: "pointer",
              textDecoration: "underline",
              padding: 0
            }}
          >
            Sign in
          </button>
        </p>
      )}
      {!hasUsers && mode === "signup" && (
        <p style={{ marginTop: 12, fontSize: 13, color: "#94a3b8" }}>
          You can also create the first account with Google above. Add Google OAuth Client ID and Secret in Settings first.
        </p>
      )}
    </div>
  );
}
