/**
 * Phase 1 news aggregation: RSS feeds (Yahoo Finance, Google News) + LLM summarization & sentiment.
 * No paid news API required.
 */

import Parser from "rss-parser";

export interface NewsItem {
  id: string;
  source: string;
  headline: string;
  url: string;
  publishedAt: string;
  content?: string;
}

const parser = new Parser({
  timeout: 10000,
  headers: { "User-Agent": "TradingApp/1.0 (Research)" }
});

function rssUrl(symbol: string, source: "yahoo" | "google"): string {
  const s = encodeURIComponent(symbol);
  if (source === "yahoo") {
    return `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${s}&region=US&lang=en-US`;
  }
  return `https://news.google.com/rss/search?q=${s}+stock&hl=en-US&gl=US&ceid=US:en`;
}

export async function aggregateNews(symbol: string, limit: number = 20): Promise<NewsItem[]> {
  const sym = symbol.trim().toUpperCase();
  if (!sym) return [];

  const seen = new Set<string>();
  const items: NewsItem[] = [];

  const add = (source: string, title: string, link: string, pubDate: string, content?: string) => {
    const url = link?.trim() || "";
    const key = url || `${source}:${title}`;
    if (!key || seen.has(key)) return;
    seen.add(key);
    const looksLikeUrl = (s: string) => /^https?:\/\/|^www\./i.test(s?.trim() || "");
    const headline =
      title && !looksLikeUrl(title) && title !== url
        ? title
        : content && !looksLikeUrl(content)
          ? content.slice(0, 80).trim() + (content.length > 80 ? "…" : "")
          : "Untitled";
    items.push({
      id: `${sym}-${items.length}-${pubDate}`,
      source,
      headline,
      url,
      publishedAt: pubDate,
      content
    });
  };

  for (const [source, url] of [
    ["Yahoo Finance", rssUrl(sym, "yahoo")],
    ["Google News", rssUrl(sym, "google")]
  ] as [string, string][]) {
    try {
      const feed = await parser.parseURL(url);
      for (const item of feed.items ?? []) {
        const title = (item.title ?? "").trim();
        const link = (item.link ?? item.guid ?? "").trim();
        const pubDate = item.pubDate ?? item.isoDate ?? new Date().toISOString();
        const raw = (
          item.contentSnippet ??
          item.content ??
          (item as { description?: string }).description ??
          (item as { summary?: string }).summary ??
          ""
        ).trim();
        const content = raw.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').trim();
        add(source, title, link, pubDate, content || undefined);
      }
    } catch {
      // ignore feed failures
    }
  }

  items.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
  return items.slice(0, limit);
}
