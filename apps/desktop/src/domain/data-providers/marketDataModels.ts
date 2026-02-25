import type { SymbolIdentity, TimeSeriesPoint, OptionContract, MacroSeries, SentimentSample } from "../commonTypes";

export interface Quote {
  symbol: SymbolIdentity;
  last: number;
  bid: number;
  ask: number;
  currency: string;
  asOf: string;
}

export interface HistoricalPriceSeries {
  symbol: SymbolIdentity;
  points: TimeSeriesPoint[];
}

export interface OptionsChain {
  underlying: SymbolIdentity;
  asOf: string;
  contracts: OptionContract[];
}

export interface NewsArticle {
  id: string;
  source: string;
  headline: string;
  url: string;
  publishedAt: string;
  summary?: string;
}

export interface NewsWithSentiment extends NewsArticle {
  sentiment: SentimentSample | null;
}

export interface MacroSnapshot {
  series: MacroSeries[];
  asOf: string;
}

