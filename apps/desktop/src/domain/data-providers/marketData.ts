import type {
  SymbolIdentity,
  TimeSeriesPoint,
  OptionContract,
  MacroSeries,
  SentimentSample
} from "../commonTypes";
import type {
  Quote,
  HistoricalPriceSeries,
  OptionsChain,
  NewsWithSentiment,
  MacroSnapshot
} from "./marketDataModels";

export type PriceRange =
  | "1d"
  | "5d"
  | "1m"
  | "3m"
  | "6m"
  | "1y"
  | "5y"
  | "max";

export type PriceInterval =
  | "1min"
  | "5min"
  | "15min"
  | "30min"
  | "60min"
  | "1d"
  | "1wk"
  | "1mo";

export interface MarketDataProvider {
  getQuote(symbol: SymbolIdentity): Promise<Quote>;
  getHistoricalPrices(
    symbol: SymbolIdentity,
    range: PriceRange,
    interval: PriceInterval
  ): Promise<HistoricalPriceSeries>;
  getIntradayPrices(
    symbol: SymbolIdentity,
    range: PriceRange,
    interval: Exclude<PriceInterval, "1d" | "1wk" | "1mo">
  ): Promise<TimeSeriesPoint[]>;
}

export interface OptionsChainProvider {
  getOptionsChain(
    underlying: SymbolIdentity,
    expiryFrom: string,
    expiryTo: string
  ): Promise<OptionsChain>;
}

export interface MacroDataProvider {
  getMacroSnapshot(seriesIds: string[]): Promise<MacroSnapshot>;
}

export interface NewsProvider {
  getNewsForSymbol(symbol: SymbolIdentity, limit: number): Promise<NewsWithSentiment[]>;
}

export interface SentimentEngine {
  scoreArticles(
    articles: { id: string; headline: string; summary?: string }[]
  ): Promise<SentimentSample[]>;
}

export interface DataProviderBundle {
  marketData: MarketDataProvider;
  options: OptionsChainProvider;
  macro: MacroDataProvider;
  news: NewsProvider;
  sentiment: SentimentEngine;
}

