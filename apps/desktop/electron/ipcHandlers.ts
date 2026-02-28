import { ipcMain, dialog, BrowserWindow } from "electron";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { createServer } from "node:http";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import {
  getProviderConfigJson,
  setProviderConfigJson,
  getPositions,
  saveAccount,
  clearPositionsForAccount,
  savePosition,
  upsertPcHistory,
  getPcHistoryBySymbol,
  upsertPcHistoryBatch,
  getUsers,
  getUserById,
  getUserByEmail,
  getUserByGoogleId,
  createUser,
  setUserPassword,
  deleteUser,
  linkGoogleId,
  getAuthPasswordHash,
  setAuthPasswordHash,
  type PcHistoryRow
} from "./storage";
import { subscribe as realtimeSubscribe, unsubscribe as realtimeUnsubscribe } from "./realtimeSocket";

const ALPHA_BASE = "https://www.alphavantage.co/query";

function getMarketApiKey(): string | null {
  const raw = getProviderConfigJson();
  if (!raw) return null;
  try {
    const cfg = JSON.parse(raw) as { market?: { apiKey?: string } };
    return cfg.market?.apiKey ?? null;
  } catch {
    return null;
  }
}

function getOptionsApiKey(): string | null {
  const raw = getProviderConfigJson();
  if (!raw) return null;
  try {
    const cfg = JSON.parse(raw) as { options?: { apiKey?: string } };
    return cfg.options?.apiKey ?? null;
  } catch {
    return null;
  }
}

function getAlphaVantageOptionsKey(): string | null {
  const raw = getProviderConfigJson();
  if (!raw) return null;
  try {
    const cfg = JSON.parse(raw) as { options?: { alphaVantageApiKey?: string } };
    return cfg.options?.alphaVantageApiKey ?? null;
  } catch {
    return null;
  }
}

function getNewsApiKey(): string | null {
  const raw = getProviderConfigJson();
  if (!raw) return null;
  try {
    const cfg = JSON.parse(raw) as { news?: { apiKey?: string; baseUrl?: string } };
    return cfg.news?.apiKey ?? null;
  } catch {
    return null;
  }
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

ipcMain.handle("config:get", () => {
  try {
    const raw = getProviderConfigJson();
    return { ok: true, data: raw ? JSON.parse(raw) : null };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
});

ipcMain.handle("config:set", (_event, payload: { config: unknown }) => {
  try {
    setProviderConfigJson(JSON.stringify(payload.config));
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
});

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password: string, stored: string): boolean {
  const [salt, key] = stored.split(":");
  if (!salt || !key) return false;
  const derived = scryptSync(password, salt, 64);
  const keyBuf = Buffer.from(key, "hex");
  if (keyBuf.length !== derived.length) return false;
  return timingSafeEqual(keyBuf, derived);
}

ipcMain.handle("auth:status", () => {
  try {
    const users = getUsers();
    return { ok: true, data: { hasUsers: users.length > 0 } };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
});

ipcMain.handle("auth:checkRemembered", (_event, payload: { userId: string }) => {
  try {
    const user = getUserById(payload.userId ?? "");
    if (!user) return { ok: false, error: "User not found" };
    return { ok: true, data: { user: { id: user.id, email: user.email, role: user.role } } };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
});

ipcMain.handle("auth:signup", (_event, payload: { email: string; password: string }) => {
  try {
    const email = (payload.email ?? "").trim().toLowerCase();
    const password = payload.password ?? "";
    if (!email || !password) return { ok: false, error: "Email and password required." };
    if (password.length < 8) return { ok: false, error: "Password must be at least 8 characters." };
    if (getUserByEmail(email)) return { ok: false, error: "An account with this email already exists." };
    const user = createUser({ email, passwordHash: hashPassword(password) });
    return { ok: true, data: { user: { id: user.id, email: user.email, role: user.role } } };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
});

ipcMain.handle("auth:login", (_event, payload: { email: string; password: string }) => {
  try {
    const email = (payload.email ?? "").trim().toLowerCase();
    const password = payload.password ?? "";
    const user = getUserByEmail(email);
    if (!user || !user.passwordHash) return { ok: false, error: "Invalid email or password." };
    if (!verifyPassword(password, user.passwordHash)) return { ok: false, error: "Invalid email or password." };
    return { ok: true, data: { user: { id: user.id, email: user.email, role: user.role } } };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
});

const GOOGLE_OAUTH_REDIRECT_PORT = 3456;
const GOOGLE_OAUTH_TIMEOUT_MS = 5 * 60 * 1000;
// Must match exactly what you add in Google Cloud Console → Credentials → Authorized redirect URIs
const GOOGLE_OAUTH_REDIRECT_URI = `http://127.0.0.1:${GOOGLE_OAUTH_REDIRECT_PORT}`;

ipcMain.handle("auth:loginWithGoogle", async () => {
  try {
    const raw = getProviderConfigJson();
    const cfg = raw ? (JSON.parse(raw) as { googleOAuth?: { clientId?: string; clientSecret?: string } }) : {};
    const clientId = cfg.googleOAuth?.clientId?.trim();
    const clientSecret = cfg.googleOAuth?.clientSecret?.trim();
    if (!clientId || !clientSecret) {
      return { ok: false, error: "Google OAuth not configured. Add Client ID and Secret in Settings." };
    }
    const state = randomBytes(16).toString("hex");
    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(GOOGLE_OAUTH_REDIRECT_URI)}&response_type=code&scope=${encodeURIComponent("openid email profile")}&state=${state}&access_type=offline&prompt=consent`;
    let closedByApp = false;
    let authWindow: BrowserWindow | null = null;
    const result = await new Promise<{ ok: boolean; code?: string; error?: string }>((resolve) => {
      const server = createServer((req, res) => {
        const url = new URL(req.url ?? "/", GOOGLE_OAUTH_REDIRECT_URI);
        const pathOk = url.pathname === "/" || url.pathname === "/callback";
        if (!pathOk || !url.searchParams.get("code")) {
          res.writeHead(400, { "Content-Type": "text/html" });
          res.end("<body>Invalid redirect. Close this window.</body>");
          return;
        }
        const returnedState = url.searchParams.get("state");
        if (returnedState !== state) {
          res.writeHead(400, { "Content-Type": "text/html" });
          res.end("<body>Invalid state. Close this window.</body>");
          server.close();
          resolve({ ok: false, error: "Invalid state." });
          return;
        }
        const code = url.searchParams.get("code");
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end("<body>Sign-in complete. You can close this window and return to the app.</body>");
        server.close();
        closedByApp = true;
        if (authWindow && !authWindow.isDestroyed()) authWindow.close();
        resolve({ ok: true, code: code ?? undefined });
      });
      server.listen(GOOGLE_OAUTH_REDIRECT_PORT, "127.0.0.1", () => {
        authWindow = new BrowserWindow({ width: 500, height: 700, show: true });
        authWindow.loadURL(authUrl);
        authWindow.on("closed", () => {
          if (!closedByApp) {
            server.close();
            resolve({ ok: false, error: "Sign-in was cancelled." });
          }
        });
      });
      setTimeout(() => {
        if (!closedByApp) {
          server.close();
          if (authWindow && !authWindow.isDestroyed()) authWindow.close();
          resolve({ ok: false, error: "Sign-in timed out." });
        }
      }, GOOGLE_OAUTH_TIMEOUT_MS);
    });
    if (!result.ok || !result.code) return { ok: false, error: result.error ?? "Google sign-in failed." };
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code: result.code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: GOOGLE_OAUTH_REDIRECT_URI,
        grant_type: "authorization_code"
      }).toString()
    });
    if (!tokenRes.ok) {
      const err = await tokenRes.text();
      return { ok: false, error: `Token exchange failed: ${err}` };
    }
    const tokens = (await tokenRes.json()) as { access_token?: string };
    const accessToken = tokens.access_token;
    if (!accessToken) return { ok: false, error: "No access token from Google." };
    const userInfoRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!userInfoRes.ok) return { ok: false, error: "Failed to fetch Google profile." };
    const profile = (await userInfoRes.json()) as { id?: string; email?: string };
    const googleId = profile.id;
    const email = (profile.email ?? "").trim().toLowerCase();
    if (!googleId || !email) return { ok: false, error: "Google profile missing id or email." };
    let user = getUserByGoogleId(googleId);
    if (user) {
      return { ok: true, data: { user: { id: user.id, email: user.email, role: user.role } } };
    }
    user = getUserByEmail(email);
    if (user) {
      linkGoogleId(user.id, googleId);
      return { ok: true, data: { user: { id: user.id, email: user.email, role: user.role } } };
    }
    user = createUser({ email, googleId });
    return { ok: true, data: { user: { id: user.id, email: user.email, role: user.role } } };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
});

ipcMain.handle("auth:users", (_event, payload: { adminUserId: string }) => {
  try {
    const admin = getUserById(payload.adminUserId ?? "");
    if (!admin || admin.role !== "admin") return { ok: false, error: "Unauthorized." };
    const users = getUsers();
    return {
      ok: true,
      data: {
        users: users.map((u) => ({ id: u.id, email: u.email, role: u.role }))
      }
    };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
});

ipcMain.handle("auth:userAdd", (_event, payload: { adminUserId: string; email: string; password: string; role?: "admin" | "user" }) => {
  try {
    const admin = getUserById(payload.adminUserId ?? "");
    if (!admin || admin.role !== "admin") return { ok: false, error: "Unauthorized." };
    const email = (payload.email ?? "").trim().toLowerCase();
    const password = payload.password ?? "";
    if (!email || !password) return { ok: false, error: "Email and password required." };
    if (password.length < 8) return { ok: false, error: "Password must be at least 8 characters." };
    if (getUserByEmail(email)) return { ok: false, error: "An account with this email already exists." };
    createUser({ email, passwordHash: hashPassword(password), role: payload.role ?? "user" });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
});

ipcMain.handle("auth:userRemove", (_event, payload: { adminUserId: string; targetUserId: string }) => {
  try {
    const admin = getUserById(payload.adminUserId ?? "");
    if (!admin || admin.role !== "admin") return { ok: false, error: "Unauthorized." };
    const targetId = payload.targetUserId ?? "";
    if (targetId === admin.id) return { ok: false, error: "Cannot remove yourself." };
    const all = getUsers();
    const adminCount = all.filter((u) => u.role === "admin").length;
    if (adminCount <= 1) {
      const target = getUserById(targetId);
      if (target?.role === "admin") return { ok: false, error: "Cannot remove the last admin." };
    }
    deleteUser(targetId);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
});

ipcMain.handle("portfolio:list", () => {
  try {
    const positions = getPositions();
    return { ok: true, data: positions };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
});

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') inQuotes = !inQuotes;
    else if ((c === "," && !inQuotes) || c === "\t") {
      result.push(current.trim());
      current = "";
    } else current += c;
  }
  result.push(current.trim());
  return result;
}

ipcMain.handle("portfolio:importCsv", (_event, payload: { csv: string; accountId?: string }) => {
  try {
    const csv = payload.csv;
    const accountId = payload.accountId ?? "csv-import-1";
    const lines = csv.trim().split(/\r?\n/).filter(Boolean);
    if (lines.length === 0) return { ok: true, data: { imported: 0 } };

    const hasHeader = lines[0].toLowerCase().includes("symbol") && (lines[0].toLowerCase().includes("quantity") || lines[0].toLowerCase().includes("qty"));
    const start = hasHeader ? 1 : 0;

    saveAccount(accountId, "CSV", "Imported from CSV", "USD", false);
    clearPositionsForAccount(accountId);

    let imported = 0;
    for (let i = start; i < lines.length; i++) {
      const parts = parseCsvLine(lines[i]);
      if (parts.length < 3) continue;
      const symbol = parts[0].trim();
      const quantity = Number(parts[1].replace(/,/g, ""));
      const averagePrice = Number(parts[2].replace(/,/g, ""));
      if (!symbol || Number.isNaN(quantity) || Number.isNaN(averagePrice)) continue;
      const id = `csv-${accountId}-${i}-${symbol}`;
      savePosition(id, accountId, symbol, "equity", quantity, "long", averagePrice);
      imported++;
    }
    return { ok: true, data: { imported } };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
});

async function fetchPolygonQuote(symbol: string, apiKey: string): Promise<{ last: number } | null> {
  try {
    const url = `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers/${encodeURIComponent(symbol)}?apiKey=${apiKey}`;
    const data = await fetchJson<{
      ticker?: { lastTrade?: { p?: number }; prevDay?: { c?: number }; day?: { c?: number } };
      status?: string;
    }>(url);
    const t = data.ticker;
    if (!t) return null;
    const last = t.lastTrade?.p ?? t.day?.c ?? t.prevDay?.c;
    if (last == null) return null;
    return { last: Number(last) };
  } catch {
    return null;
  }
}

ipcMain.handle("market:quote", async (_event, payload: { symbol: string }) => {
  const polygonKey = getOptionsApiKey();
  if (polygonKey) {
    const result = await fetchPolygonQuote(payload.symbol.trim().toUpperCase(), polygonKey);
    if (result) return { ok: true, data: { symbol: payload.symbol, last: result.last, asOf: new Date().toISOString() } };
  }
  const apiKey = getMarketApiKey();
  if (!apiKey) return { ok: false, error: "No market API key configured. Add Polygon key (Settings → Options) or Alpha Vantage key for Research." };
  try {
    const url = `${ALPHA_BASE}?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(payload.symbol)}&apikey=${apiKey}`;
    const data = await fetchJson<{
      "Global Quote"?: Record<string, string>;
      "Error Message"?: string;
      Note?: string;
      Information?: string;
    }>(url);
    const errMsg = data["Error Message"];
    const note = data.Note;
    const info = data.Information;
    if (errMsg) return { ok: false, error: errMsg };
    if (note) return { ok: false, error: note };
    if (info) return { ok: false, error: info };
    const quote = data["Global Quote"];
    const price = quote?.["05. price"];
    if (price == null || price === "") {
      return {
        ok: false,
        error:
          "No quote data. Check that the symbol is valid (e.g. AAPL, TSLA) and your Alpha Vantage key is correct. Free tier: 25 calls/day, 5/min."
      };
    }
    return { ok: true, data: { symbol: payload.symbol, last: Number(price), asOf: new Date().toISOString() } };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
});

ipcMain.handle("market:tickerDetails", async (_event, payload: { symbol: string }) => {
  const apiKey = getOptionsApiKey();
  if (!apiKey) return { ok: false, error: "Polygon API key required (Settings → Polygon.io)." };
  const symbol = (payload.symbol ?? "").trim().toUpperCase();
  if (!symbol) return { ok: false, error: "Symbol required." };
  try {
    const url = `https://api.polygon.io/v3/reference/tickers/${encodeURIComponent(symbol)}?apiKey=${apiKey}`;
    const data = await fetchJson<{ results?: { name?: string }; status?: string }>(url);
    const name = data.results?.name ?? null;
    return { ok: true, data: { name } };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
});

type AlphaBar = {
  "1. open": string;
  "2. high": string;
  "3. low": string;
  "4. close": string;
  "5. adjusted close"?: string;
  "6. volume"?: string;
};

function extractSeries(data: Record<string, unknown>): Record<string, AlphaBar> | null {
  if (data["Error Message"] || data.Note) return null;
  const exact = data["Time Series (Daily)"];
  if (exact && typeof exact === "object") return exact as Record<string, AlphaBar>;
  const key = Object.keys(data).find((k) => k.startsWith("Time Series"));
  if (key) {
    const val = data[key];
    return val && typeof val === "object" ? (val as Record<string, AlphaBar>) : null;
  }
  return null;
}

type PolygonBar = { o?: number; h?: number; l?: number; c?: number; v?: number; t?: number };

async function fetchPolygonHistory(
  symbol: string,
  apiKey: string,
  multiplier: number,
  timespan: "minute" | "hour" | "day" | "week" | "month",
  daysBack: number
): Promise<{ points: { timestamp: string; open: number; high: number; low: number; close: number; volume: number }[] } | null> {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - daysBack);
  const fromStr = from.toISOString().slice(0, 10);
  const toStr = to.toISOString().slice(0, 10);
  const url = `https://api.polygon.io/v2/aggs/ticker/${encodeURIComponent(symbol)}/range/${multiplier}/${timespan}/${fromStr}/${toStr}?apiKey=${apiKey}`;
  try {
    const data = await fetchJson<{ results?: PolygonBar[] }>(url);
    const results = data.results ?? [];
    if (results.length === 0) return null;
    const points = results.map((bar: PolygonBar) => ({
      timestamp: new Date(bar.t ?? 0).toISOString(),
      open: Number(bar.o ?? 0),
      high: Number(bar.h ?? 0),
      low: Number(bar.l ?? 0),
      close: Number(bar.c ?? 0),
      volume: Number(bar.v ?? 0)
    }));
    points.sort((a, b) => (a.timestamp < b.timestamp ? -1 : 1));
    return { points };
  } catch {
    return null;
  }
}

const INTERVAL_CONFIG: Record<
  string,
  { multiplier: number; timespan: "minute" | "hour" | "day" | "week" | "month"; daysBack: number; tvInterval: string }
> = {
  "15": { multiplier: 15, timespan: "minute", daysBack: 5, tvInterval: "15" },
  "60": { multiplier: 1, timespan: "hour", daysBack: 60, tvInterval: "60" },
  "120": { multiplier: 2, timespan: "hour", daysBack: 120, tvInterval: "120" },
  "240": { multiplier: 4, timespan: "hour", daysBack: 120, tvInterval: "240" },
  D: { multiplier: 1, timespan: "day", daysBack: 365, tvInterval: "D" },
  W: { multiplier: 1, timespan: "week", daysBack: 730, tvInterval: "W" },
  "1M": { multiplier: 1, timespan: "month", daysBack: 1825, tvInterval: "1M" }
};

ipcMain.handle("market:history", async (_event, payload: { symbol: string; interval?: string }) => {
  const polygonKey = getOptionsApiKey();
  const symbol = payload.symbol.trim().toUpperCase();
  const interval = payload.interval ?? "D";
  const config = INTERVAL_CONFIG[interval];

  if (polygonKey && config) {
    const polygon = await fetchPolygonHistory(
      symbol,
      polygonKey,
      config.multiplier,
      config.timespan,
      config.daysBack
    );
    if (polygon && polygon.points.length > 0) {
      return { ok: true, data: { symbol: payload.symbol, points: polygon.points } };
    }
  }

  if (polygonKey && !config) {
    const polygon = await fetchPolygonHistory(symbol, polygonKey, 1, "day", 365);
    if (polygon && polygon.points.length > 0) {
      return { ok: true, data: { symbol: payload.symbol, points: polygon.points } };
    }
  }

  const marketKey = getMarketApiKey();
  if (!marketKey) {
    return {
      ok: false,
      error: "No market API key configured. Add Polygon key (Settings → Options) or Alpha Vantage key for Research."
    };
  }
  const symbolParam = encodeURIComponent(payload.symbol);
  try {
    if (["15", "60", "120", "240"].includes(interval)) {
      return {
        ok: false,
        error: "Polygon API key required for intraday timeframes. Add it in Settings → Options."
      };
    }
    let url = `${ALPHA_BASE}?function=TIME_SERIES_DAILY_ADJUSTED&symbol=${symbolParam}&apikey=${marketKey}`;
    let data = await fetchJson<Record<string, unknown> & { "Error Message"?: string; Note?: string; Information?: string }>(url);
    if (data["Error Message"]) return { ok: false, error: data["Error Message"] };
    if (data.Note) return { ok: false, error: data.Note };
    if (data.Information) return { ok: false, error: String(data.Information) };
    let series = extractSeries(data);
    if (!series && Object.keys(data).length > 0) {
      url = `${ALPHA_BASE}?function=TIME_SERIES_DAILY&symbol=${symbolParam}&apikey=${marketKey}`;
      data = await fetchJson<Record<string, unknown> & { "Error Message"?: string; Note?: string; Information?: string }>(url);
      if (data["Error Message"]) return { ok: false, error: data["Error Message"] };
      if (data.Note) return { ok: false, error: data.Note };
      if (data.Information) return { ok: false, error: String(data.Information) };
      series = extractSeries(data);
    }
    if (series && typeof series === "object") {
      const points = Object.entries(series).map(([date, bar]) => ({
        timestamp: new Date(date).toISOString(),
        open: Number(bar["1. open"]),
        high: Number(bar["2. high"]),
        low: Number(bar["3. low"]),
        close: Number(bar["4. close"]),
        volume: Number(bar["6. volume"] ?? 0)
      }));
      points.sort((a, b) => (a.timestamp < b.timestamp ? -1 : 1));
      return { ok: true, data: { symbol: payload.symbol, points } };
    }
    const keys = Object.keys(data).filter((k) => !["Error Message", "Note", "Information"].includes(k)).join(", ") || "(none)";
    return {
      ok: false,
      error: `No history data. Alpha Vantage returned keys: ${keys}. Use Polygon key (Settings → Options) for Research, or check Alpha Vantage key.`
    };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
});

function getLlmConfig(): { provider: "openai" | "anthropic"; apiKey: string } | null {
  const raw = getProviderConfigJson();
  if (!raw) return null;
  try {
    const cfg = JSON.parse(raw) as { llm?: { provider?: string; apiKey?: string } };
    const key = cfg.llm?.apiKey?.trim();
    const provider = (cfg.llm?.provider === "anthropic" ? "anthropic" : "openai") as "openai" | "anthropic";
    if (key) return { provider, apiKey: key };
  } catch {
    // ignore
  }
  return null;
}

function heuristicSentiment(headline: string, summary?: string): number {
  const text = `${headline} ${summary ?? ""}`.toLowerCase();
  const positive = ["beat", "outperform", "strong", "record", "surge", "rally", "upgrade", "buy"];
  const negative = ["miss", "downgrade", "weak", "plunge", "selloff", "probe", "sell", "cut"];
  let score = 0;
  for (const w of positive) if (text.includes(w)) score += 1;
  for (const w of negative) if (text.includes(w)) score -= 1;
  return Math.max(-1, Math.min(1, score / 3));
}

ipcMain.handle("market:newsForSymbol", async (_event, payload: { symbol: string; limit?: number }) => {
  const symbol = (payload.symbol ?? "").trim().toUpperCase();
  const limit = Math.min(payload.limit ?? 20, 50);

  try {
    const { aggregateNews } = require("./newsAggregator") as typeof import("./newsAggregator");
    const items = await aggregateNews(symbol, limit);

    if (items.length === 0) {
      const newsApiKey = getNewsApiKey();
      if (newsApiKey) {
        const url = new URL("https://newsapi.org/v2/everything");
        url.searchParams.set("q", symbol);
        url.searchParams.set("pageSize", String(limit));
        url.searchParams.set("apiKey", newsApiKey);
        const res = await fetch(url.toString());
        if (res.ok) {
          const data = (await res.json()) as { articles?: { source?: { name?: string }; title?: string; description?: string; url?: string; publishedAt?: string }[] };
          const articles = (data.articles ?? []).map((a, idx) => ({
            id: `${symbol}-${idx}-${a.publishedAt ?? ""}`,
            source: a.source?.name ?? "NewsAPI",
            headline: a.title ?? "",
            url: a.url ?? "",
            publishedAt: a.publishedAt ?? "",
            summary: a.description ?? undefined,
            sentiment: heuristicSentiment(a.title ?? "", a.description) || null
          }));
          return { ok: true, data: articles };
        }
      }
      return { ok: true, data: [] };
    }

    const llm = getLlmConfig();
    if (llm) {
      const { summarizeAndSentiment } = require("./llmService") as typeof import("./llmService");
      const withLlm = await summarizeAndSentiment(items, llm);
      return { ok: true, data: withLlm };
    }

    const stripHtml = (s: string) => s.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').trim();
    const withHeuristic = items.map((a) => ({
      ...a,
      summary: a.content ? stripHtml(a.content).slice(0, 200) : undefined,
      sentiment: heuristicSentiment(a.headline, a.content) || null
    }));
    return { ok: true, data: withHeuristic };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
});

// Massive.com (formerly Polygon) Option Chain Snapshot: real-time pricing and greeks
const OPTIONS_API_BASES = ["https://api.massive.com", "https://api.polygon.io"];

interface PolygonOptionResult {
  details?: { ticker?: string; expiration_date?: string; strike_price?: number; contract_type?: string };
  last_quote?: { bid?: number; ask?: number };
  last_trade?: { price?: number };
  implied_volatility?: number;
  greeks?: { delta?: number; gamma?: number; theta?: number; vega?: number };
  open_interest?: number;
  day?: { volume?: number };
}

/** Alpha Vantage HISTORICAL_OPTIONS returns chain for a date. Parse into our contract format. */
interface AlphaOptionContract {
  contract_symbol?: string;
  option_symbol?: string;
  symbol?: string;
  expiration_date?: string;
  expiration?: string;
  strike_price?: number;
  strike?: number;
  contract_type?: string;
  type?: string;
  delta?: number;
  gamma?: number;
  theta?: number;
  vega?: number;
  rho?: number;
  implied_volatility?: number;
  iv?: number;
  bid?: number;
  ask?: number;
  bid_price?: number;
  ask_price?: number;
  price?: number;
  last?: number;
  open_interest?: number;
  volume?: number;
  [key: string]: unknown;
}

function normalizeAlphaVantageOption(
  c: AlphaOptionContract,
  underlyingSymbol: string,
  fileDate: string
): {
  id: string;
  symbol: string;
  expiry: string;
  strike: number;
  right: "call" | "put";
  bid: number;
  ask: number;
  last?: number;
  impliedVolatility?: number;
  delta?: number;
  gamma?: number;
  theta?: number;
  vega?: number;
  openInterest?: number;
  volume?: number;
} {
  const ticker = c.contract_symbol ?? c.option_symbol ?? c.symbol ?? "";
  const expiry = c.expiration_date ?? c.expiration ?? fileDate;
  const strike = c.strike_price ?? c.strike ?? 0;
  const right = (c.contract_type ?? c.type ?? "call").toLowerCase().includes("put") ? "put" : "call";
  const bid = c.bid ?? c.bid_price ?? 0;
  const ask = c.ask ?? c.ask_price ?? 0;
  const last = c.last ?? c.price;
  let iv = c.implied_volatility ?? c.iv;
  if (iv != null && iv > 1) iv = iv / 100;
  return {
    id: ticker,
    symbol: ticker,
    expiry,
    strike,
    right,
    bid,
    ask,
    last,
    impliedVolatility: iv,
    delta: c.delta,
    gamma: c.gamma,
    theta: c.theta,
    vega: c.vega,
    openInterest: c.open_interest,
    volume: c.volume
  };
}

function collectAlphaOptions(data: unknown): AlphaOptionContract[] {
  const out: AlphaOptionContract[] = [];
  if (!data || typeof data !== "object") return out;
  const d = data as Record<string, unknown>;
  const add = (arr: unknown) => {
    if (Array.isArray(arr)) {
      for (const item of arr) {
        if (item && typeof item === "object") out.push(item as AlphaOptionContract);
      }
    }
  };
  add(d.call ?? d.calls);
  add(d.put ?? d.puts);
  add(d.results);
  const chain = d.option_chain ?? d.options ?? d.data;
  if (chain && typeof chain === "object" && !Array.isArray(chain)) {
    const ch = chain as Record<string, unknown>;
    add(ch.call ?? ch.calls);
    add(ch.put ?? ch.puts);
    add(ch.results);
  }
  if (Array.isArray(data)) {
    for (const r of data) {
      if (r && typeof r === "object") out.push(r as AlphaOptionContract);
    }
  }
  return out;
}

async function fetchAlphaVantageOptionsChain(
  symbol: string,
  date: string,
  apiKey: string,
  expiryFrom: string,
  expiryTo: string
): Promise<{ contracts: ReturnType<typeof normalizeAlphaVantageOption>[]; error?: string }> {
  const url = `${ALPHA_BASE}?function=HISTORICAL_OPTIONS&symbol=${encodeURIComponent(symbol)}&date=${encodeURIComponent(date)}&apikey=${apiKey}`;
  const data = await fetchJson<Record<string, unknown>>(url);
  const errMsg = data["Error Message"] as string | undefined;
  const note = data.Note as string | undefined;
  const info = data.Information as string | undefined;
  if (errMsg) return { contracts: [], error: errMsg };
  if (note) return { contracts: [], error: note };
  if (info) return { contracts: [], error: info };
  const raw = data.data ?? data.option_chain ?? data.options ?? data;
  const list = collectAlphaOptions(raw);
  const fileDate = (data.date as string) ?? date;
  const underlying = { symbol, assetClass: "equity" as const, currency: "USD" };
  const contracts = list
    .map((c) => normalizeAlphaVantageOption(c, symbol, fileDate))
    .filter((c) => c.expiry >= expiryFrom && c.expiry <= expiryTo && c.strike > 0);
  return { contracts };
}

function normalizePolygonOption(
  r: PolygonOptionResult,
  underlyingSymbol: string
): {
  id: string;
  symbol: string;
  expiry: string;
  strike: number;
  right: "call" | "put";
  bid: number;
  ask: number;
  last?: number;
  impliedVolatility?: number;
  delta?: number;
  gamma?: number;
  theta?: number;
  vega?: number;
  openInterest?: number;
  volume?: number;
} {
  const ticker = r.details?.ticker ?? "";
  const expiry = r.details?.expiration_date ?? "";
  const strike = r.details?.strike_price ?? 0;
  const right = (r.details?.contract_type?.toLowerCase() === "put" ? "put" : "call") as "call" | "put";
  const bid = r.last_quote?.bid ?? 0;
  const ask = r.last_quote?.ask ?? 0;
  const last = r.last_trade?.price;
  let iv = r.implied_volatility;
  if (iv != null && iv > 1) iv = iv / 100;
  return {
    id: ticker,
    symbol: ticker,
    expiry,
    strike,
    right,
    bid,
    ask,
    last,
    impliedVolatility: iv,
    delta: r.greeks?.delta,
    gamma: r.greeks?.gamma,
    theta: r.greeks?.theta,
    vega: r.greeks?.vega,
    openInterest: r.open_interest,
    volume: r.day?.volume
  };
}

ipcMain.handle(
  "options:chain",
  async (
    _event,
    payload: { symbol: string; expiryFrom: string; expiryTo: string }
  ) => {
    const polygonKey = getOptionsApiKey();
    const alphaKey = getAlphaVantageOptionsKey();
    if (!polygonKey && !alphaKey) {
      return { ok: false, error: "No options API key. Add Polygon key (Settings) or Alpha Vantage key for options." };
    }
    const s = (payload.symbol ?? "").trim().toUpperCase();
    const { expiryFrom, expiryTo } = payload;
    const underlying = { symbol: s, assetClass: "equity" as const, currency: "USD" };

    if (polygonKey) {
      try {
        const params = new URLSearchParams({
          "expiration_date.gte": expiryFrom,
          "expiration_date.lte": expiryTo,
          limit: "250",
          sort: "expiration_date",
          order: "asc"
        });
        const path = `/v3/snapshot/options/${encodeURIComponent(s)}?${params}&apiKey=${polygonKey}`;
        let data: { results?: PolygonOptionResult[]; next_url?: string; status?: string } | null = null;
        for (const base of OPTIONS_API_BASES) {
          try {
            data = await fetchJson<{ results?: PolygonOptionResult[]; next_url?: string; status?: string }>(`${base}${path}`);
            break;
          } catch (e) {
            const msg = String(e);
            const is403 = msg.includes("403");
            const isLast = base === OPTIONS_API_BASES[OPTIONS_API_BASES.length - 1];
            if (is403 && !isLast) continue;
            throw e;
          }
        }
        const results = data?.results ?? [];
        const contracts = results.map((r) => ({
          ...normalizePolygonOption(r, s),
          underlying
        }));
        if (contracts.length > 0) {
          return { ok: true, data: { underlying, asOf: new Date().toISOString(), contracts } };
        }
      } catch (e) {
        if (!alphaKey) return { ok: false, error: String(e) };
      }
    }

    if (alphaKey) {
      try {
        const date = new Date().toISOString().slice(0, 10);
        const { contracts, error } = await fetchAlphaVantageOptionsChain(s, date, alphaKey, expiryFrom, expiryTo);
        if (error) return { ok: false, error };
        return {
          ok: true,
          data: {
            underlying,
            asOf: new Date().toISOString(),
            contracts: contracts.map((c) => ({ ...c, underlying }))
          }
        };
      } catch (e) {
        return { ok: false, error: String(e) };
      }
    }

    return { ok: false, error: "Failed to load options chain." };
  }
);

ipcMain.handle("realtime:subscribe", (_event, payload: { symbol: string }) => {
  const apiKey = getOptionsApiKey();
  if (!apiKey) return { ok: false, error: "No Polygon/Massive API key (Settings → Polygon.io)" };
  realtimeSubscribe(payload.symbol, apiKey);
  return { ok: true };
});

ipcMain.handle("realtime:unsubscribe", (_event, payload: { symbol: string }) => {
  realtimeUnsubscribe(payload.symbol);
  return { ok: true };
});

// --- Options P/C history (heatmap: real-time + flat-file)

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Parse CSV into PcHistoryRow[]. Supports:
 * - Aggregated: date, symbol, ratio_vol, ratio_oi (header names flexible)
 * - Contract-level: date, symbol, option_type (put/call), volume, open_interest → we aggregate
 */
function parseOptionsFlatFile(content: string): { entries: PcHistoryRow[]; errors: string[] } {
  const errors: string[] = [];
  const lines = content.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return { entries: [], errors: ["File has no data rows"] };

  const headerLine = lines[0];
  const headers = parseCsvLine(headerLine).map((h) => h.toLowerCase().trim());
  const rows = lines.slice(1);

  const dateCol = headers.findIndex((h) => /^(date|datetime|trade_date|as_of)$/.test(h));
  const symbolCol = headers.findIndex((h) => /^(symbol|underlying|ticker|underlying_symbol)$/.test(h));
  const ratioVolCol = headers.findIndex((h) => /^(ratio_vol|put_call_vol|pc_vol|ratio_volume|p\/c_vol)$/.test(h));
  const ratioOiCol = headers.findIndex((h) => /^(ratio_oi|put_call_oi|pc_oi|ratio_oI|p\/c_oi)$/.test(h));
  const typeCol = headers.findIndex((h) => /^(option_type|contract_type|type|right|put_call)$/.test(h));
  const volCol = headers.findIndex((h) => /^(volume|vol)$/.test(h));
  const oiCol = headers.findIndex((h) => /^(open_interest|open_interest|oi)$/.test(h));

  const isAggregated = dateCol >= 0 && symbolCol >= 0 && ratioVolCol >= 0;
  const isContractLevel = dateCol >= 0 && symbolCol >= 0 && typeCol >= 0 && volCol >= 0;

  if (isAggregated) {
    const entries: PcHistoryRow[] = [];
    for (let i = 0; i < rows.length; i++) {
      const parts = parseCsvLine(rows[i]);
      const dateRaw = parts[dateCol]?.trim() ?? "";
      const date = dateRaw.slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        errors.push(`Row ${i + 2}: invalid date "${dateRaw}"`);
        continue;
      }
      const symbol = (parts[symbolCol] ?? "").trim().toUpperCase();
      if (!symbol) {
        errors.push(`Row ${i + 2}: missing symbol`);
        continue;
      }
      const ratioVol = Number(parts[ratioVolCol]?.replace(/,/g, ""));
      if (Number.isNaN(ratioVol) || ratioVol < 0) {
        errors.push(`Row ${i + 2}: invalid ratio_vol`);
        continue;
      }
      const ratioOi = ratioOiCol >= 0 ? Number(parts[ratioOiCol]?.replace(/,/g, "")) : 0;
      entries.push({ symbol, date, ratioVol, ratioOI: Number.isNaN(ratioOi) ? 0 : ratioOi });
    }
    return { entries, errors };
  }

  if (isContractLevel) {
    const byKey = new Map<string, { putVol: number; callVol: number; putOi: number; callOi: number }>();
    for (let i = 0; i < rows.length; i++) {
      const parts = parseCsvLine(rows[i]);
      const dateRaw = parts[dateCol]?.trim() ?? "";
      const date = dateRaw.slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
      const symbol = (parts[symbolCol] ?? "").trim().toUpperCase();
      if (!symbol) continue;
      const type = (parts[typeCol] ?? "").trim().toLowerCase();
      const isPut = type.includes("put");
      const vol = Number(parts[volCol]?.replace(/,/g, "") ?? 0);
      const oi = oiCol >= 0 ? Number(parts[oiCol]?.replace(/,/g, "") ?? 0) : 0;
      const key = `${symbol}|${date}`;
      let agg = byKey.get(key);
      if (!agg) {
        agg = { putVol: 0, callVol: 0, putOi: 0, callOi: 0 };
        byKey.set(key, agg);
      }
      if (isPut) {
        agg.putVol += Number.isNaN(vol) ? 0 : vol;
        agg.putOi += Number.isNaN(oi) ? 0 : oi;
      } else {
        agg.callVol += Number.isNaN(vol) ? 0 : vol;
        agg.callOi += Number.isNaN(oi) ? 0 : oi;
      }
    }
    const entries: PcHistoryRow[] = [];
    for (const [key, agg] of byKey) {
      const [symbol, date] = key.split("|");
      const ratioVol = agg.callVol > 0 ? agg.putVol / agg.callVol : 0;
      const ratioOi = agg.callOi > 0 ? agg.putOi / agg.callOi : 0;
      entries.push({ symbol, date, ratioVol, ratioOI: ratioOi });
    }
    return { entries, errors };
  }

  return { entries: [], errors: ["Unrecognized CSV format. Need either (date, symbol, ratio_vol, ratio_oi) or (date, symbol, option_type, volume, open_interest)."] };
}

ipcMain.handle("options:appendPcHistory", (_event, payload: { symbol: string; ratioVol: number; ratioOI: number }) => {
  try {
    const s = (payload.symbol ?? "").trim().toUpperCase();
    if (!s) return { ok: false, error: "Missing symbol" };
    upsertPcHistory(s, todayStr(), payload.ratioVol, payload.ratioOI ?? 0);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
});

ipcMain.handle("options:getPcHistory", (_event, payload: { symbol: string }) => {
  try {
    const s = (payload.symbol ?? "").trim().toUpperCase();
    const rows = getPcHistoryBySymbol(s);
    return { ok: true, data: rows };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
});

ipcMain.handle("options:importPcHistoryFromJson", (_event, payload: { entries: PcHistoryRow[] }) => {
  try {
    const entries = Array.isArray(payload.entries) ? payload.entries : [];
    const valid = entries.filter(
      (e) =>
        e?.symbol &&
        e?.date &&
        typeof e.ratioVol === "number" &&
        /^\d{4}-\d{2}-\d{2}$/.test(String(e.date).slice(0, 10))
    );
    const normalized = valid.map((e) => ({
      symbol: String(e.symbol).trim().toUpperCase(),
      date: String(e.date).slice(0, 10),
      ratioVol: Number(e.ratioVol),
      ratioOI: typeof e.ratioOI === "number" ? e.ratioOI : 0
    }));
    upsertPcHistoryBatch(normalized);
    return { ok: true, data: { imported: normalized.length } };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
});

ipcMain.handle("options:importFlatFile", (_event, payload: { content: string }) => {
  try {
    const { entries, errors } = parseOptionsFlatFile(payload.content ?? "");
    if (entries.length === 0 && errors.length > 0) return { ok: false, error: errors[0] ?? "Parse failed" };
    upsertPcHistoryBatch(entries);
    return { ok: true, data: { imported: entries.length, errors } };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
});

ipcMain.handle("options:downloadFlatFile", async (_event, payload: { date: string }) => {
  try {
    const date = payload?.date?.trim();
    if (!date) return { ok: false, error: "Date required (YYYY-MM-DD)." };
    const { downloadOptionsDayAggregates } = require("./flatFiles") as typeof import("./flatFiles");
    const result = await downloadOptionsDayAggregates(date);
    if (!result.ok) return { ok: false, error: result.error };
    const entries = result.entries ?? [];
    if (entries.length === 0) return { ok: true, data: { imported: 0, message: "No P/C rows for that date." } };
    upsertPcHistoryBatch(entries);
    return { ok: true, data: { imported: entries.length } };
  } catch (e: unknown) {
    const err = e as Record<string, unknown> & { message?: string };
    const msg = err?.message != null ? String(err.message) : String(e);
    const code = err?.code != null ? String(err.code) : "";
    const name = err?.name != null ? String(err.name) : "";
    const fallback = "Download failed. Check Settings (S3 credentials) and try again.";
    if (name === "UnknownError" || msg === "UnknownError" || !msg || msg === "[object Object]") {
      return { ok: false, error: fallback };
    }
    return { ok: false, error: code ? `${code}: ${msg}` : msg || fallback };
  }
});

ipcMain.handle(
  "options:downloadFlatFileRange",
  async (_event, payload: { dateFrom: string; dateTo: string }) => {
    try {
      const dateFrom = payload?.dateFrom?.trim();
      const dateTo = payload?.dateTo?.trim();
      if (!dateFrom || !dateTo) return { ok: false, error: "Start and end date required (YYYY-MM-DD)." };
      const { downloadOptionsDayAggregatesRange } = require("./flatFiles") as typeof import("./flatFiles");
      const result = await downloadOptionsDayAggregatesRange(dateFrom, dateTo);
      if (!result.ok) return { ok: false, error: result.error };
      const entries = result.entries ?? [];
      if (entries.length > 0) upsertPcHistoryBatch(entries);
      return {
        ok: true,
        data: { imported: entries.length, daysDownloaded: result.daysDownloaded ?? 0 }
      };
    } catch (e: unknown) {
      const err = e as Record<string, unknown> & { message?: string };
      const msg = err?.message != null ? String(err.message) : String(e);
      const code = err?.code != null ? String(err.code) : "";
      const name = err?.name != null ? String(err.name) : "";
      const fallback = "Download failed. Check Settings (S3 credentials) and try again.";
      if (name === "UnknownError" || msg === "UnknownError" || !msg || msg === "[object Object]") {
        return { ok: false, error: fallback };
      }
      return { ok: false, error: code ? `${code}: ${msg}` : msg || fallback };
    }
  }
);

ipcMain.handle("options:selectAndImportFlatFile", async () => {
  try {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: "Import historical P/C data",
      properties: ["openFile", "multiSelections"],
      filters: [
        { name: "CSV / Gzipped CSV", extensions: ["csv", "gz", "csv.gz"] },
        { name: "All Files", extensions: ["*"] as string[] }
      ]
    });
    if (canceled || filePaths.length === 0) return { ok: true, data: { imported: 0, canceled: true } };
    const { parseDayAggregatesCsv } = require("./flatFiles") as typeof import("./flatFiles");
    const allEntries: PcHistoryRow[] = [];
    const allErrors: string[] = [];
    let filesSkipped = 0;
    for (const path of filePaths) {
      const isGz = path.toLowerCase().endsWith(".gz");
      let content: string;
      try {
        content = isGz
          ? gunzipSync(readFileSync(path)).toString("utf-8")
          : readFileSync(path, "utf-8");
      } catch (e) {
        allErrors.push(`${path.split(/[/\\]/).pop()}: ${String(e)}`);
        filesSkipped++;
        continue;
      }
      const dateMatch = /(\d{4}-\d{2}-\d{2})/.exec(path.split(/[/\\]/).pop() ?? "");
      const fileDate = dateMatch?.[1] ?? "";
      const header = content.split(/\r?\n/)[0]?.toLowerCase() ?? "";
      const isPolygonDayOrMinute =
        fileDate && (header.includes("ticker") || header.includes("symbol")) && header.includes("v");
      let entries: PcHistoryRow[];
      if (isPolygonDayOrMinute) {
        entries = parseDayAggregatesCsv(content, fileDate);
      } else {
        const parsed = parseOptionsFlatFile(content);
        entries = parsed.entries;
        if (parsed.errors.length > 0) allErrors.push(...parsed.errors.slice(0, 2));
      }
      if (entries.length === 0) {
        filesSkipped++;
        continue;
      }
      allEntries.push(...entries);
    }
    if (allEntries.length === 0) {
      const hint =
        filesSkipped > 0
          ? `No valid data from ${filePaths.length} file(s). Each file should be options day/minute aggregates with date in filename (e.g. 2024-02-15.csv.gz).`
          : "No valid rows. Expected: (date, symbol, ratio_vol, ratio_oi) or (date, symbol, option_type, volume) or Polygon options CSV with ticker, v.";
      return { ok: false, error: hint };
    }
    upsertPcHistoryBatch(allEntries);
    const fileCount = filePaths.length - filesSkipped;
    return {
      ok: true,
      data: {
        imported: allEntries.length,
        filesImported: fileCount,
        filesSkipped,
        errors: allErrors.length > 0 ? allErrors : undefined
      }
    };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
});

export function registerIpcHandlers(): void {
  // Handlers registered via ipcMain.handle above
}
