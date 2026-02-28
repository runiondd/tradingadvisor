/**
 * Download options flat files from Massive S3 (files.massive.com).
 * Uses MinIO JavaScript client (officially supported by Massive).
 * See https://massive.com/docs/flat-files/quickstart#setting-up-s3-access
 */

import * as Minio from "minio";
import { gunzipSync } from "node:zlib";
import { getProviderConfigJson } from "./storage";
import type { PcHistoryRow } from "./storage";

const ENDPOINT = "files.massive.com";
const BUCKET = "flatfiles";
// Massive docs: S3 /options/day-aggregates. Also try legacy Polygon path.
const PREFIXES = ["options/day-aggregates", "us_options_opra/day_aggs_v1"];

export interface FlatFilesConfig {
  accessKeyId: string;
  secretAccessKey: string;
}

export function getFlatFilesConfig(): FlatFilesConfig | null {
  const raw = getProviderConfigJson();
  if (!raw) return null;
  try {
    const cfg = JSON.parse(raw) as { flatFiles?: { accessKeyId?: string; secretAccessKey?: string } };
    const id = cfg.flatFiles?.accessKeyId?.trim();
    const secret = cfg.flatFiles?.secretAccessKey?.trim();
    if (id && secret) return { accessKeyId: id, secretAccessKey: secret };
  } catch {
    // ignore
  }
  return null;
}

/** Parse Polygon option ticker (e.g. O:AAPL240119C00150000 or AAPL240119C00150000) to underlying and put/call. */
function parseOptionTicker(ticker: string): { underlying: string; isPut: boolean } | null {
  const t = (ticker ?? "").trim();
  // O:UNDERLYINGYYMMDDC/P + strike... or UNDERLYINGYYMMDDC/P...
  const m = t.match(/^O:([A-Z]+)\d{6}([CP])/i) ?? t.match(/^([A-Z]+)\d{6}([CP])/i);
  if (!m) return null;
  return { underlying: m[1].toUpperCase(), isPut: m[2].toUpperCase() === "P" };
}

/** Parse Polygon/Massive options day-aggregates CSV: ticker, o, h, l, c, v, vw, n, t. */
export function parseDayAggregatesCsv(csv: string, fileDate: string): PcHistoryRow[] {
  const lines = csv.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];

  const headerLine = lines[0];
  const headers = headerLine.split(",").map((h) => h.trim().toLowerCase());
  const tickerCol = headers.findIndex((h) => h === "ticker" || h === "symbol");
  const volCol = headers.findIndex((h) => h === "v" || h === "volume");
  if (tickerCol < 0 || volCol < 0) return [];

  const byKey = new Map<string, { putVol: number; callVol: number }>();

  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(",").map((p) => p.trim());
    const ticker = parts[tickerCol];
    const vol = Number(parts[volCol] ?? 0);
    if (!ticker || Number.isNaN(vol) || vol <= 0) continue;

    const parsed = parseOptionTicker(ticker);
    if (!parsed) continue;

    const key = parsed.underlying;
    let agg = byKey.get(key);
    if (!agg) {
      agg = { putVol: 0, callVol: 0 };
      byKey.set(key, agg);
    }
    if (parsed.isPut) agg.putVol += vol;
    else agg.callVol += vol;
  }

  const entries: PcHistoryRow[] = [];
  for (const [symbol, agg] of byKey) {
    if (agg.callVol === 0) continue; // skip symbol-days with no call volume
    const ratioVol = agg.putVol / agg.callVol;
    entries.push({ symbol, date: fileDate, ratioVol, ratioOI: 0 });
  }
  return entries;
}

/** Download options day-aggregates for a single date and return P/C rows. */
export async function downloadOptionsDayAggregates(date: string): Promise<{
  ok: boolean;
  entries?: PcHistoryRow[];
  error?: string;
}> {
  const config = getFlatFilesConfig();
  if (!config) return { ok: false, error: "Flat files S3 not configured. Add Access Key and Secret in Settings." };

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date.trim());
  if (!match) return { ok: false, error: "Date must be YYYY-MM-DD." };

  const dateStr = date.trim();

  const client = new Minio.Client({
    endPoint: ENDPOINT,
    port: 443,
    useSSL: true,
    accessKey: config.accessKeyId,
    secretKey: config.secretAccessKey
  });

  let lastError: string | null = null;
  for (const prefix of PREFIXES) {
    const key = `${prefix}/${match[1]}/${match[2]}/${dateStr}.csv.gz`;
    try {
      const stream = await client.getObject(BUCKET, key);
      const chunks: Buffer[] = [];
      for await (const chunk of stream) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      const gzip = Buffer.concat(chunks);
      const csv = gunzipSync(gzip).toString("utf-8");
      const entries = parseDayAggregatesCsv(csv, dateStr);
      return { ok: true, entries };
    } catch (e: unknown) {
      const err = e as { code?: string; message?: string };
      if (err?.code === "NoSuchKey" || err?.message?.includes("404")) {
        lastError = null;
        continue;
      }
      lastError = err?.message ?? String(e);
      break;
    }
  }

  if (lastError !== null) {
    const msg = lastError.startsWith("HTTP") ? `S3: ${lastError}` : lastError;
    if (lastError === "HTTP 403" || lastError.toLowerCase().includes("forbidden")) {
      const fromPolygon = lastError !== "HTTP 403" ? ` Polygon/S3 returned: “${lastError}”.` : "";
      return {
        ok: false,
        error:
          "S3 Forbidden: Options flat files may not be included in your plan, or this path may require a different subscription. " +
          "Check the Polygon dashboard (Flat Files / S3) to confirm options access." +
          fromPolygon +
          " You can still use “Import historical P/C” with a CSV file if you have P/C data from another source."
      };
    }
    return { ok: false, error: msg };
  }

  return {
    ok: false,
    error: `No file for ${dateStr}. Tried both path formats. Check the date (past trading day) and that your plan includes options flat files.`
  };
}

const MAX_RANGE_DAYS = 90;

/** Download options day-aggregates for a date range; returns merged P/C rows for all days. */
export async function downloadOptionsDayAggregatesRange(
  dateFrom: string,
  dateTo: string
): Promise<{ ok: boolean; entries?: PcHistoryRow[]; error?: string; daysDownloaded?: number }> {
  const config = getFlatFilesConfig();
  if (!config) return { ok: false, error: "Flat files S3 not configured. Add Access Key and Secret in Settings." };

  const fromMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateFrom.trim());
  const toMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateTo.trim());
  if (!fromMatch || !toMatch) return { ok: false, error: "Dates must be YYYY-MM-DD." };

  const from = new Date(dateFrom.trim());
  const to = new Date(dateTo.trim());
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return { ok: false, error: "Invalid date." };
  if (from > to) return { ok: false, error: "Start date must be on or before end date." };

  const days = Math.ceil((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000)) + 1;
  if (days > MAX_RANGE_DAYS) return { ok: false, error: `Range is ${days} days; max ${MAX_RANGE_DAYS} days.` };

  const allEntries: PcHistoryRow[] = [];
  let daysDownloaded = 0;
  const current = new Date(from);
  while (current <= to) {
    const dateStr = current.toISOString().slice(0, 10);
    const result = await downloadOptionsDayAggregates(dateStr);
    if (!result.ok) {
      return { ok: false, error: result.error, daysDownloaded };
    }
    if (result.entries && result.entries.length > 0) {
      allEntries.push(...result.entries);
      daysDownloaded++;
    }
    current.setDate(current.getDate() + 1);
  }
  return { ok: true, entries: allEntries, daysDownloaded };
}

