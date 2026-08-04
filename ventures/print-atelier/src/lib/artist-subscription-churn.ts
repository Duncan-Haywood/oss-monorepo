/**
 * Artist Subscription Tier Upgrade & Churn Prediction Engine
 *
 * Evaluates artist platform subscription health, predicts churn risk based on activity & sales signals,
 * recommends tier upgrades (Free -> Pro -> Studio -> Enterprise), and triggers retention interventions.
 */

export type SubscriptionTier = 'free_artisan' | 'pro_gallery' | 'studio_master' | 'enterprise_label';
export type ArtistSubscriptionTier = 'free_creator' | 'pro_artist' | 'studio_gallery' | 'enterprise_label';
export type ChurnRiskLevel = 'low' | 'moderate' | 'high' | 'critical';

export interface ArtistSubscriptionProfile {
  artistId: string;
  artistName: string;
  currentTier: SubscriptionTier;
  monthlySubscriptionFeeUsd: number;
  monthlySalesVolumeUsd: number;
  activeListingsCount: number;
  newListingsPast30Days: number;
  lastLoginDaysAgo: number;
  openSupportTicketsCount: number;
  subscribersCount: number;
  joinedAt: string;
}

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

export interface ChurnPredictionResult {
  artistId: string;
  churnRiskScore: number; // 0 - 100
  churnRiskLevel: ChurnRiskLevel;
  recommendedTier: SubscriptionTier;
  tierUpgradeOpportunity: boolean;
  projectedAnnualValueUsd: number;
  recommendedIntervention?: 'schedule_success_call' | 'offer_custom_domain_credit' | 'waive_commission_fee' | 'feature_in_curated_drop';
  reasons: string[];
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

export interface SubscriptionPortfolioForecast {
  totalActiveArtists: number;
  currentMonthlyRecurringRevenueUsd: number;
  currentAnnualRecurringRevenueUsd: number;
  projectedMonthlyChurnUsd: number;
  expansionMrrOpportunityUsd: number;
  netRetentionRatePercent: number;
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

export function evaluateArtistSubscriptionPosture(profile: ArtistSubscriptionProfile): ChurnPredictionResult {
  const {
    artistId,
    currentTier,
    monthlySubscriptionFeeUsd,
    monthlySalesVolumeUsd,
    activeListingsCount,
    newListingsPast30Days,
    lastLoginDaysAgo,
    openSupportTicketsCount,
  } = profile;

  let churnRiskScore = 0;
  const reasons: string[] = [];

  if (lastLoginDaysAgo >= 60) {
    churnRiskScore += 40;
    reasons.push('Severe inactivity: No login in over 60 days (+40 risk).');
  } else if (lastLoginDaysAgo >= 30) {
    churnRiskScore += 25;
    reasons.push('Moderate inactivity: No login in 30 days (+25 risk).');
  } else if (lastLoginDaysAgo >= 14) {
    churnRiskScore += 10;
    reasons.push('Slight inactivity: No login in 14 days (+10 risk).');
  }

  if (newListingsPast30Days === 0) {
    churnRiskScore += 15;
    reasons.push('Catalog stagnation: Zero new print listings added in 30 days (+15 risk).');
    if (activeListingsCount < 3) {
      churnRiskScore += 10;
      reasons.push('Low listing volume: Fewer than 3 total active artworks (+10 risk).');
    }
  }

  if (openSupportTicketsCount >= 3) {
    churnRiskScore += 20;
    reasons.push('High support friction: 3+ unresolved support tickets (+20 risk).');
  } else if (openSupportTicketsCount > 0) {
    churnRiskScore += 10;
    reasons.push('Unresolved support ticket present (+10 risk).');
  }

  if (monthlySalesVolumeUsd === 0 && currentTier !== 'free_artisan') {
    churnRiskScore += 15;
    reasons.push('Paying tier with zero sales volume this month (+15 risk).');
  }

  const finalScore = Math.min(Math.round(churnRiskScore), 100);

  let churnRiskLevel: ChurnRiskLevel = 'low';
  if (finalScore >= 75) {
    churnRiskLevel = 'critical';
  } else if (finalScore >= 50) {
    churnRiskLevel = 'high';
  } else if (finalScore >= 25) {
    churnRiskLevel = 'moderate';
  }

  let recommendedTier: SubscriptionTier = currentTier;
  let tierUpgradeOpportunity = false;

  if (monthlySalesVolumeUsd >= 20000 || activeListingsCount >= 100) {
    recommendedTier = 'enterprise_label';
  } else if (monthlySalesVolumeUsd >= 5000 || activeListingsCount >= 35) {
    recommendedTier = 'studio_master';
  } else if (monthlySalesVolumeUsd >= 1000 || activeListingsCount >= 10) {
    recommendedTier = 'pro_gallery';
  } else {
    recommendedTier = 'free_artisan';
  }

  if (getTierWeight(recommendedTier) > getTierWeight(currentTier)) {
    tierUpgradeOpportunity = true;
    reasons.push(`Tier upgrade recommended: Sales volume ($${monthlySalesVolumeUsd.toLocaleString()}) qualifies for ${recommendedTier}.`);
  }

  let recommendedIntervention: ChurnPredictionResult['recommendedIntervention'] = undefined;
  if (churnRiskLevel === 'critical') {
    recommendedIntervention = 'schedule_success_call';
  } else if (churnRiskLevel === 'high' && currentTier !== 'free_artisan') {
    recommendedIntervention = 'waive_commission_fee';
  } else if (churnRiskLevel === 'moderate' && newListingsPast30Days === 0) {
    recommendedIntervention = 'feature_in_curated_drop';
  } else if (tierUpgradeOpportunity) {
    recommendedIntervention = 'offer_custom_domain_credit';
  }

  const tierAnnualFeeMap: Record<SubscriptionTier, number> = {
    free_artisan: 0,
    pro_gallery: 348,
    studio_master: 948,
    enterprise_label: 2388,
  };
  const projectedAnnualValueUsd = tierAnnualFeeMap[recommendedTier] + monthlySalesVolumeUsd * 12 * 0.12;

  return {
    artistId,
    churnRiskScore: finalScore,
    churnRiskLevel,
    recommendedTier,
    tierUpgradeOpportunity,
    projectedAnnualValueUsd: parseFloat(projectedAnnualValueUsd.toFixed(2)),
    recommendedIntervention,
    reasons,
  };
}

function getTierWeight(tier: SubscriptionTier): number {
  switch (tier) {
    case 'free_artisan':
      return 1;
    case 'pro_gallery':
      return 2;
    case 'studio_master':
      return 3;
    case 'enterprise_label':
      return 4;
  }
}

export function calculateSubscriptionRevenueForecast(artists: ArtistSubscriptionProfile[]): SubscriptionPortfolioForecast {
  if (artists.length === 0) {
    return {
      totalActiveArtists: 0,
      currentMonthlyRecurringRevenueUsd: 0,
      currentAnnualRecurringRevenueUsd: 0,
      projectedMonthlyChurnUsd: 0,
      expansionMrrOpportunityUsd: 0,
      netRetentionRatePercent: 100,
    };
  }

  let totalMrr = 0;
  let projectedMonthlyChurn = 0;
  let expansionMrrOpportunity = 0;

  for (const artist of artists) {
    totalMrr += artist.monthlySubscriptionFeeUsd;
    const posture = evaluateArtistSubscriptionPosture(artist);

    if (posture.churnRiskLevel === 'critical' || posture.churnRiskLevel === 'high') {
      projectedMonthlyChurn += artist.monthlySubscriptionFeeUsd;
    }

    if (posture.tierUpgradeOpportunity) {
      const upgradeFeeMap: Record<SubscriptionTier, number> = {
        free_artisan: 0,
        pro_gallery: 29,
        studio_master: 79,
        enterprise_label: 199,
      };
      const currentFee = artist.monthlySubscriptionFeeUsd;
      const targetFee = upgradeFeeMap[posture.recommendedTier];
      if (targetFee > currentFee) {
        expansionMrrOpportunity += targetFee - currentFee;
      }
    }
  }

  const currentAnnualRecurringRevenueUsd = parseFloat((totalMrr * 12).toFixed(2));
  const netRetentionRatePercent = totalMrr > 0 ? parseFloat((((totalMrr - projectedMonthlyChurn) / totalMrr) * 100).toFixed(2)) : 100;

  return {
    totalActiveArtists: artists.length,
    currentMonthlyRecurringRevenueUsd: parseFloat(totalMrr.toFixed(2)),
    currentAnnualRecurringRevenueUsd,
    projectedMonthlyChurnUsd: parseFloat(projectedMonthlyChurn.toFixed(2)),
    expansionMrrOpportunityUsd: parseFloat(expansionMrrOpportunity.toFixed(2)),
    netRetentionRatePercent,
  };
}

export class ArtistSubscriptionStore {
  private profiles = new Map<string, ArtistSubscriptionProfile>();

  recordArtist(profile: ArtistSubscriptionProfile): ChurnPredictionResult {
    this.profiles.set(profile.artistId, profile);
    return evaluateArtistSubscriptionPosture(profile);
  }

  getArtist(artistId: string): ArtistSubscriptionProfile | undefined {
    return this.profiles.get(artistId);
  }

  getForecast(): SubscriptionPortfolioForecast {
    return calculateSubscriptionRevenueForecast(Array.from(this.profiles.values()));
  }

  generateConvexSchema(): string {
    return `import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  artist_subscriptions: defineTable({
    artistId: v.string(),
    artistName: v.string(),
    currentTier: v.string(),
    monthlySubscriptionFeeUsd: v.number(),
    monthlySalesVolumeUsd: v.number(),
    activeListingsCount: v.number(),
    lastLoginDaysAgo: v.number(),
    churnRiskScore: v.number(),
    churnRiskLevel: v.string(),
    joinedAt: v.string(),
  }).index("by_churn_risk", ["churnRiskLevel"])
    .index("by_tier", ["currentTier"]),
});`;
  }
}

export const artistSubscriptionStore = new ArtistSubscriptionStore();

// Secondary API helpers to support alternate calling signatures
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
