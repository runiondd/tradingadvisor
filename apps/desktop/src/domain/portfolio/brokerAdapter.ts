import type { Account, Position, Transaction, MarginProfile } from "./models";

/**
 * Read-only broker integration. Implement for each broker (IB, Schwab, etc.)
 * or use ManualPortfolioSource for CSV/manual entry.
 */
export interface BrokerAdapter {
  readonly name: string;
  fetchAccounts(): Promise<Account[]>;
  fetchPositions(): Promise<Position[]>;
  fetchTransactions(accountId: string, from?: string, to?: string): Promise<Transaction[]>;
  fetchMarginInfo(accountId: string): Promise<MarginProfile | null>;
}
