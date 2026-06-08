import assert from "node:assert/strict";
import test from "node:test";

import {
  calculateCatalogSummary,
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
