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
 * Assumes daily data; annualizes with sqrt(252).
 */
export function volatility(closes: number[], window: number = 20): (number | null)[] {
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
    out.push(Math.sqrt(variance * 252) * 100);
  }
  return out;
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

/**
 * Build a technical snapshot from the last available values of indicators.
 * Scores are normalized roughly: trend -1 to 1, momentum 0–100 (RSI-like), vol as annualized %.
 */
export function technicalSnapshot(points: TimeSeriesPoint[]): TechnicalSnapshot {
  const closes = points.map((p) => p.close);
  if (closes.length < 30) {
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
  const volSeries = volatility(closes, 20);
  const lastVol = volSeries[volSeries.length - 1];
  const volatilityScore = lastVol != null ? lastVol : 0;
  return {
    trendScore: Math.max(-1, Math.min(1, trendScore * 5)),
    momentumScore,
    volatilityScore
  };
}
