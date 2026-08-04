import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluateConciergeConversionOpportunity,
  summarizeConciergeConversionFunnel,
  type ArtistEngagementProfile,
} from "../src/lib/concierge-analytics";

test("evaluates high conversion propensity for active free tier artist", () => {
  const artist: ArtistEngagementProfile = {
    artistId: "art_001",
    artistName: "Elena Rostova",
    currentTier: "free",
    totalPrintsSold: 35,
    mrrContributionUsd: 0,
    requestedTutoringSessionCount: 2,
    attendedMasterclassCount: 3,
    portfolioViewsMonth: 850,
    lastActiveDaysAgo: 2,
  };

  const opp = evaluateConciergeConversionOpportunity(artist);
  assert.ok(opp.conversionPropensityScore >= 70);
  assert.equal(opp.targetTier, "master");
  assert.equal(opp.potentialMrrExpansionUsd, 99);
  assert.equal(opp.recommendedAction, "invite_1on1_tutoring_demo");
});

test("summarizes concierge conversion funnel across artist cohorts", () => {
  const cohort: ArtistEngagementProfile[] = [
    {
      artistId: "art_001",
      artistName: "Elena Rostova",
      currentTier: "free",
      totalPrintsSold: 60,
      mrrContributionUsd: 0,
      requestedTutoringSessionCount: 2,
      attendedMasterclassCount: 4,
      portfolioViewsMonth: 1200,
      lastActiveDaysAgo: 1,
    },
    {
      artistId: "art_002",
      artistName: "Marcus Vance",
      currentTier: "pro",
      totalPrintsSold: 5,
      mrrContributionUsd: 29,
      requestedTutoringSessionCount: 0,
      attendedMasterclassCount: 0,
      portfolioViewsMonth: 100,
      lastActiveDaysAgo: 45,
    },
  ];

  const summary = summarizeConciergeConversionFunnel(cohort);
  assert.equal(summary.totalArtists, 2);
  assert.equal(summary.freeTierCount, 1);
  assert.equal(summary.proTierCount, 1);
  assert.equal(summary.highPropensityCandidatesCount, 1);
  assert.ok(summary.totalExpansionMrrPotentialUsd > 0);
});
