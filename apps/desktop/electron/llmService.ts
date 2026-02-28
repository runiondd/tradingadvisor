/**
 * LLM-based summarization and sentiment for news articles.
 * Supports OpenAI (GPT) and Anthropic (Claude).
 */

import type { NewsItem } from "./newsAggregator";

export interface LlmConfig {
  provider: "openai" | "anthropic";
  apiKey: string;
}

export interface NewsWithLlm {
  id: string;
  source: string;
  headline: string;
  url: string;
  publishedAt: string;
  summary?: string;
  sentiment: number | null;
}

const SENTIMENT_PROMPT = `Analyze this financial news headline (and optional snippet) for market sentiment.
Return ONLY a JSON object with two keys:
- "summary": 1-2 sentence summary of the key point (string)
- "sentiment": number from -1 (very bearish) to 1 (very bullish), 0 is neutral

Headline: {{HEADLINE}}
Snippet: {{SNIPPET}}

Respond with valid JSON only, no other text.`;

function buildPrompt(headline: string, snippet?: string): string {
  return SENTIMENT_PROMPT.replace("{{HEADLINE}}", headline).replace(
    "{{SNIPPET}}",
    (snippet ?? "").slice(0, 500) || "(none)"
  );
}

function parseLlmResponse(text: string): { summary?: string; sentiment?: number } {
  try {
    const json = text.replace(/```json?\s*/g, "").trim();
    const parsed = JSON.parse(json) as { summary?: string; sentiment?: number };
    const sentiment =
      typeof parsed.sentiment === "number"
        ? Math.max(-1, Math.min(1, parsed.sentiment))
        : undefined;
    return { summary: parsed.summary, sentiment };
  } catch {
    return {};
  }
}

async function callOpenAi(apiKey: string, prompt: string): Promise<string> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 200,
      temperature: 0.3
    })
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI: ${res.status} ${err}`);
  }
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return data.choices?.[0]?.message?.content ?? "";
}

async function callAnthropic(apiKey: string, prompt: string): Promise<string> {
  const res = await fetch(
    "https://api.anthropic.com/v1/messages",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-3-5-haiku-20241022",
        max_tokens: 200,
        messages: [{ role: "user", content: prompt }]
      })
    }
  );
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Anthropic: ${res.status} ${err}`);
  }
  const data = (await res.json()) as { content?: { text?: string }[] };
  return data.content?.[0]?.text ?? "";
}

export async function summarizeAndSentiment(
  items: NewsItem[],
  config: LlmConfig
): Promise<NewsWithLlm[]> {
  const call = config.provider === "openai" ? callOpenAi : callAnthropic;
  const results: NewsWithLlm[] = [];

  for (const item of items) {
    try {
      const prompt = buildPrompt(item.headline, item.content);
      const response = await call(config.apiKey, prompt);
      const { summary, sentiment } = parseLlmResponse(response);
      results.push({
        id: item.id,
        source: item.source,
        headline: item.headline,
        url: item.url,
        publishedAt: item.publishedAt,
        summary,
        sentiment: sentiment ?? null
      });
    } catch (e) {
      results.push({
        ...item,
        sentiment: null
      });
    }
  }

  return results;
}
