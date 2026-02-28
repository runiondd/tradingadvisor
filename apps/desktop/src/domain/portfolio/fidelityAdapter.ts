import type { BrokerAdapter } from "./brokerAdapter";
import type { Account, Position, Transaction, MarginProfile } from "./models";

/**
 * Read-only Fidelity broker adapter (stub).
 * Use CSV import for now; replace this implementation when connecting to
 * Fidelity's API (e.g. Fidelity Institutional Wealth Services or approved
 * third-party aggregation) for accounts, positions, and transactions.
 */
export class FidelityBrokerAdapter implements BrokerAdapter {
  readonly name = "Fidelity";

  async fetchAccounts(): Promise<Account[]> {
    // TODO: Integrate Fidelity API when credentials and API access are available.
    return [];
  }

  async fetchPositions(): Promise<Position[]> {
    return [];
  }

  async fetchTransactions(
    _accountId: string,
    _from?: string,
    _to?: string
  ): Promise<Transaction[]> {
    return [];
  }

  async fetchMarginInfo(_accountId: string): Promise<MarginProfile | null> {
    return null;
  }
}
