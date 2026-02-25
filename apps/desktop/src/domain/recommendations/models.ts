import type { SymbolIdentity, TechnicalSnapshot, SentimentAggregate } from "../commonTypes";
import type { MacroSeries } from "../commonTypes";

export type RecommendationAction = "buy" | "hold" | "sell";

export interface RecommendationContext {
  symbol: SymbolIdentity;
  technicals: TechnicalSnapshot;
  macroSignals: MacroSeries[];
  sentiment: SentimentAggregate | null;
  existingExposureUsd: number;
}

export interface Recommendation {
  id: string;
  symbol: SymbolIdentity;
  action: RecommendationAction;
  confidence: number;
  createdAt: string;
  rationale: string;
}

