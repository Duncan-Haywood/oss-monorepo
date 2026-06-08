import assert from "node:assert/strict";
import test from "node:test";

import {
  calculateCatalogSummary,
  calculateChannelScenario,
  calculateLaunchReadiness,
  calculatePrintEconomics,
  catalogArtworks,
} from "../src/lib/marketplace";

test("calculatePrintEconomics splits net profit 30/70 after fulfillment, payment, and AI costs", () => {
  const economics = calculatePrintEconomics({
    retailPrice: 100,
    fulfillmentCost: 30,
    paymentFeeRate: 0.03,
    aiComputeCost: 1,
  });

  assert.equal(economics.paymentFee, 3);
  assert.equal(economics.netProfit, 66);
  assert.equal(economics.artistShare, 19.8);
  assert.equal(economics.platformShare, 46.2);
  assert.equal(economics.marginPercent, 66);
});

test("calculateCatalogSummary aggregates sellable catalog health from shared artworks", () => {
  const summary = calculateCatalogSummary(catalogArtworks);

  assert.equal(summary.totalArtworks, catalogArtworks.length);
  assert.equal(summary.liveArtworks, 5);
  assert.equal(summary.proofQueue, 1);
  assert.equal(summary.averageReadinessScore, 83);
  assert.equal(summary.projectedMonthlyArtistPayout, 1559.43);
});

test("calculateLaunchReadiness rewards complete metadata, mockups, and print economics", () => {
  const readyArtwork = catalogArtworks.find((artwork) => artwork.slug === "midnight-coast");
  const blockedArtwork = catalogArtworks.find((artwork) => artwork.slug === "abstract-no-4");

  assert.ok(readyArtwork);
  assert.ok(blockedArtwork);
  assert.deepEqual(calculateLaunchReadiness(readyArtwork), {
    score: 100,
    label: "Launch-ready",
    blockers: [],
  });
  assert.deepEqual(calculateLaunchReadiness(blockedArtwork), {
    score: 40,
    label: "Needs work",
    blockers: ["Approve proof", "Add room mockups", "Improve margin"],
  });
});

test("calculateChannelScenario models CAC payback from lifetime platform gross", () => {
  const scenario = calculateChannelScenario({
    retailPrice: 85,
    fulfillmentCost: 28,
    monthlyOrders: 500,
    customerAcquisitionCost: 34,
    purchasesPerCustomer: 1.8,
  });

  assert.equal(scenario.platformGrossPerOrder, 37.87);
  assert.equal(scenario.artistPayoutPerOrder, 16.23);
  assert.equal(scenario.lifetimePlatformGross, 68.17);
  assert.equal(scenario.profitAfterCAC, 34.17);
  assert.equal(scenario.paybackOrders, 1);
  assert.equal(scenario.ltvToCacRatio, 2);
  assert.equal(scenario.monthlyMarketingSpend, 9444.44);
  assert.equal(scenario.monthlyContributionAfterCAC, 9490.56);
  assert.equal(scenario.monthlyArtistPayout, 8115);
});

test("calculateChannelScenario flags channels that need repeat purchases to break even", () => {
  const scenario = calculateChannelScenario({
    retailPrice: 65,
    fulfillmentCost: 18,
    monthlyOrders: 300,
    customerAcquisitionCost: 90,
    purchasesPerCustomer: 1.2,
  });

  assert.equal(scenario.platformGrossPerOrder, 31.29);
  assert.equal(scenario.lifetimePlatformGross, 37.55);
  assert.equal(scenario.profitAfterCAC, -52.45);
  assert.equal(scenario.paybackOrders, 3);
  assert.equal(scenario.ltvToCacRatio, 0.42);
  assert.equal(scenario.monthlyContributionAfterCAC, -13113);
});
