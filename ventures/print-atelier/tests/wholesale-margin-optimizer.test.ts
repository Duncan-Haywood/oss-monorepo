import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  getApplicableWholesaleTier,
  calculateWholesaleQuote,
  generateConvexWholesaleSchema,
  persistWholesaleQuote,
  getWholesaleQuotes,
  clearWholesaleQuotesForTesting,
  WholesaleQuoteInput,
} from "../src/lib/wholesale-margin-optimizer.ts";

describe("wholesale-margin-optimizer", () => {
  beforeEach(() => {
    clearWholesaleQuotesForTesting();
  });

  describe("getApplicableWholesaleTier", () => {
    it("returns Retail Standard for qty 1-4", () => {
      const tier = getApplicableWholesaleTier(3);
      assert.equal(tier.tierName, "Retail Standard");
      assert.equal(tier.discountPercent, 0);
    });

    it("returns Trade Starter for qty 10", () => {
      const tier = getApplicableWholesaleTier(10);
      assert.equal(tier.tierName, "Trade Starter");
      assert.equal(tier.discountPercent, 10);
    });

    it("returns Enterprise & Resort for qty 100", () => {
      const tier = getApplicableWholesaleTier(100);
      assert.equal(tier.tierName, "Enterprise & Resort");
      assert.equal(tier.discountPercent, 32);
    });
  });

  describe("calculateWholesaleQuote", () => {
    it("calculates standard wholesale quote with full discount when margins permit", () => {
      const input: WholesaleQuoteInput = {
        sku: "ART-PRINT-001",
        quantity: 20, // Tier: Design Studio (18% discount)
        unitBasePriceUsdCents: 10000, // $100 base retail
        unitPodCostUsdCents: 2500, // $25 POD cost
      };

      const quote = calculateWholesaleQuote(input);
      assert.equal(quote.applicableTierName, "Design Studio");
      assert.equal(quote.appliedDiscountPercent, 18);
      assert.equal(quote.unitWholesalePriceUsdCents, 8200); // $82.00
      assert.equal(quote.totalWholesalePriceUsdCents, 164000); // $1,640.00
      assert.equal(quote.unitArtistPayoutUsdCents, 3000); // $30.00 (30% of $100 retail)
      assert.equal(quote.artistProfitProtected, true);
      assert.equal(quote.minMarginCleared, true);
      assert.equal(quote.suggestedPaymentTerms, "Net-30");
      assert.equal(quote.warnings.length, 0);
    });

    it("adjusts discount down to protect platform minimum margin and artist floor when POD cost is high", () => {
      const input: WholesaleQuoteInput = {
        sku: "CANVAS-LARGE-999",
        quantity: 50, // Tier: Enterprise (32% standard discount)
        unitBasePriceUsdCents: 10000, // $100 retail
        unitPodCostUsdCents: 4500, // $45 POD cost
      };

      const quote = calculateWholesaleQuote(input);
      assert.ok(quote.appliedDiscountPercent < 32); // Discount adjusted down from 32%
      assert.equal(quote.artistProfitProtected, true); // Artist still gets $30
      assert.ok(quote.warnings.length > 0);
      assert.ok(quote.warnings[0].includes("adjusted"));
    });

    it("recommends Net-60 payment terms for large enterprise volume orders", () => {
      const input: WholesaleQuoteInput = {
        sku: "HOTEL-SERIES-A",
        quantity: 60,
        unitBasePriceUsdCents: 20000, // $200 unit
        unitPodCostUsdCents: 5000,
      };

      const quote = calculateWholesaleQuote(input);
      assert.equal(quote.suggestedPaymentTerms, "Net-60");
      assert.ok(quote.totalWholesalePriceUsdCents >= 500000);
    });
  });

  describe("Convex schema and persistence", () => {
    it("generates valid Convex schema definition for wholesale_quotes", () => {
      const schema = generateConvexWholesaleSchema();
      assert.ok(schema.wholesale_quotes);
      assert.equal(schema.wholesale_quotes.columns.quantity, "number");
      assert.ok(schema.wholesale_quotes.indexes.by_quote_id);
    });

    it("persists wholesale quote and retrieves from memory store", () => {
      const quote = calculateWholesaleQuote({
        sku: "TEST-SKU",
        quantity: 10,
        unitBasePriceUsdCents: 5000,
        unitPodCostUsdCents: 1200,
      });

      persistWholesaleQuote(quote);
      const stored = getWholesaleQuotes();
      assert.equal(stored.length, 1);
      assert.equal(stored[0].sku, "TEST-SKU");
    });
  });
});
