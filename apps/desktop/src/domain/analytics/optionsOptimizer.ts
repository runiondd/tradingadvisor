import type { OptionContract, SymbolIdentity } from "../commonTypes";
import type { OptionsChain } from "../data-providers/marketDataModels";
import type { RecommendationAction } from "../recommendations/models";

export interface CandidateTrade {
  type: "underlying" | "option";
  symbol: string;
  description: string;
  estimatedCost: number;
  expectedROI: number;
  downsideProb: number;
  upsideDownsideRatio: number;
  option?: OptionContract;
}

export interface OptimizerOptions {
  underlyingPrice: number;
  maxDelta?: number;
  minDelta?: number;
  minDaysToExpiry?: number;
  maxDaysToExpiry?: number;
  riskTolerance?: number;
}

const DEFAULT_MIN_DELTA = 0.3;
const DEFAULT_MAX_DELTA = 0.7;
const DEFAULT_MIN_DAYS = 30;
const DEFAULT_MAX_DAYS = 90;

/**
 * Filter and rank option contracts by liquidity and delta; then score by
 * simple scenario-based expected ROI and downside probability.
 * For a Buy signal, compare best option(s) to buying the underlying.
 */
export function optimize(
  chain: OptionsChain,
  recommendation: RecommendationAction,
  options: OptimizerOptions
): CandidateTrade[] {
  const {
    underlyingPrice,
    minDelta = DEFAULT_MIN_DELTA,
    maxDelta = DEFAULT_MAX_DELTA,
    minDaysToExpiry = DEFAULT_MIN_DAYS,
    maxDaysToExpiry = DEFAULT_MAX_DAYS
  } = options;

  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;

  const filtered = chain.contracts.filter((c) => {
    const expiryMs = new Date(c.expiry).getTime();
    const daysToExpiry = (expiryMs - now) / day;
    if (daysToExpiry < minDaysToExpiry || daysToExpiry > maxDaysToExpiry) return false;
    const delta = c.delta ?? 0.5;
    if (c.right === "put") {
      const putDelta = Math.abs(delta);
      return putDelta >= minDelta && putDelta <= maxDelta;
    }
    return delta >= minDelta && delta <= maxDelta;
  });

  const byLiquidity = [...filtered].sort((a, b) => {
    const liqA = (a.volume ?? 0) + (a.openInterest ?? 0) * 0.1;
    const liqB = (b.volume ?? 0) + (b.openInterest ?? 0) * 0.1;
    return liqB - liqA;
  });

  const candidates: CandidateTrade[] = [];

  if (recommendation === "buy") {
    const underlyingCost = underlyingPrice;
    const upside = 0.1;
    const downside = -0.05;
    const probUp = 0.4;
    const probDown = 0.3;
    const expectedROI = probUp * upside + probDown * downside + (1 - probUp - probDown) * 0;
    candidates.push({
      type: "underlying",
      symbol: chain.underlying.symbol,
      description: `Buy ${chain.underlying.symbol} shares`,
      estimatedCost: underlyingCost,
      expectedROI,
      downsideProb: probDown,
      upsideDownsideRatio: (probUp * upside) / (Math.abs(probDown * downside) || 0.01)
    });
  }

  for (const contract of byLiquidity.slice(0, 20)) {
    const mid = (contract.bid + contract.ask) / 2;
    const cost = mid * 100;
    const iv = contract.impliedVolatility ?? 0.3;
    const delta = contract.delta ?? 0.5;
    const probUp = 0.35 + delta * 0.2;
    const probDown = 0.35 - delta * 0.2;
    const upside = 0.5;
    const downside = -1;
    const expectedROI = (probUp * upside + probDown * downside) * 0.5;
    const downsideProb = probDown;
    const ratio = (probUp * upside) / (Math.abs(probDown * downside) || 0.01);
    candidates.push({
      type: "option",
      symbol: contract.symbol,
      description: `${contract.right} ${contract.strike} exp ${contract.expiry}`,
      estimatedCost: cost,
      expectedROI,
      downsideProb,
      upsideDownsideRatio: ratio,
      option: contract
    });
  }

  candidates.sort((a, b) => b.expectedROI - a.expectedROI);
  return candidates.slice(0, 10);
}
