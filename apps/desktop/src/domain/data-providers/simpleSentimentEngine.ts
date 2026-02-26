import type { SentimentEngine } from "./marketData";
import type { SentimentSample } from "../commonTypes";

export class SimpleSentimentEngine implements SentimentEngine {
  async scoreArticles(
    articles: { id: string; headline: string; summary?: string }[]
  ): Promise<SentimentSample[]> {
    return articles.map((a) => ({
      id: a.id,
      source: "heuristic",
      headline: a.headline,
      url: undefined,
      publishedAt: new Date().toISOString(),
      score: this.scoreText(`${a.headline} ${a.summary ?? ""}`)
    }));
  }

  private scoreText(text: string): number {
    const lowered = text.toLowerCase();

    const positiveWords = ["beat", "outperform", "strong", "record", "surge", "rally"];
    const negativeWords = ["miss", "downgrade", "weak", "plunge", "selloff", "probe"];

    let score = 0;

    for (const word of positiveWords) {
      if (lowered.includes(word)) {
        score += 1;
      }
    }

    for (const word of negativeWords) {
      if (lowered.includes(word)) {
        score -= 1;
      }
    }

    return Math.max(-1, Math.min(1, score / 3));
  }
}

