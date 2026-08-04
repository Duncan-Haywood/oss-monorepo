/**
 * Artist Subscription Tier Upgrade & Churn Prediction Engine
 *
 * Evaluates artist platform subscription health, predicts churn risk based on activity & sales signals,
 * recommends tier upgrades (Free -> Pro -> Studio -> Enterprise), and triggers retention interventions.
 */

export type ArtistSubscriptionTier = 'free_creator' | 'pro_artist' | 'studio_gallery' | 'enterprise_label';
export type ChurnRiskLevel = 'low' | 'moderate' | 'high' | 'critical';

export interface ArtistActivityMetrics {
  artistId: string;
  currentTier: ArtistSubscriptionTier;
  monthlyActiveListings: number;
  monthlyGrossSalesUsdCents: number;
  daysSinceLastUpload: number;
  supportTicketsOpened: number;
  storageUsedMb: number;
  storageLimitMb: number;
}

export interface ArtistChurnPrediction {
  artistId: string;
  currentTier: ArtistSubscriptionTier;
  churnRiskPercent: number;
  churnRiskLevel: ChurnRiskLevel;
  upgradeEligibleTier?: ArtistSubscriptionTier;
  recommendedAction: 'urgent_concierge_outreach' | 'suggest_tier_upgrade' | 'send_engagement_campaign' | 'maintain_nurture';
  notes: string[];
  predictedAt: number;
}

export interface ArtistCohortSummary {
  totalArtists: number;
  averageChurnRiskPercent: number;
  highRiskCount: number;
  upgradeEligibleCount: number;
  tierBreakdown: Record<ArtistSubscriptionTier, number>;
  riskLevelBreakdown: Record<ChurnRiskLevel, number>;
}

const churnStore = new Map<string, ArtistChurnPrediction>();


// The engine this module also carried — `evaluateArtistSubscriptionPosture`,
// `calculateSubscriptionRevenueForecast` and `ArtistSubscriptionStore`, over a
// second set of tier names — had no caller anywhere in `src/` or `tests/`. It
// was removed rather than covered. What remains is still called only by its own
// suite; no product surface reads a churn prediction yet.
export function predictArtistChurnAndUpgrade(metrics: ArtistActivityMetrics): ArtistChurnPrediction {
  const {
    artistId,
    currentTier,
    monthlyActiveListings,
    monthlyGrossSalesUsdCents,
    daysSinceLastUpload,
    supportTicketsOpened,
  } = metrics;

  const notes: string[] = [];
  let churnRiskScore = 10;

  if (daysSinceLastUpload >= 90) {
    churnRiskScore += 45;
    notes.push("High inactivity: No uploads in 90+ days (+45 risk).");
  } else if (daysSinceLastUpload >= 45) {
    churnRiskScore += 25;
    notes.push("Moderate inactivity: No uploads in 45+ days (+25 risk).");
  }

  if (supportTicketsOpened >= 3) {
    churnRiskScore += 30;
    notes.push("High support friction: 3+ support tickets open (+30 risk).");
  } else if (supportTicketsOpened > 0) {
    churnRiskScore += 10;
    notes.push("Support friction present (+10 risk).");
  }

  if (monthlyGrossSalesUsdCents === 0 && currentTier !== "free_creator") {
    churnRiskScore += 20;
    notes.push("Zero sales on paid tier (+20 risk).");
  }

  const churnRiskPercent = Math.min(Math.round(churnRiskScore), 100);

  let churnRiskLevel: ChurnRiskLevel = "low";
  if (churnRiskPercent >= 75) {
    churnRiskLevel = "critical";
  } else if (churnRiskPercent >= 50) {
    churnRiskLevel = "high";
  } else if (churnRiskPercent >= 25) {
    churnRiskLevel = "moderate";
  }

  let upgradeEligibleTier: ArtistSubscriptionTier | undefined;
  if (monthlyGrossSalesUsdCents >= 1000000) {
    if (currentTier !== "enterprise_label") upgradeEligibleTier = "enterprise_label";
  } else if (monthlyGrossSalesUsdCents >= 300000) {
    if (currentTier === "free_creator" || currentTier === "pro_artist") upgradeEligibleTier = "studio_gallery";
  } else if (monthlyGrossSalesUsdCents >= 100000) {
    if (currentTier === "free_creator") upgradeEligibleTier = "pro_artist";
  }

  if (upgradeEligibleTier) {
    notes.push(`Eligible for ${upgradeEligibleTier === "pro_artist" ? "Pro Artist" : upgradeEligibleTier} upgrade based on sales volume.`);
  }

  let recommendedAction: ArtistChurnPrediction["recommendedAction"] = "maintain_nurture";
  if (churnRiskLevel === "critical" || churnRiskLevel === "high") {
    recommendedAction = "urgent_concierge_outreach";
  } else if (upgradeEligibleTier) {
    recommendedAction = "suggest_tier_upgrade";
  } else if (daysSinceLastUpload >= 45) {
    recommendedAction = "send_engagement_campaign";
  }

  const prediction: ArtistChurnPrediction = {
    artistId,
    currentTier,
    churnRiskPercent,
    churnRiskLevel,
    upgradeEligibleTier,
    recommendedAction,
    notes,
    predictedAt: Date.now(),
  };

  churnStore.set(artistId, prediction);
  return prediction;
}

export function summarizeArtistSubscriptionCohort(metricsList: ArtistActivityMetrics[]): ArtistCohortSummary {
  const totalArtists = metricsList.length;
  let totalRiskPercent = 0;
  let highRiskCount = 0;
  let upgradeEligibleCount = 0;

  const tierBreakdown: Record<ArtistSubscriptionTier, number> = {
    free_creator: 0,
    pro_artist: 0,
    studio_gallery: 0,
    enterprise_label: 0,
  };

  const riskLevelBreakdown: Record<ChurnRiskLevel, number> = {
    low: 0,
    moderate: 0,
    high: 0,
    critical: 0,
  };

  for (const metrics of metricsList) {
    tierBreakdown[metrics.currentTier] = (tierBreakdown[metrics.currentTier] || 0) + 1;
    const prediction = predictArtistChurnAndUpgrade(metrics);
    totalRiskPercent += prediction.churnRiskPercent;
    riskLevelBreakdown[prediction.churnRiskLevel] = (riskLevelBreakdown[prediction.churnRiskLevel] || 0) + 1;

    if (prediction.churnRiskLevel === "high" || prediction.churnRiskLevel === "critical") {
      highRiskCount += 1;
    }
    if (prediction.upgradeEligibleTier) {
      upgradeEligibleCount += 1;
    }
  }

  const averageChurnRiskPercent = totalArtists > 0 ? parseFloat((totalRiskPercent / totalArtists).toFixed(2)) : 0;

  return {
    totalArtists,
    averageChurnRiskPercent,
    highRiskCount,
    upgradeEligibleCount,
    tierBreakdown,
    riskLevelBreakdown,
  };
}

export function getArtistChurnPrediction(artistId: string): ArtistChurnPrediction | undefined {
  return churnStore.get(artistId);
}

export function clearArtistChurnStoreForTesting(): void {
  churnStore.clear();
}

export function generateConvexArtistChurnSchema(): string {
  return `import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const artist_subscription_predictions = defineTable({
  artistId: v.string(),
  currentTier: v.string(),
  churnRiskPercent: v.number(),
  churnRiskLevel: v.string(),
  upgradeEligibleTier: v.optional(v.string()),
  recommendedAction: v.string(),
  predictedAt: v.number(),
}).index("by_risk", ["churnRiskLevel"])
  .index("by_tier", ["currentTier"]);`;
}
