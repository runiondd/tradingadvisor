import type { AssetClass } from "../commonTypes";
import type { Account, EquityPosition, PositionType, Transaction } from "./models";

const DEFAULT_ACCOUNT_ID = "csv-import-1";
const DEFAULT_BROKER = "CSV";

export interface CsvRow {
  symbol: string;
  quantity: number;
  averagePrice: number;
  positionType?: "long" | "short";
  assetClass?: AssetClass;
}

/**
 * Parse a CSV string with columns: symbol, quantity, averagePrice[, positionType][, assetClass].
 * Header row optional; if missing, first row is data.
 */
export function parsePositionsCsv(csv: string): CsvRow[] {
  const lines = csv.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length === 0) return [];

  const header = lines[0].toLowerCase();
  const hasHeader = header.includes("symbol") && (header.includes("quantity") || header.includes("qty"));
  const start = hasHeader ? 1 : 0;
  const rows: CsvRow[] = [];

  for (let i = start; i < lines.length; i++) {
    const parts = parseCsvLine(lines[i]);
    if (parts.length < 3) continue;
    const symbol = parts[0].trim();
    const quantity = Number(parts[1].replace(/,/g, ""));
    const averagePrice = Number(parts[2].replace(/,/g, ""));
    if (!symbol || Number.isNaN(quantity) || Number.isNaN(averagePrice)) continue;
    const positionType = (parts[3]?.toLowerCase().trim() === "short" ? "short" : "long") as PositionType;
    const assetClass = (parts[4]?.toLowerCase().trim() as AssetClass) || "equity";
    rows.push({ symbol, quantity, averagePrice, positionType, assetClass });
  }

  return rows;
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      inQuotes = !inQuotes;
    } else if ((c === "," && !inQuotes) || c === "\t") {
      result.push(current.trim());
      current = "";
    } else {
      current += c;
    }
  }
  result.push(current.trim());
  return result;
}

/**
 * Build an account and equity positions from parsed CSV rows.
 */
export function csvRowsToAccountAndPositions(
  rows: CsvRow[],
  accountId: string = DEFAULT_ACCOUNT_ID,
  broker: string = DEFAULT_BROKER
): { account: Account; positions: EquityPosition[] } {
  const account: Account = {
    id: accountId,
    broker,
    name: "Imported from CSV",
    currency: "USD",
    marginEnabled: false
  };

  const positions: EquityPosition[] = rows
    .filter((r) => r.assetClass === "equity" || !r.assetClass)
    .map((r, idx) => ({
      id: `csv-${accountId}-${idx}-${r.symbol}`,
      accountId,
      symbol: {
        symbol: r.symbol,
        assetClass: "equity" as const,
        currency: "USD"
      },
      quantity: r.quantity,
      type: r.positionType ?? "long",
      averagePrice: r.averagePrice
    }));

  return { account, positions };
}

/**
 * Parse transactions from CSV: symbol, executedAt, quantity, price, side[, fees].
 */
export function parseTransactionsCsv(csv: string): Omit<Transaction, "id" | "accountId">[] {
  const lines = csv.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length === 0) return [];

  const hasHeader = lines[0].toLowerCase().includes("symbol");
  const start = hasHeader ? 1 : 0;
  const out: Omit<Transaction, "id" | "accountId">[] = [];

  for (let i = start; i < lines.length; i++) {
    const parts = parseCsvLine(lines[i]);
    if (parts.length < 5) continue;
    const symbol = parts[0].trim();
    const executedAt = parts[1].trim();
    const quantity = Number(parts[2].replace(/,/g, ""));
    const price = Number(parts[3].replace(/,/g, ""));
    const side = parts[4].toLowerCase().trim() === "sell" ? "sell" : "buy";
    const fees = Number(parts[5]?.replace(/,/g, "") || 0);
    if (!symbol || Number.isNaN(quantity) || Number.isNaN(price)) continue;
    out.push({
      symbol,
      assetClass: "equity",
      executedAt,
      quantity,
      price,
      side,
      fees
    });
  }

  return out;
}
