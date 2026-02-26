import type { MarketDataProvider, PriceInterval, PriceRange } from "./marketData";
import type { SymbolIdentity, TimeSeriesPoint } from "../commonTypes";
import type { Quote, HistoricalPriceSeries } from "./marketDataModels";
import { getProviderConfig } from "@config/providers";

type AlphaFunction = "GLOBAL_QUOTE" | "TIME_SERIES_DAILY_ADJUSTED" | "TIME_SERIES_INTRADAY";

interface AlphaSeriesResponse {
  "Time Series (Daily)"?: Record<string, AlphaBar>;
  [key: string]: unknown;
}

interface AlphaIntradayResponse {
  [key: string]: unknown;
}

interface AlphaBar {
  "1. open": string;
  "2. high": string;
  "3. low": string;
  "4. close": string;
  "6. volume"?: string;
  "5. volume"?: string;
}

export class AlphaVantageMarketDataProvider implements MarketDataProvider {
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor() {
    const cfg = getProviderConfig().market;

    if (cfg.type !== "alpha-vantage") {
      throw new Error("Provider config is not Alpha Vantage");
    }

    this.apiKey = cfg.apiKey;
    this.baseUrl = cfg.baseUrl ?? "https://www.alphavantage.co/query";
  }

  async getQuote(symbol: SymbolIdentity): Promise<Quote> {
    const data = await this.request<{
      "Global Quote": {
        "01. symbol": string;
        "05. price": string;
        "08. previous close": string;
      };
    }>("GLOBAL_QUOTE", { symbol: symbol.symbol });

    const raw = data["Global Quote"];

    return {
      symbol,
      last: Number(raw["05. price"]),
      bid: Number(raw["05. price"]),
      ask: Number(raw["05. price"]),
      currency: symbol.currency ?? "USD",
      asOf: new Date().toISOString()
    };
  }

  async getHistoricalPrices(
    symbol: SymbolIdentity,
    _range: PriceRange,
    _interval: PriceInterval
  ): Promise<HistoricalPriceSeries> {
    const data = await this.request<AlphaSeriesResponse>("TIME_SERIES_DAILY_ADJUSTED", {
      symbol: symbol.symbol
    });

    const seriesKey =
      "Time Series (Daily)" in data ? "Time Series (Daily)" : Object.keys(data)[1];
    const rawSeries = (data as AlphaSeriesResponse)[seriesKey] ?? {};

    const points: TimeSeriesPoint[] = Object.entries(rawSeries).map(
      ([date, bar]): TimeSeriesPoint => {
        const b = bar as AlphaBar;
        const volume = Number(b["6. volume"] ?? b["5. volume"] ?? "0");

        return {
          timestamp: new Date(date).toISOString(),
          open: Number(b["1. open"]),
          high: Number(b["2. high"]),
          low: Number(b["3. low"]),
          close: Number(b["4. close"]),
          volume
        };
      }
    );

    points.sort((a, b) => (a.timestamp < b.timestamp ? -1 : 1));

    return {
      symbol,
      points
    };
  }

  async getIntradayPrices(
    symbol: SymbolIdentity,
    _range: PriceRange,
    interval: Exclude<PriceInterval, "1d" | "1wk" | "1mo">
  ): Promise<TimeSeriesPoint[]> {
    const alphaInterval = this.toAlphaInterval(interval);

    const data = await this.request<AlphaIntradayResponse>("TIME_SERIES_INTRADAY", {
      symbol: symbol.symbol,
      interval: alphaInterval
    });

    const seriesKey = Object.keys(data).find((k) => k.startsWith("Time Series")) ?? "";
    const rawSeries = (data as Record<string, Record<string, AlphaBar>>)[seriesKey] ?? {};

    const points: TimeSeriesPoint[] = Object.entries(rawSeries).map(
      ([timestamp, bar]): TimeSeriesPoint => {
        const b = bar as AlphaBar;
        const volume = Number(b["6. volume"] ?? b["5. volume"] ?? "0");

        return {
          timestamp: new Date(timestamp).toISOString(),
          open: Number(b["1. open"]),
          high: Number(b["2. high"]),
          low: Number(b["3. low"]),
          close: Number(b["4. close"]),
          volume
        };
      }
    );

    points.sort((a, b) => (a.timestamp < b.timestamp ? -1 : 1));

    return points;
  }

  private async request<T>(fn: AlphaFunction, params: Record<string, string>): Promise<T> {
    const url = new URL(this.baseUrl);
    url.searchParams.set("function", fn);
    url.searchParams.set("apikey", this.apiKey);

    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }

    const response = await fetch(url.toString());

    if (!response.ok) {
      throw new Error(`Alpha Vantage error: ${response.status}`);
    }

    const data = (await response.json()) as T;
    return data;
  }

  private toAlphaInterval(interval: Exclude<PriceInterval, "1d" | "1wk" | "1mo">): string {
    switch (interval) {
      case "1min":
        return "1min";
      case "5min":
        return "5min";
      case "15min":
        return "15min";
      case "30min":
        return "30min";
      case "60min":
        return "60min";
      default:
        return "5min";
    }
  }
}

