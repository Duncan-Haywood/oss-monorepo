import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  convertCurrency,
  applyLocalRounding,
  formatLocalPrice,
  calculateGlobalPriceQuote,
  calculateLocalizedPricing,
  generateConvexGlobalPricingSchema,
  persistPricingQuote,
  getPricingQuotes,
  clearPricingQuotesForTesting,
} from "../src/lib/global-pricing.ts";

describe("global-pricing", () => {
  beforeEach(() => {
    clearPricingQuotesForTesting();
  });

  describe("convertCurrency", () => {
    it("returns exact amount when target currency is USD", () => {
      const res = convertCurrency(5000, "USD");
      assert.equal(res.rawConvertedCents, 5000);
      assert.equal(res.totalConvertedCents, 5000);
    });

    it("converts USD cents to EUR using default exchange rates", () => {
      // 10000 USD cents * 0.92 = 9200 EUR cents
      const res = convertCurrency(10000, "EUR");
      assert.equal(res.rawConvertedCents, 9200);
    });

    it("converts USD cents to GBP using default exchange rates", () => {
      // 10000 USD cents * 0.79 = 7900 GBP pence
      const res = convertCurrency(10000, "GBP");
      assert.equal(res.rawConvertedCents, 7900);
    });

    it("converts USD cents to JPY using default exchange rates", () => {
      // 10000 USD cents ($100) * 155 = 1550000 JPY
      const res = convertCurrency(10000, "JPY");
      assert.equal(res.rawConvertedCents, 1550000);
    });
  });

  describe("applyLocalRounding", () => {
    it("applies .99 charm pricing for USD, CAD, AUD", () => {
      assert.equal(applyLocalRounding(4500, "USD", ".99"), 4599);
      assert.equal(applyLocalRounding(6000, "CAD", ".99"), 6099);
    });

    it("rounds JPY to 100s integer", () => {
      assert.equal(applyLocalRounding(15490, "JPY", "integer"), 15500);
    });
  });

  describe("formatLocalPrice", () => {
    it("formats USD, EUR, and GBP prices correctly", () => {
      assert.equal(formatLocalPrice(4999, "USD"), "$49.99");
      assert.equal(formatLocalPrice(4595, "EUR"), "€45.95");
      assert.equal(formatLocalPrice(3999, "GBP"), "£39.99");
    });

    it("formats JPY prices without decimal places", () => {
      assert.equal(formatLocalPrice(4990, "JPY"), "¥4,990");
    });

    it("formats Scandinavian currencies with trailing suffix", () => {
      assert.equal(formatLocalPrice(49900, "SEK"), "499.00 kr");
    });
  });

  describe("calculateGlobalPriceQuote", () => {
    it("calculates localized pricing quote for US order with state tax", () => {
      const quote = calculateGlobalPriceQuote({
        basePriceUsdCents: 6000, // $60.00
        podCostUsdCents: 2000, // $20.00 POD cost
        destinationCountry: "US",
      });

      assert.equal(quote.currency, "USD");
      assert.equal(quote.isTaxIncluded, false);
      assert.ok(quote.totalDisplayPriceLocalCents > 0);
      assert.equal(quote.formattedDisplayPrice, "$64.99");
      assert.equal(quote.guaranteeMet, true);
    });

    it("calculates localized pricing for UK order with 20% VAT included", () => {
      const quote = calculateGlobalPriceQuote({
        basePriceUsdCents: 6000,
        podCostUsdCents: 2000,
        destinationCountry: "GB",
      });

      assert.equal(quote.currency, "GBP");
      assert.equal(quote.isTaxIncluded, true);
      assert.equal(quote.taxRatePercent, 20.0);
      assert.ok(quote.estimatedTaxLocalCents > 0);
      assert.ok(quote.formattedDisplayPrice.startsWith("£"));
    });
  });

  describe("calculateLocalizedPricing", () => {
    it("calculates breakdown structure for international destination", () => {
      const breakdown = calculateLocalizedPricing({
        baseUsdPriceCents: 6000,
        podCostUsdCents: 2000,
        destinationCountry: "DE",
      });

      assert.equal(breakdown.currency, "EUR");
      assert.equal(breakdown.taxIncludedInPrice, true);
      assert.equal(breakdown.artistSplitPercent, 30);
    });
  });

  describe("audit store & Convex schema", () => {
    it("generates Convex schema for global_pricing_quotes", () => {
      const schema = generateConvexGlobalPricingSchema();
      assert.ok(schema.global_pricing_quotes);
      assert.equal(schema.global_pricing_quotes.columns.destinationCountry, "string");
      assert.deepEqual(schema.global_pricing_quotes.indexes.by_country, ["destinationCountry"]);
    });

    it("persists pricing quote and retrieves from memory store", () => {
      const quote = calculateGlobalPriceQuote({
        basePriceUsdCents: 5000,
        podCostUsdCents: 1500,
        destinationCountry: "FR",
      });

      persistPricingQuote(quote);
      const records = getPricingQuotes();
      assert.equal(records.length, 1);
      assert.equal(records[0].destinationCountry, "FR");
    });
  });
});
