export type AssetClass = "equity" | "etf" | "index" | "future" | "forex" | "crypto";

export interface SymbolIdentity {
  symbol: string;
  exchange?: string;
  assetClass: AssetClass;
  currency?: string;
  description?: string;
}

export interface TimeSeriesPoint {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface TechnicalSnapshot {
  trendScore: number;
  momentumScore: number;
  volatilityScore: number;
}

export type OptionRight = "call" | "put";

export interface OptionContract {
  id: string;
  underlying: SymbolIdentity;
  symbol: string;
  expiry: string;
  strike: number;
  right: OptionRight;
  bid: number;
  ask: number;
  last?: number;
  impliedVolatility?: number;
  delta?: number;
  gamma?: number;
  theta?: number;
  vega?: number;
  openInterest?: number;
  volume?: number;
}

export interface MacroSeriesPoint {
  date: string;
  value: number;
}

export interface MacroSeries {
  id: string;
  name: string;
  description?: string;
  frequency: "daily" | "weekly" | "monthly" | "quarterly" | "annual";
  points: MacroSeriesPoint[];
}

export interface SentimentSample {
  id: string;
  source: string;
  headline: string;
  url?: string;
  publishedAt: string;
  score: number;
}

export interface SentimentAggregate {
  symbol: string;
  windowDays: number;
  averageScore: number;
  sampleCount: number;
}

