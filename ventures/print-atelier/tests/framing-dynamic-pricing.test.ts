import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  calculateCustomFramingPrice,
  summarizeFramingPricingPortfolio,
  clearFramingPriceStoreForTesting,
  FramingDynamicPricingStore,
  FramingPriceQuoteRequest,
} from "../src/lib/framing-dynamic-pricing";

describe("framing-dynamic-pricing", () => {
  beforeEach(() => {
    clearFramingPriceStoreForTesting();
  });

  const standardQuoteReq: FramingPriceQuoteRequest = {
    quoteId: "quote_oak_101",
    artworkId: "art_print_99",
    dimensions: {
      widthInches: 16,
      heightInches: 20,
      matWidthInches: 2, // 20" x 24" framed = 44 united inches
    },
    mouldingGrade: "oak_natural",
    matboardPly: "4_ply_archival",
    glazingType: "uv_acrylic",
    requestedAt: Date.now(),
  };

  const premiumQuoteReq: FramingPriceQuoteRequest = {
    quoteId: "quote_walnut_202",
    artworkId: "art_print_100",
    dimensions: {
      widthInches: 24,
      heightInches: 36,
      matWidthInches: 3, // 30" x 42" framed = 72 united inches
    },
    mouldingGrade: "walnut_solid",
    matboardPly: "8_ply_museum",
    glazingType: "museum_glass",
    requestedAt: Date.now(),
  };

  describe("calculateCustomFramingPrice", () => {
    it("calculates united inches, component costs, margin, and artist royalty", () => {
      const quote = calculateCustomFramingPrice(standardQuoteReq);

      assert.equal(quote.quoteId, "quote_oak_101");
      assert.equal(quote.unitedInches, 44);
      assert.ok(quote.mouldingCostUsd > 0);
      assert.ok(quote.matboardCostUsd > 0);
      assert.ok(quote.glazingCostUsd > 0);
      assert.ok(quote.suggestedRetailPriceUsd > quote.totalWholesaleCostUsd);
      assert.ok(quote.platformMarginPercent >= 50);
      assert.ok(quote.artistFramingRoyaltyUsd > 0);
      assert.ok(quote.formattedDimensionsLabel.includes("20\" x 24\" framed"));
    });

    it("applies large format assembly labor multiplier for united inches > 60", () => {
      const quote = calculateCustomFramingPrice(premiumQuoteReq);

      assert.equal(quote.unitedInches, 72);
      assert.equal(quote.laborAssemblyCostUsd, 35.0);
      assert.ok(quote.suggestedRetailPriceUsd > 200.0);
    });
  });

  describe("summarizeFramingPricingPortfolio", () => {
    it("aggregates framing quotes into average retail price and margin summary", () => {
      const q1 = calculateCustomFramingPrice(standardQuoteReq);
      const q2 = calculateCustomFramingPrice(premiumQuoteReq);

      const summary = summarizeFramingPricingPortfolio([q1, q2]);

      assert.equal(summary.totalQuotes, 2);
      assert.ok(summary.averageRetailPriceUsd > 100);
      assert.ok(summary.totalFramingRevenueUsd > 300);
      assert.equal(summary.mouldingBreakdown.oak_natural, 1);
      assert.equal(summary.mouldingBreakdown.walnut_solid, 1);
    });

    it("handles empty list gracefully", () => {
      const summary = summarizeFramingPricingPortfolio([]);
      assert.equal(summary.totalQuotes, 0);
      assert.equal(summary.averageRetailPriceUsd, 0);
    });
  });

  describe("FramingDynamicPricingStore", () => {
    it("generates valid Convex schema definition for framing_price_quotes", () => {
      const store = new FramingDynamicPricingStore();
      const schema = store.generateConvexSchema();

      assert.ok(schema.includes("export default defineSchema({"));
      assert.ok(schema.includes("framing_price_quotes: defineTable({"));
    });
  });
});
