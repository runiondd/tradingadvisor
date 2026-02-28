import { describe, it, expect } from "vitest";
import { decide } from "./decisionEngine";
import type { RecommendationContext } from "./models";

describe("decisionEngine", () => {
  const baseSymbol = {
    symbol: "AAPL",
    assetClass: "equity" as const,
    currency: "USD"
  };

  it("returns buy when trend and momentum are positive", () => {
    const ctx: RecommendationContext = {
      symbol: baseSymbol,
      technicals: { trendScore: 0.5, momentumScore: 65, volatilityScore: 20 },
      macroSignals: [],
      sentiment: null,
      existingExposureUsd: 0
    };
    const rec = decide(ctx);
    expect(rec.action).toBe("buy");
    expect(rec.confidence).toBeGreaterThan(0);
    expect(rec.rationale.length).toBeGreaterThan(0);
  });

  it("returns sell when trend and momentum are negative", () => {
    const ctx: RecommendationContext = {
      symbol: baseSymbol,
      technicals: { trendScore: -0.5, momentumScore: 35, volatilityScore: 25 },
      macroSignals: [],
      sentiment: { symbol: "AAPL", windowDays: 7, averageScore: -0.3, sampleCount: 10 },
      existingExposureUsd: 0
    };
    const rec = decide(ctx);
    expect(rec.action).toBe("sell");
  });

  it("returns hold when signals are neutral", () => {
    const ctx: RecommendationContext = {
      symbol: baseSymbol,
      technicals: { trendScore: 0, momentumScore: 50, volatilityScore: 15 },
      macroSignals: [],
      sentiment: null,
      existingExposureUsd: 0
    };
    const rec = decide(ctx);
    expect(rec.action).toBe("hold");
  });
});
