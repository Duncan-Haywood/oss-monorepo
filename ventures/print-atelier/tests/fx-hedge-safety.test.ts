import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  calculateFxSlippagePercent,
  assessFxHedgeSafety,
  generateConvexFxHedgeSchema,
  getFxSafetyAuditRecords,
  clearFxSafetyAuditStoreForTesting,
  CurrencyPairRate,
} from "../src/lib/fx-hedge-safety";

describe("fx-hedge-safety inspector", () => {
  beforeEach(() => {
    clearFxSafetyAuditStoreForTesting();
  });

  describe("calculateFxSlippagePercent", () => {
    it("returns 0 for identical rates or zero baseline", () => {
      assert.equal(calculateFxSlippagePercent(0.92, 0.92), 0);
      assert.equal(calculateFxSlippagePercent(0, 0.92), 0);
    });

    it("calculates positive slippage for currency gain", () => {
      // 0.92 to 0.948 => +3.04%
      assert.equal(calculateFxSlippagePercent(0.92, 0.948), 3.04);
    });

    it("calculates negative slippage for currency drop", () => {
      // 0.92 to 0.89 => -3.26%
      assert.equal(calculateFxSlippagePercent(0.92, 0.89), -3.26);
    });
  });

  describe("assessFxHedgeSafety", () => {
    it("returns safe status when exchange rate is stable within buffer", () => {
      const rateInfo: CurrencyPairRate = {
        baseCurrency: "USD",
        quoteCurrency: "EUR",
        baselineRate: 0.92,
        currentRate: 0.925,
      };

      const result = assessFxHedgeSafety(rateInfo, 10000, 3000); // $100 order, $30 artist payout
      assert.equal(result.status, "safe");
      assert.equal(result.isSlippageAlertTriggered, false);
      assert.equal(result.isMarginProtected, true);
      assert.equal(getFxSafetyAuditRecords().length, 1);
    });

    it("triggers warning status when FX slippage exceeds 2.5% threshold", () => {
      const rateInfo: CurrencyPairRate = {
        baseCurrency: "USD",
        quoteCurrency: "GBP",
        baselineRate: 0.79,
        currentRate: 0.76, // ~3.8% drop
      };

      const result = assessFxHedgeSafety(rateInfo, 10000, 3000);
      assert.equal(result.status, "warning");
      assert.equal(result.isSlippageAlertTriggered, true);
      assert.equal(result.recommendedBufferPercent, 3.0);
    });

    it("triggers critical status when FX rate crashes over 5%", () => {
      const rateInfo: CurrencyPairRate = {
        baseCurrency: "USD",
        quoteCurrency: "SEK",
        baselineRate: 10.6,
        currentRate: 9.8, // ~7.5% drop
      };

      const result = assessFxHedgeSafety(rateInfo, 10000, 3000);
      assert.equal(result.status, "critical");
      assert.equal(result.recommendedBufferPercent, 5.0);
    });
  });

  describe("Convex schema definition", () => {
    it("generates valid Convex schema definition for fx_hedge_audits", () => {
      const schema = generateConvexFxHedgeSchema();
      assert.ok(schema.fx_hedge_audits);
      assert.equal(schema.fx_hedge_audits.columns.pair, "string");
      assert.ok(schema.fx_hedge_audits.indexes.by_pair);
    });
  });
});
