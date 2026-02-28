import type { TimeSeriesPoint, TechnicalSnapshot } from "../commonTypes";

/**
 * Simple moving average.
 */
export function sma(points: number[], period: number): (number | null)[] {
  const result: (number | null)[] = [];
  for (let i = 0; i < points.length; i++) {
    if (i < period - 1) {
      result.push(null);
      continue;
    }
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += points[j];
    result.push(sum / period);
  }
  return result;
}

/**
 * Exponential moving average.
 */
export function ema(points: number[], period: number): (number | null)[] {
  const result: (number | null)[] = [];
  const k = 2 / (period + 1);
  for (let i = 0; i < points.length; i++) {
    if (i === 0) {
      result.push(points[0]);
      continue;
    }
    const prev = result[i - 1];
    if (prev === null) {
      result.push(points[i]);
      continue;
    }
    result.push(points[i] * k + prev * (1 - k));
  }
  return result;
}

/**
 * RSI (relative strength index) over `period` bars. Returns 0–100 or null.
 */
export function rsi(closes: number[], period: number = 14): (number | null)[] {
  const out: (number | null)[] = [null];
  for (let i = 1; i < closes.length; i++) {
    if (i < period) {
      out.push(null);
      continue;
    }
    let gains = 0;
    let losses = 0;
    for (let j = i - period + 1; j < i; j++) {
      const diff = closes[j + 1] - closes[j];
      if (diff > 0) gains += diff;
      else losses -= diff;
    }
    const avgGain = gains / period;
    const avgLoss = losses / period;
    if (avgLoss === 0) {
      out.push(100);
      continue;
    }
    const rs = avgGain / avgLoss;
    out.push(100 - 100 / (1 + rs));
  }
  return out;
}

/**
 * MACD line (fast EMA - slow EMA). Returns array same length as closes.
 */
export function macdLine(
  closes: number[],
  fast: number = 12,
  slow: number = 26
): (number | null)[] {
  const fastEma = ema(closes, fast);
  const slowEma = ema(closes, slow);
  return closes.map((_, i) => {
    const f = fastEma[i];
    const s = slowEma[i];
    if (f == null || s == null) return null;
    return f - s;
  });
}

/**
 * Annualized volatility (standard deviation of log returns) over a window.
 * periodsPerYear: 252 for daily, 52 for weekly.
 */
export function volatility(closes: number[], window: number = 20, periodsPerYear: number = 252): (number | null)[] {
  const out: (number | null)[] = [];
  for (let i = 0; i < closes.length; i++) {
    if (i < window) {
      out.push(null);
      continue;
    }
    const slice = closes.slice(i - window, i);
    const logReturns: number[] = [];
    for (let j = 1; j < slice.length; j++) {
      if (slice[j - 1] > 0) logReturns.push(Math.log(slice[j] / slice[j - 1]));
    }
    if (logReturns.length < 2) {
      out.push(null);
      continue;
    }
    const mean = logReturns.reduce((a, b) => a + b, 0) / logReturns.length;
    const variance =
      logReturns.reduce((a, r) => a + (r - mean) ** 2, 0) / (logReturns.length - 1);
    out.push(Math.sqrt(variance * periodsPerYear) * 100);
  }
  return out;
}

/**
 * Resample daily OHLCV to weekly (Monday-start weeks). Each week: O=first open, H=max, L=min, C=last close, V=sum.
 */
export function resampleToWeekly(points: TimeSeriesPoint[]): TimeSeriesPoint[] {
  if (points.length === 0) return [];
  const byWeek = new Map<number, TimeSeriesPoint[]>();
  for (const p of points) {
    const d = new Date(p.timestamp);
    const day = d.getUTCDay();
    const mondayOffset = day === 0 ? -6 : 1 - day;
    const weekStart = new Date(d);
    weekStart.setUTCDate(d.getUTCDate() + mondayOffset);
    weekStart.setUTCHours(0, 0, 0, 0);
    const key = weekStart.getTime();
    if (!byWeek.has(key)) byWeek.set(key, []);
    byWeek.get(key)!.push(p);
  }
  const result: TimeSeriesPoint[] = [];
  for (const [, bars] of byWeek.entries()) {
    bars.sort((a, b) => (a.timestamp < b.timestamp ? -1 : 1));
    result.push({
      timestamp: bars[bars.length - 1].timestamp,
      open: bars[0].open,
      high: Math.max(...bars.map((b) => b.high)),
      low: Math.min(...bars.map((b) => b.low)),
      close: bars[bars.length - 1].close,
      volume: bars.reduce((s, b) => s + b.volume, 0)
    });
  }
  result.sort((a, b) => (a.timestamp < b.timestamp ? -1 : 1));
  return result;
}

/**
 * Resample OHLCV to monthly (first of month). Each month: O=first open, H=max, L=min, C=last close, V=sum.
 */
export function resampleToMonthly(points: TimeSeriesPoint[]): TimeSeriesPoint[] {
  if (points.length === 0) return [];
  const byMonth = new Map<string, TimeSeriesPoint[]>();
  for (const p of points) {
    const d = new Date(p.timestamp);
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    if (!byMonth.has(key)) byMonth.set(key, []);
    byMonth.get(key)!.push(p);
  }
  const result: TimeSeriesPoint[] = [];
  for (const [, bars] of byMonth.entries()) {
    bars.sort((a, b) => (a.timestamp < b.timestamp ? -1 : 1));
    result.push({
      timestamp: bars[bars.length - 1].timestamp,
      open: bars[0].open,
      high: Math.max(...bars.map((b) => b.high)),
      low: Math.min(...bars.map((b) => b.low)),
      close: bars[bars.length - 1].close,
      volume: bars.reduce((s, b) => s + b.volume, 0)
    });
  }
  result.sort((a, b) => (a.timestamp < b.timestamp ? -1 : 1));
  return result;
}

/**
 * Drawdown from peak (0 = at peak, negative = % below peak).
 */
export function drawdown(closes: number[]): number[] {
  let peak = closes[0];
  return closes.map((c) => {
    if (c > peak) peak = c;
    return peak > 0 ? ((c - peak) / peak) * 100 : 0;
  });
}

export type ChartInterval = "15" | "60" | "120" | "240" | "D" | "W" | "1M";

/**
 * Build a technical snapshot from the last available values of indicators.
 * Scores are normalized roughly: trend -1 to 1, momentum 0–100 (RSI-like), vol as annualized %.
 * @param interval Chart interval. D/W/1M resample from daily; 15/60/120/240 use raw bars.
 */
export function technicalSnapshot(points: TimeSeriesPoint[], interval: ChartInterval = "D"): TechnicalSnapshot {
  let series = points;
  if (interval === "W") series = resampleToWeekly(points);
  else if (interval === "1M") series = resampleToMonthly(points);
  const closes = series.map((p) => p.close);
  const periodsPerYear: Record<ChartInterval, number> = {
    "15": 252 * 26,
    "60": 252 * 6.5,
    "120": 252 * 3.25,
    "240": 252 * 1.625,
    D: 252,
    W: 52,
    "1M": 12
  };
  const minBars: Record<ChartInterval, number> = {
    "15": 30,
    "60": 30,
    "120": 30,
    "240": 30,
    D: 30,
    W: 14,
    "1M": 12
  };
  if (closes.length < minBars[interval]) {
    return {
      trendScore: 0,
      momentumScore: 50,
      volatilityScore: 0
    };
  }
  const period = 14;
  const sma20 = sma(closes, 20);
  const lastClose = closes[closes.length - 1];
  const lastSma = sma20[sma20.length - 1];
  const trendScore = lastSma != null && lastSma !== 0 ? (lastClose - lastSma) / lastSma : 0;
  const rsiSeries = rsi(closes, period);
  const lastRsi = rsiSeries[rsiSeries.length - 1];
  const momentumScore = lastRsi != null ? lastRsi : 50;
  const volSeries = volatility(closes, 20, periodsPerYear[interval]);
  const lastVol = volSeries[volSeries.length - 1];
  const volatilityScore = lastVol != null ? lastVol : 0;
  return {
    trendScore: Math.max(-1, Math.min(1, trendScore * 5)),
    momentumScore,
    volatilityScore
  };
}
