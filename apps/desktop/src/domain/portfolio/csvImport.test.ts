import { describe, it, expect } from "vitest";
import {
  parsePositionsCsv,
  csvRowsToAccountAndPositions,
  parseTransactionsCsv
} from "./csvImport";

describe("csvImport", () => {
  describe("parsePositionsCsv", () => {
    it("parses rows without header", () => {
      const csv = "AAPL,100,150.25\nGOOGL,50,140.50";
      const rows = parsePositionsCsv(csv);
      expect(rows).toHaveLength(2);
      expect(rows[0]).toEqual({
        symbol: "AAPL",
        quantity: 100,
        averagePrice: 150.25,
        positionType: "long",
        assetClass: "equity"
      });
      expect(rows[1].symbol).toBe("GOOGL");
      expect(rows[1].quantity).toBe(50);
    });

    it("skips header when symbol and quantity present", () => {
      const csv = "symbol,quantity,averagePrice\nAAPL,10,100";
      const rows = parsePositionsCsv(csv);
      expect(rows).toHaveLength(1);
      expect(rows[0].symbol).toBe("AAPL");
      expect(rows[0].quantity).toBe(10);
    });

    it("handles short position type", () => {
      const csv = "TSLA,5,200,short";
      const rows = parsePositionsCsv(csv);
      expect(rows[0].positionType).toBe("short");
    });
  });

  describe("csvRowsToAccountAndPositions", () => {
    it("builds account and equity positions", () => {
      const rows = [
        { symbol: "AAPL", quantity: 100, averagePrice: 150, positionType: "long" as const }
      ];
      const { account, positions } = csvRowsToAccountAndPositions(rows);
      expect(account.id).toBe("csv-import-1");
      expect(account.broker).toBe("CSV");
      expect(positions).toHaveLength(1);
      expect(positions[0].symbol.symbol).toBe("AAPL");
      expect(positions[0].quantity).toBe(100);
    });
  });

  describe("parseTransactionsCsv", () => {
    it("parses transaction rows", () => {
      const csv = "AAPL,2024-01-15T10:00:00Z,10,150.5,buy,0";
      const tx = parseTransactionsCsv(csv);
      expect(tx).toHaveLength(1);
      expect(tx[0].symbol).toBe("AAPL");
      expect(tx[0].side).toBe("buy");
      expect(tx[0].quantity).toBe(10);
      expect(tx[0].price).toBe(150.5);
    });
  });
});
