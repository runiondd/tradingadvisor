import type { Recommendation, RecommendationAction, RecommendationContext } from "./models";

/**
 * Rule-based decision engine: combines technical, macro, and sentiment
 * into a Buy / Hold / Sell with confidence and rationale.
 */
export function decide(context: RecommendationContext): Recommendation {
  const { symbol, technicals, sentiment, existingExposureUsd } = context;
  let score = 0;
  const reasons: string[] = [];

  // Trend: positive = bullish, negative = bearish
  score += technicals.trendScore * 0.4;
  if (technicals.trendScore > 0.2) reasons.push("uptrend");
  else if (technicals.trendScore < -0.2) reasons.push("downtrend");

  // Momentum (RSI-like): 50 neutral, >60 bullish, <40 bearish
  const momentumNorm = (technicals.momentumScore - 50) / 50;
  score += momentumNorm * 0.3;
  if (technicals.momentumScore > 60) reasons.push("strong momentum");
  else if (technicals.momentumScore < 40) reasons.push("weak momentum");

  // Sentiment
  if (sentiment) {
    score += sentiment.averageScore * 0.2;
    if (sentiment.averageScore > 0.2) reasons.push("positive sentiment");
    else if (sentiment.averageScore < -0.2) reasons.push("negative sentiment");
  }

  // Existing exposure: reduce buy score if already large exposure (simple cap)
  if (existingExposureUsd > 0) {
    const exposurePenalty = Math.min(0.2, existingExposureUsd / 100_000);
    score -= exposurePenalty;
    if (exposurePenalty > 0.05) reasons.push("existing position considered");
  }

  const action: RecommendationAction = score > 0.15 ? "buy" : score < -0.15 ? "sell" : "hold";
  const confidence = Math.min(1, Math.abs(score) * 2.5);
  const rationale =
    reasons.length > 0
      ? `${action.toUpperCase()}: ${reasons.join("; ")}.`
      : `${action.toUpperCase()}: neutral signals.`;

  return {
    id: `rec-${symbol.symbol}-${Date.now()}`,
    symbol,
    action,
    confidence,
    createdAt: new Date().toISOString(),
    rationale
  };
}
