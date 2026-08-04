import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  detectUserLocaleAndCurrency,
  formatLocalizedPriceWithVat,
  generateStorefrontLocalizationWidgetState,
  generateConvexLocalizationSchema,
  persistLocalizationAudit,
  getLocalizationAudits,
  clearLocalizationAuditsForTesting,
} from "../src/lib/storefront-localization.ts";
import { GET as localizationRouteGet } from "../src/app/api/storefront/localization/route.ts";

describe("storefront-localization", () => {
  beforeEach(() => {
    clearLocalizationAuditsForTesting();
  });

  describe("detectUserLocaleAndCurrency", () => {
    it("detects GBP for UK country code", () => {
      const res = detectUserLocaleAndCurrency("en-GB,en;q=0.9", "GB");
      assert.equal(res.currency, "GBP");
      assert.equal(res.locale, "en-GB");
      assert.equal(res.vatInclusive, true);
    });

    it("detects EUR and EU VAT rules for Germany (DE)", () => {
      const res = detectUserLocaleAndCurrency("de-DE,de;q=0.9", "DE");
      assert.equal(res.currency, "EUR");
      assert.equal(res.locale, "de-DE");
      assert.equal(res.vatInclusive, true);
      assert.equal(res.defaultVatRatePercent, 19.0);
    });

    it("defaults to USD and VAT-exclusive for US or unknown country", () => {
      const res = detectUserLocaleAndCurrency("en-US,en;q=0.9", "US");
      assert.equal(res.currency, "USD");
      assert.equal(res.locale, "en-US");
      assert.equal(res.vatInclusive, false);
    });
  });

  describe("formatLocalizedPriceWithVat", () => {
    it("formats UK price with 20% VAT inclusive", () => {
      // Base USD $100 -> GBP 7900 pence + FX buffer -> charm rounded -> VAT inclusive
      const res = formatLocalizedPriceWithVat(10000, "GBP", 20.0, { includeVatLabel: true });
      assert.ok(res.formattedDisplay.includes("£"));
      assert.ok(res.formattedDisplay.includes("VAT included"));
      assert.equal(res.vatInclusive, true);
      assert.ok(res.vatAmountCents > 0);
    });

    it("formats US price with sales tax separate disclaimer", () => {
      const res = formatLocalizedPriceWithVat(5000, "USD", 0, { includeVatLabel: true });
      assert.ok(res.formattedDisplay.includes("$"));
      assert.ok(res.formattedDisplay.includes("+ tax"));
      assert.equal(res.vatInclusive, false);
      assert.equal(res.vatAmountCents, 0);
    });
  });

  describe("generateStorefrontLocalizationWidgetState", () => {
    it("builds complete widget state payload for DE visitor", () => {
      const widget = generateStorefrontLocalizationWidgetState(10000, "DE");
      assert.equal(widget.countryCode, "DE");
      assert.equal(widget.currency, "EUR");
      assert.equal(widget.vatInclusive, true);
      assert.ok(widget.priceDisplay.length > 0);
      assert.ok(widget.taxNotice.includes("19% MwSt"));
    });
  });

  describe("Convex schema & audit store", () => {
    it("generates valid Convex schema definition", () => {
      const schema = generateConvexLocalizationSchema();
      assert.ok(schema.tables.storefront_localization_audits);
      assert.ok(schema.tables.storefront_localization_audits.indexes.by_country);
    });

    it("persists and queries localization audit records", () => {
      const entry = persistLocalizationAudit({
        countryCode: "FR",
        currency: "EUR",
        baseUsdCents: 5000,
        displayedPriceCents: 4599,
        vatInclusive: true,
        vatRatePercent: 20.0,
      });

      assert.ok(entry.id);
      assert.equal(entry.countryCode, "FR");

      const logs = getLocalizationAudits();
      assert.equal(logs.length, 1);
      assert.equal(logs[0].currency, "EUR");
    });
  });

  describe("GET /api/storefront/localization route", () => {
    it("returns 200 OK with localized widget state for public callers", async () => {
      const req = new Request("https://printatelier.com/api/storefront/localization?country=DE&amount=10000");
      const res = await localizationRouteGet(req);
      assert.equal(res.status, 200);
      const data = (await res.json()) as { countryCode: string; currency: string };
      assert.equal(data.countryCode, "DE");
      assert.equal(data.currency, "EUR");
    });
  });
});
