export type ArtistSubscriptionTier = "free" | "pro" | "master";

export interface ArtistEngagementProfile {
  artistId: string;
  artistName: string;
  currentTier: ArtistSubscriptionTier;
  totalPrintsSold: number;
  mrrContributionUsd: number;
  requestedTutoringSessionCount: number;
  attendedMasterclassCount: number;
  portfolioViewsMonth: number;
  lastActiveDaysAgo: number;
}

export interface ConciergeConversionOpportunity {
  artistId: string;
  artistName: string;
  currentTier: ArtistSubscriptionTier;
  targetTier: "pro" | "master" | "concierge_vip";
  conversionPropensityScore: number; // 0 - 100
  potentialMrrExpansionUsd: number;
  recommendedAction: "invite_1on1_tutoring_demo" | "offer_masterclass_pass" | "propose_custom_fulfillment_concierge" | "maintain_engagement";
  primaryDriver: string;
}

export interface ConciergeFunnelSummary {
  totalArtists: number;
  freeTierCount: number;
  proTierCount: number;
  masterTierCount: number;
  highPropensityCandidatesCount: number;
  totalExpansionMrrPotentialUsd: number;
  topUpgradeTargets: ConciergeConversionOpportunity[];
}

const TIER_MRR_USD: Record<ArtistSubscriptionTier | "concierge_vip", number> = {
  free: 0,
  pro: 29,
  master: 99,
  concierge_vip: 249,
};

export function evaluateConciergeConversionOpportunity(
  artist: ArtistEngagementProfile
): ConciergeConversionOpportunity {
  let score = 0;
  let primaryDriver = "Baseline activity level.";

  // Print sales activity driver
  if (artist.totalPrintsSold >= 50) {
    score += 35;
    primaryDriver = "High volume sales footprint indicates strong monetization readiness.";
  } else if (artist.totalPrintsSold >= 20) {
    score += 20;
    primaryDriver = "Steady print sales volume with growing gallery audience.";
  } else if (artist.totalPrintsSold >= 5) {
    score += 10;
  }

  // Tutoring and masterclass intent signals
  if (artist.requestedTutoringSessionCount >= 2) {
    score += 30;
    primaryDriver = "Explicit demand for 1-on-1 tutoring sessions.";
  } else if (artist.requestedTutoringSessionCount === 1) {
    score += 15;
  }

  if (artist.attendedMasterclassCount >= 3) {
    score += 25;
    primaryDriver = "High masterclass attendance demonstrating deep engagement.";
  } else if (artist.attendedMasterclassCount >= 1) {
    score += 12;
  }

  // Portfolio view momentum
  if (artist.portfolioViewsMonth >= 1000) {
    score += 15;
  } else if (artist.portfolioViewsMonth >= 300) {
    score += 8;
  }

  // Inactivity decay
  if (artist.lastActiveDaysAgo > 30) {
    score -= 25;
  } else if (artist.lastActiveDaysAgo > 14) {
    score -= 10;
  }

  score = Math.min(100, Math.max(0, score));

  let targetTier: ConciergeConversionOpportunity["targetTier"] = "pro";
  let potentialMrrExpansionUsd = 0;
  let recommendedAction: ConciergeConversionOpportunity["recommendedAction"] = "maintain_engagement";

  if (artist.currentTier === "free") {
    targetTier = score >= 70 ? "master" : "pro";
    potentialMrrExpansionUsd = TIER_MRR_USD[targetTier] - TIER_MRR_USD.free;
    recommendedAction = score >= 60 ? "invite_1on1_tutoring_demo" : "offer_masterclass_pass";
  } else if (artist.currentTier === "pro") {
    targetTier = score >= 75 ? "concierge_vip" : "master";
    potentialMrrExpansionUsd = TIER_MRR_USD[targetTier] - TIER_MRR_USD.pro;
    recommendedAction = score >= 65 ? "propose_custom_fulfillment_concierge" : "invite_1on1_tutoring_demo";
  } else if (artist.currentTier === "master") {
    targetTier = "concierge_vip";
    potentialMrrExpansionUsd = TIER_MRR_USD.concierge_vip - TIER_MRR_USD.master;
    recommendedAction = score >= 50 ? "propose_custom_fulfillment_concierge" : "maintain_engagement";
  }

  return {
    artistId: artist.artistId,
    artistName: artist.artistName,
    currentTier: artist.currentTier,
    targetTier,
    conversionPropensityScore: score,
    potentialMrrExpansionUsd,
    recommendedAction,
    primaryDriver,
  };
}

export function summarizeConciergeConversionFunnel(
  artists: ArtistEngagementProfile[]
): ConciergeFunnelSummary {
  const opportunities = artists.map(evaluateConciergeConversionOpportunity);

  let freeTierCount = 0;
  let proTierCount = 0;
  let masterTierCount = 0;
  let highPropensityCandidatesCount = 0;
  let totalExpansionMrrPotentialUsd = 0;

  for (const art of artists) {
    if (art.currentTier === "free") freeTierCount++;
    else if (art.currentTier === "pro") proTierCount++;
    else if (art.currentTier === "master") masterTierCount++;
  }

  const sortedOpp = [...opportunities].sort(
    (a, b) => b.conversionPropensityScore - a.conversionPropensityScore
  );

  for (const opp of sortedOpp) {
    if (opp.conversionPropensityScore >= 60) {
      highPropensityCandidatesCount++;
      totalExpansionMrrPotentialUsd += opp.potentialMrrExpansionUsd;
    }
  }

  return {
    totalArtists: artists.length,
    freeTierCount,
    proTierCount,
    masterTierCount,
    highPropensityCandidatesCount,
    totalExpansionMrrPotentialUsd,
    topUpgradeTargets: sortedOpp.slice(0, 10),
  };
}
