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
