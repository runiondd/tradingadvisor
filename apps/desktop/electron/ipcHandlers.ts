import { ipcMain, dialog } from "electron";
import { readFileSync } from "node:fs";
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

async function fetchPolygonDailyHistory(symbol: string, apiKey: string): Promise<{ points: { timestamp: string; open: number; high: number; low: number; close: number; volume: number }[] } | null> {
  const to = new Date();
  const from = new Date();
  from.setFullYear(from.getFullYear() - 1);
  const fromStr = from.toISOString().slice(0, 10);
  const toStr = to.toISOString().slice(0, 10);
  const url = `https://api.polygon.io/v2/aggs/ticker/${encodeURIComponent(symbol)}/range/1/day/${fromStr}/${toStr}?apiKey=${apiKey}`;
  try {
    const data = await fetchJson<{ results?: { o?: number; h?: number; l?: number; c?: number; v?: number; t?: number }[] }>(url);
    const results = data.results ?? [];
    if (results.length === 0) return null;
    const points = results.map((bar) => ({
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

ipcMain.handle("market:history", async (_event, payload: { symbol: string }) => {
  const polygonKey = getOptionsApiKey();
  const symbol = payload.symbol.trim().toUpperCase();

  if (polygonKey) {
    const polygon = await fetchPolygonDailyHistory(symbol, polygonKey);
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
    const apiKey = getOptionsApiKey();
    if (!apiKey) return { ok: false, error: "No options API key configured (add Polygon key in Settings)" };
    const { symbol, expiryFrom, expiryTo } = payload;
    try {
      const params = new URLSearchParams({
        "expiration_date.gte": expiryFrom,
        "expiration_date.lte": expiryTo,
        limit: "250",
        sort: "expiration_date",
        order: "asc"
      });
      const path = `/v3/snapshot/options/${encodeURIComponent(symbol)}?${params}&apiKey=${apiKey}`;
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
      const underlying = { symbol, assetClass: "equity" as const, currency: "USD" };
      const contracts = results.map((r) => ({
        ...normalizePolygonOption(r, symbol),
        underlying
      }));
      return {
        ok: true,
        data: {
          underlying,
          asOf: new Date().toISOString(),
          contracts
        }
      };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
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
      properties: ["openFile"],
      filters: [
        { name: "CSV", extensions: ["csv"] },
        { name: "All Files", extensions: ["*"] as string[] }
      ]
    });
    if (canceled || filePaths.length === 0) return { ok: true, data: { imported: 0, canceled: true } };
    const content = readFileSync(filePaths[0], "utf-8");
    const { entries, errors } = parseOptionsFlatFile(content);
    if (entries.length === 0 && errors.length > 0) return { ok: false, error: errors[0] ?? "No valid rows" };
    upsertPcHistoryBatch(entries);
    return { ok: true, data: { imported: entries.length, errors } };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
});

export function registerIpcHandlers(): void {
  // Handlers registered via ipcMain.handle above
}
