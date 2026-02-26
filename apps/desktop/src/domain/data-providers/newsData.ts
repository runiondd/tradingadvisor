import type { NewsProvider } from "./marketData";
import type { SymbolIdentity } from "../commonTypes";
import type { NewsWithSentiment } from "./marketDataModels";
import type { SentimentEngine } from "./marketData";
import { getProviderConfig } from "@config/providers";

export class NewsApiNewsProvider implements NewsProvider {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly sentiment: SentimentEngine;

  constructor(sentiment: SentimentEngine) {
    const cfg = getProviderConfig().news;

    if (!cfg || cfg.type !== "newsapi") {
      throw new Error("News provider configuration is missing or invalid");
    }

    this.apiKey = cfg.apiKey;
    this.baseUrl = cfg.baseUrl ?? "https://newsapi.org/v2/everything";
    this.sentiment = sentiment;
  }

  async getNewsForSymbol(
    symbol: SymbolIdentity,
    limit: number
  ): Promise<NewsWithSentiment[]> {
    const url = new URL(this.baseUrl);
    url.searchParams.set("q", symbol.symbol);
    url.searchParams.set("pageSize", String(limit));
    url.searchParams.set("apiKey", this.apiKey);

    const response = await fetch(url.toString());

    if (!response.ok) {
      throw new Error(`News API error: ${response.status}`);
    }

    const data = (await response.json()) as {
      articles: {
        source: { name: string | null };
        title: string;
        description: string | null;
        url: string;
        publishedAt: string;
      }[];
    };

    const articles = data.articles.map((a, idx) => ({
      id: `${symbol.symbol}-${idx}-${a.publishedAt}`,
      source: a.source.name ?? "unknown",
      headline: a.title,
      url: a.url,
      publishedAt: a.publishedAt,
      summary: a.description ?? undefined
    }));

    const scores = await this.sentiment.scoreArticles(
      articles.map((a) => ({
        id: a.id,
        headline: a.headline,
        summary: a.summary
      }))
    );

    const byId = new Map(scores.map((s) => [s.id, s]));

    return articles.map((a) => ({
      ...a,
      sentiment: byId.get(a.id) ?? null
    }));
  }
}

