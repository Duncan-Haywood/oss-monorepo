import assert from "node:assert/strict";
import test from "node:test";

import {
  catalogArtworks,
  compareProductDetailPreviewModes,
  calculateArtistEarningsForecast,
} from "../src/lib/marketplace";

test("compareProductDetailPreviewModes recommends room preview when mockups and proof are live", () => {
  const artwork = catalogArtworks.find((item) => item.slug === "midnight-coast");
  assert.ok(artwork);

  const comparison = compareProductDetailPreviewModes(artwork, {
    previewEngagementRate: 30,
    conversionLiftPercent: 50,
  });

  assert.equal(comparison.recommendedMode, "room-preview");
  assert.equal(comparison.roomPreview.ctaEnabled, true);
  assert.ok(comparison.roomPreview.conversionLiftVsFlat > 0);
  assert.ok(comparison.roomPreview.estimatedConversionRate > comparison.flat.estimatedConversionRate);
});

test("compareProductDetailPreviewModes blocks room preview CTA when mockups are missing", () => {
  const artwork = catalogArtworks.find((item) => item.slug === "abstract-no-4");
  assert.ok(artwork);

  const comparison = compareProductDetailPreviewModes(artwork);

  assert.equal(comparison.recommendedMode, "flat");
  assert.equal(comparison.roomPreview.ctaEnabled, false);
  assert.ok(comparison.roomPreview.blockers.includes("Generate room mockups"));
});

test("calculateArtistEarningsForecast projects monthly and annual artist share", () => {
  const forecast = calculateArtistEarningsForecast({
    retailPrice: 85,
    fulfillmentCost: 28,
    monthlyOrders: 40,
  });

  assert.ok(forecast.perPrintArtistShare > 0);
  assert.equal(forecast.monthlyEarnings, Math.round(forecast.perPrintArtistShare * 40 * 100) / 100);
  assert.equal(forecast.annualEarnings, Math.round(forecast.monthlyEarnings * 12 * 100) / 100);
  assert.ok(forecast.payoutProofLine.includes("30%"));
});
