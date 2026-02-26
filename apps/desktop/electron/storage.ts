import { join } from "node:path";

const DB_NAME = "trading-assistant.db";

export interface StorageConfig {
  userDataPath: string;
}

let db: import("better-sqlite3").Database | null = null;

function loadDatabase(path: string): import("better-sqlite3").Database | null {
  try {
    const Database = require("better-sqlite3");
    return new Database(path);
  } catch {
    return null;
  }
}

export function initStorage(config: StorageConfig): import("better-sqlite3").Database | null {
  if (db) return db;
  const path = join(config.userDataPath, DB_NAME);
  db = loadDatabase(path);
  if (db) runMigrations(db);
  return db;
}

export function getDb(): import("better-sqlite3").Database | null {
  return db;
}

export function closeStorage(): void {
  if (db) {
    db.close();
    db = null;
  }
}

function runMigrations(database: import("better-sqlite3").Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS cache (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY,
      broker TEXT NOT NULL,
      name TEXT NOT NULL,
      currency TEXT NOT NULL,
      margin_enabled INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS positions (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL,
      symbol TEXT NOT NULL,
      asset_class TEXT NOT NULL,
      quantity REAL NOT NULL,
      position_type TEXT NOT NULL,
      average_price REAL NOT NULL,
      option_expiry TEXT,
      option_strike REAL,
      option_right TEXT,
      raw_json TEXT,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (account_id) REFERENCES accounts(id)
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL,
      symbol TEXT NOT NULL,
      asset_class TEXT NOT NULL,
      executed_at TEXT NOT NULL,
      quantity REAL NOT NULL,
      price REAL NOT NULL,
      side TEXT NOT NULL,
      fees REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      FOREIGN KEY (account_id) REFERENCES accounts(id)
    );

    CREATE INDEX IF NOT EXISTS idx_positions_account ON positions(account_id);
    CREATE INDEX IF NOT EXISTS idx_transactions_account ON transactions(account_id);

    CREATE TABLE IF NOT EXISTS options_pc_history (
      symbol TEXT NOT NULL,
      date TEXT NOT NULL,
      ratio_vol REAL NOT NULL,
      ratio_oi REAL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (symbol, date)
    );
    CREATE INDEX IF NOT EXISTS idx_options_pc_history_symbol ON options_pc_history(symbol);
  `);
}

export function cacheGet(key: string): string | null {
  const database = getDb();
  if (!database) return null;
  const row = database.prepare("SELECT value FROM cache WHERE key = ?").get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

export function cacheSet(key: string, value: string): void {
  const database = getDb();
  if (!database) return;
  database
    .prepare("INSERT INTO cache (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = ?")
    .run(key, value, new Date().toISOString(), value, new Date().toISOString());
}

export function cacheDelete(key: string): void {
  const database = getDb();
  if (!database) return;
  database.prepare("DELETE FROM cache WHERE key = ?").run(key);
}

const PROVIDER_CONFIG_KEY = "provider_config";

export function getProviderConfigJson(): string | null {
  return cacheGet(PROVIDER_CONFIG_KEY);
}

export function setProviderConfigJson(json: string): void {
  cacheSet(PROVIDER_CONFIG_KEY, json);
}

export interface StoredPosition {
  id: string;
  accountId: string;
  symbol: string;
  quantity: number;
  positionType: string;
  averagePrice: number;
}

export function getPositions(): StoredPosition[] {
  const database = getDb();
  if (!database) return [];
  const rows = database.prepare("SELECT id, account_id, symbol, quantity, position_type, average_price FROM positions").all() as {
    id: string;
    account_id: string;
    symbol: string;
    quantity: number;
    position_type: string;
    average_price: number;
  }[];
  return rows.map((r) => ({
    id: r.id,
    accountId: r.account_id,
    symbol: r.symbol,
    quantity: r.quantity,
    positionType: r.position_type,
    averagePrice: r.average_price
  }));
}

export function saveAccount(id: string, broker: string, name: string, currency: string, marginEnabled: boolean): void {
  const database = getDb();
  if (!database) return;
  database
    .prepare(
      "INSERT OR REPLACE INTO accounts (id, broker, name, currency, margin_enabled, created_at) VALUES (?, ?, ?, ?, ?, ?)"
    )
    .run(id, broker, name, currency, marginEnabled ? 1 : 0, new Date().toISOString());
}

export function clearPositionsForAccount(accountId: string): void {
  const database = getDb();
  if (!database) return;
  database.prepare("DELETE FROM positions WHERE account_id = ?").run(accountId);
}

export function savePosition(
  id: string,
  accountId: string,
  symbol: string,
  assetClass: string,
  quantity: number,
  positionType: string,
  averagePrice: number
): void {
  const database = getDb();
  if (!database) return;
  database
    .prepare(
      "INSERT OR REPLACE INTO positions (id, account_id, symbol, asset_class, quantity, position_type, average_price, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .run(id, accountId, symbol, assetClass, quantity, positionType, averagePrice, new Date().toISOString());
}

// --- Options P/C history (for heatmap: real-time + flat-file import)

export interface PcHistoryRow {
  symbol: string;
  date: string;
  ratioVol: number;
  ratioOI: number;
}

export function upsertPcHistory(symbol: string, date: string, ratioVol: number, ratioOi: number | null): void {
  const database = getDb();
  if (!database) return;
  const now = new Date().toISOString();
  database
    .prepare(
      "INSERT INTO options_pc_history (symbol, date, ratio_vol, ratio_oi, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(symbol, date) DO UPDATE SET ratio_vol = ?, ratio_oi = ?, updated_at = ?"
    )
    .run(symbol, date, ratioVol, ratioOi ?? null, now, ratioVol, ratioOi ?? null, now);
}

export function getPcHistoryBySymbol(symbol: string): PcHistoryRow[] {
  const database = getDb();
  if (!database) return [];
  const rows = database
    .prepare("SELECT symbol, date, ratio_vol, ratio_oi FROM options_pc_history WHERE symbol = ? ORDER BY date DESC")
    .all(symbol) as { symbol: string; date: string; ratio_vol: number; ratio_oi: number | null }[];
  return rows.map((r) => ({
    symbol: r.symbol,
    date: r.date,
    ratioVol: r.ratio_vol,
    ratioOI: r.ratio_oi ?? 0
  }));
}

/** Bulk upsert for flat-file import. */
export function upsertPcHistoryBatch(entries: PcHistoryRow[]): void {
  const database = getDb();
  if (!database) return;
  const now = new Date().toISOString();
  const stmt = database.prepare(
    "INSERT INTO options_pc_history (symbol, date, ratio_vol, ratio_oi, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(symbol, date) DO UPDATE SET ratio_vol = ?, ratio_oi = ?, updated_at = ?"
  );
  for (const e of entries) {
    stmt.run(e.symbol, e.date, e.ratioVol, e.ratioOI ?? null, now, e.ratioVol, e.ratioOI ?? null, now);
  }
}
