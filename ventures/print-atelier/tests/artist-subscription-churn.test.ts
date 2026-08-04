import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  predictArtistChurnAndUpgrade,
  summarizeArtistSubscriptionCohort,
  generateConvexArtistChurnSchema,
  getArtistChurnPrediction,
  clearArtistChurnStoreForTesting,
  ArtistActivityMetrics,
} from "../src/lib/artist-subscription-churn.js";

describe("artist-subscription-churn", () => {
  beforeEach(() => {
    clearArtistChurnStoreForTesting();
  });

  const inactiveFreeArtist: ArtistActivityMetrics = {
    artistId: "artist_free_001",
    currentTier: "free_creator",
    monthlyActiveListings: 5,
    monthlyGrossSalesUsdCents: 0,
    daysSinceLastUpload: 95,
    supportTicketsOpened: 3,
    storageUsedMb: 400,
    storageLimitMb: 500,
  };

  const highPerformingFreeArtist: ArtistActivityMetrics = {
    artistId: "artist_free_002",
    currentTier: "free_creator",
    monthlyActiveListings: 12,
    monthlyGrossSalesUsdCents: 250000, // $2,500 USD -> eligible for pro_artist ($1,000 threshold)
    daysSinceLastUpload: 5,
    supportTicketsOpened: 0,
    storageUsedMb: 450,
    storageLimitMb: 500,
  };

  describe("predictArtistChurnAndUpgrade", () => {
    it("flags critical churn risk and recommends concierge outreach for inactive artist with support tickets", () => {
      const prediction = predictArtistChurnAndUpgrade(inactiveFreeArtist);

      assert.equal(prediction.artistId, "artist_free_001");
      assert.equal(prediction.churnRiskLevel, "critical");
      assert.ok(prediction.churnRiskPercent >= 75);
      assert.equal(prediction.recommendedAction, "urgent_concierge_outreach");
      assert.ok(prediction.notes.some((n) => n.includes("High inactivity")));
    });

    it("predicts low churn risk and recommends Pro Artist tier upgrade for high GMV free creator", () => {
      const prediction = predictArtistChurnAndUpgrade(highPerformingFreeArtist);

      assert.equal(prediction.artistId, "artist_free_002");
      assert.equal(prediction.churnRiskLevel, "low");
      assert.equal(prediction.upgradeEligibleTier, "pro_artist");
      assert.equal(prediction.recommendedAction, "suggest_tier_upgrade");
      assert.ok(prediction.notes.some((n) => n.includes("Eligible for Pro Artist upgrade")));
    });
  });

  describe("summarizeArtistSubscriptionCohort", () => {
    it("aggregates cohort average churn risk, high risk counts, and tier upgrade eligibilities", () => {
      const summary = summarizeArtistSubscriptionCohort([inactiveFreeArtist, highPerformingFreeArtist]);

      assert.equal(summary.totalArtists, 2);
      assert.equal(summary.highRiskCount, 1);
      assert.equal(summary.upgradeEligibleCount, 1);
      assert.equal(summary.tierBreakdown.free_creator, 2);
      assert.equal(summary.riskLevelBreakdown.critical, 1);
      assert.equal(summary.riskLevelBreakdown.low, 1);
    });

    it("handles empty cohort metrics list gracefully", () => {
      const summary = summarizeArtistSubscriptionCohort([]);

      assert.equal(summary.totalArtists, 0);
      assert.equal(summary.averageChurnRiskPercent, 0);
    });
  });

  describe("store & Convex schema", () => {
    it("caches and retrieves churn prediction by artist ID", () => {
      predictArtistChurnAndUpgrade(inactiveFreeArtist);
      const cached = getArtistChurnPrediction("artist_free_001");

      assert.ok(cached);
      assert.equal(cached?.currentTier, "free_creator");
    });

    it("generates valid Convex schema definition for artist_subscription_predictions", () => {
      const schema = generateConvexArtistChurnSchema();

      assert.ok(schema.includes("export const artist_subscription_predictions = defineTable({"));
      assert.ok(schema.includes(".index(\"by_risk\", [\"churnRiskLevel\"])"));
    });
  });
});
