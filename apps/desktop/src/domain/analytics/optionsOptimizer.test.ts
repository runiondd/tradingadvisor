import { describe, it, expect } from "vitest";
import { optimize } from "./optionsOptimizer";
import type { SymbolIdentity, OptionContract } from "../commonTypes";
import type { OptionsChain } from "../data-providers/marketDataModels";

const underlying: SymbolIdentity = {
  symbol: "AAPL",
  assetClass: "equity",
  currency: "USD"
};

function makeChain(contracts: OptionContract[]): OptionsChain {
  return { underlying, asOf: new Date().toISOString(), contracts };
}

describe("optionsOptimizer", () => {
  it("includes underlying candidate for buy signal", () => {
    const chain = makeChain([]);
    const result = optimize(chain, "buy", { underlyingPrice: 180 });
    const underlyingCandidate = result.find((c) => c.type === "underlying");
    expect(underlyingCandidate).toBeDefined();
    expect(underlyingCandidate?.symbol).toBe("AAPL");
  });

  it("returns up to 10 candidates sorted by expectedROI", () => {
    const contracts: OptionContract[] = [
      {
        id: "1",
        underlying,
        symbol: "AAPL250119C00180000",
        expiry: "2025-01-19",
        strike: 180,
        right: "call",
        bid: 5,
        ask: 5.5,
        delta: 0.5,
        impliedVolatility: 0.25,
        openInterest: 100,
        volume: 50
      }
    ];
    const chain = makeChain(contracts);
    const result = optimize(chain, "buy", {
      underlyingPrice: 180,
      minDaysToExpiry: 1,
      maxDaysToExpiry: 400
    });
    expect(result.length).toBeLessThanOrEqual(10);
    for (let i = 1; i < result.length; i++) {
      expect(result[i].expectedROI).toBeLessThanOrEqual(result[i - 1].expectedROI);
    }
  });
});
