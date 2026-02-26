import type { OptionsChainProvider } from "./marketData";
import type { SymbolIdentity } from "../commonTypes";
import type { OptionsChain } from "./marketDataModels";

/**
 * Stub options chain provider. Returns empty chain until a real provider
 * (e.g. Polygon) is configured.
 */
export class StubOptionsChainProvider implements OptionsChainProvider {
  async getOptionsChain(
    underlying: SymbolIdentity,
    _expiryFrom: string,
    _expiryTo: string
  ): Promise<OptionsChain> {
    return {
      underlying,
      asOf: new Date().toISOString(),
      contracts: []
    };
  }
}
