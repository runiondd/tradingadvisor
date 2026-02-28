export interface AlphaVantageConfig {
  type: "alpha-vantage";
  apiKey: string;
  baseUrl?: string;
}

export interface PolygonConfig {
  type: "polygon";
  apiKey: string;
  baseUrl?: string;
}

export interface FREDConfig {
  type: "fred";
  apiKey: string;
  baseUrl?: string;
}

export interface NewsApiConfig {
  type: "newsapi";
  apiKey: string;
  baseUrl?: string;
}

export type MarketProviderConfig = AlphaVantageConfig;

export interface ProviderConfig {
  market: MarketProviderConfig;
  options?: PolygonConfig;
  macro?: FREDConfig;
  news?: NewsApiConfig;
}

let activeConfig: ProviderConfig | null = null;

export function setProviderConfig(config: ProviderConfig) {
  activeConfig = config;
}

export function getProviderConfig(): ProviderConfig {
  if (!activeConfig) {
    throw new Error("Provider configuration has not been initialized");
  }

  return activeConfig;
}

