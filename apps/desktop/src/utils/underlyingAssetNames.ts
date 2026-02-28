const MAX_TICKER_LENGTH = 5;

/** Extract underlying ticker from a contract symbol. Option contracts look like MRVL270617C75 or O:TSLA250117C00150000 — we want MRVL or TSLA. */
export function underlyingTicker(symbol: string): string {
  const raw = (symbol ?? "").trim().toUpperCase();
  if (!raw) return "";
  const s = raw.startsWith("O:") ? raw.slice(2).trim() : raw;
  if (!s) return "";
  if (/\d/.test(s)) {
    const firstDigitIdx = s.search(/\d/);
    if (firstDigitIdx > 0) {
      const run = s.slice(0, firstDigitIdx);
      if (/^[A-Z]+$/.test(run) && run.length >= 1) return run.length > MAX_TICKER_LENGTH ? run.slice(0, MAX_TICKER_LENGTH) : run;
    }
  }
  const leadingLetters = s.match(/^[A-Z]+(?=\d|$)/);
  if (leadingLetters) {
    const t = leadingLetters[0];
    return t.length > MAX_TICKER_LENGTH ? t.slice(0, MAX_TICKER_LENGTH) : t;
  }
  const anyLeading = s.match(/^[A-Z]+/);
  if (anyLeading) {
    const t = anyLeading[0];
    return t.length > MAX_TICKER_LENGTH ? t.slice(0, MAX_TICKER_LENGTH) : t;
  }
  const beforeDigit = s.match(/[A-Z]{2,5}(?=\d)/);
  if (beforeDigit) return beforeDigit[0];
  const firstTickerRun = s.match(/[A-Z]{2,5}/);
  if (firstTickerRun) return firstTickerRun[0];
  return "";
}

/** Look up company/display name from ticker. Returns the name when known, otherwise the ticker. */
export const TICKER_TO_COMPANY_NAME: Record<string, string> = {
  AAPL: "Apple",
  AMZN: "Amazon",
  GOOG: "Alphabet (Google)",
  GOOGL: "Alphabet (Google)",
  META: "Meta",
  MRVL: "Marvell",
  MSFT: "Microsoft",
  NVDA: "NVIDIA",
  QQQ: "Invesco QQQ",
  SPY: "S&P 500",
  TSLA: "Tesla"
};

/** Look up company name from ticker. If given a contract symbol (contains digits or length > 6), extracts ticker first then looks up. */
export function companyNameFromTicker(ticker: string): string {
  let t = (ticker ?? "").trim().toUpperCase();
  if (!t) return "";
  if (t.length > 6 || /\d/.test(t)) t = underlyingTicker(t);
  if (!t) return "";
  return TICKER_TO_COMPANY_NAME[t] ?? t;
}

/** For a symbol (equity ticker or option contract): get underlying ticker, then look up company name. Never returns the raw contract. */
export function underlyingAssetName(symbol: string): string {
  const ticker = underlyingTicker(symbol);
  if (!ticker) return "";
  return companyNameFromTicker(ticker);
}
