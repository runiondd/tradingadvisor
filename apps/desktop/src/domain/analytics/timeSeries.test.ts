import { describe, it, expect } from "vitest";
import { sma, ema, rsi, technicalSnapshot } from "./timeSeries";
import type { TimeSeriesPoint } from "../commonTypes";

describe("timeSeries", () => {
  describe("sma", () => {
    it("returns null for first period-1 elements then average", () => {
      const points = [1, 2, 3, 4, 5];
      const result = sma(points, 3);
      expect(result[0]).toBeNull();
      expect(result[1]).toBeNull();
      expect(result[2]).toBe(2);
      expect(result[3]).toBe(3);
      expect(result[4]).toBe(4);
    });
  });

  describe("ema", () => {
    it("returns first value for index 0 then smoothed values", () => {
      const points = [10, 11, 12];
      const result = ema(points, 2);
      expect(result[0]).toBe(10);
      expect(result[1]).toBeGreaterThan(10);
      expect(result[2]).toBeGreaterThan(result[1]);
    });
  });

  describe("rsi", () => {
    it("returns null for first period then 0-100", () => {
      const closes = [44, 44.5, 45, 44.2, 44.8, 45.5, 46, 45.2, 45.8, 46.5, 47, 46.5, 47.2, 48, 49];
      const result = rsi(closes, 14);
      expect(result[0]).toBeNull();
      expect(result[result.length - 1]).toBeGreaterThanOrEqual(0);
      expect(result[result.length - 1]).toBeLessThanOrEqual(100);
    });
  });

  describe("technicalSnapshot", () => {
    it("returns zeros when points length < 30", () => {
      const points: TimeSeriesPoint[] = Array(10)
        .fill(0)
        .map((_, i) => ({
          timestamp: new Date(Date.now() - (10 - i) * 86400000).toISOString(),
          open: 100,
          high: 101,
          low: 99,
          close: 100 + i * 0.5,
          volume: 1000
        }));
      const snap = technicalSnapshot(points);
      expect(snap.trendScore).toBe(0);
      expect(snap.momentumScore).toBe(50);
      expect(snap.volatilityScore).toBe(0);
    });

    it("returns bounded trend and momentum for longer series", () => {
      const points: TimeSeriesPoint[] = Array(40)
        .fill(0)
        .map((_, i) => ({
          timestamp: new Date(Date.now() - (40 - i) * 86400000).toISOString(),
          open: 100,
          high: 102,
          low: 98,
          close: 100 + i * 0.3,
          volume: 1000
        }));
      const snap = technicalSnapshot(points);
      expect(snap.trendScore).toBeGreaterThanOrEqual(-1);
      expect(snap.trendScore).toBeLessThanOrEqual(1);
      expect(snap.momentumScore).toBeGreaterThanOrEqual(0);
      expect(snap.momentumScore).toBeLessThanOrEqual(100);
    });
  });
});
