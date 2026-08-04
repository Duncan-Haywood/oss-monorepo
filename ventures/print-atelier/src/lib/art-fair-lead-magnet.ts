/**
 * Gallery Art Fair Collector Lead Magnet & AR Wall Preview Conversion Engine
 *
 * Captures art fair booth visitor leads, calculates collector conversion probability,
 * recommends personalized follow-up incentive offers (AR room preview, VIP discount),
 * and tracks art fair acquisition ROI & estimated customer lifetime value (LTV).
 */

export interface CollectorLeadInput {
  leadId: string;
  collectorName: string;
  email: string;
  phone?: string;
  artFairName: string;
  boothNumber: string;
  interestLevel: 'casual_visitor' | 'interested_buyer' | 'vip_collector';
  budgetRangeUsd: { min: number; max: number };
  preferredMediums: ('archival_giclee' | 'canvas' | 'metallic_paper' | 'acrylic_flush')[];
  wallPhotoUploaded: boolean;
  arPreviewRequested: boolean;
  artworkIdInquired?: string;
  artworkPriceUsd?: number;
}

export interface LeadConversionScore {
  leadId: string;
  conversionScore: number; // 0 - 100
  tier: 'hot_prospect' | 'warm_lead' | 'nurture';
  recommendedIncentive: 'vip_presale_discount_15' | 'free_archival_framing' | 'complimentary_shipping' | 'ar_wall_consultation';
  personalizedOfferCopy: string;
  estimatedLtvUsd: number;
  followUpWindowHours: number; // e.g. 24 hours for hot prospect
}

export interface ArtFairCohortMetrics {
  artFairName: string;
  totalLeadsCaptured: number;
  arPreviewConversionRatePercentage: number;
  projectedGrossRevenueUsd: number;
  boothCostUsd: number;
  roiPercentage: number;
}

/**
 * Calculates collector lead conversion probability score and personalized offer parameters
 */
export function scoreCollectorLead(lead: CollectorLeadInput): LeadConversionScore {
  let score = 20; // base score

  if (lead.interestLevel === 'vip_collector') score += 35;
  else if (lead.interestLevel === 'interested_buyer') score += 20;

  if (lead.wallPhotoUploaded) score += 20;
  if (lead.arPreviewRequested) score += 15;

  if (lead.budgetRangeUsd.max >= 2500) score += 10;
  else if (lead.budgetRangeUsd.max >= 1000) score += 5;

  if (lead.phone && lead.phone.length > 5) score += 5;

  // Clamp score
  score = Math.max(0, Math.min(100, score));

  let tier: 'hot_prospect' | 'warm_lead' | 'nurture' = 'nurture';
  if (score >= 70) tier = 'hot_prospect';
  else if (score >= 45) tier = 'warm_lead';

  let recommendedIncentive: 'vip_presale_discount_15' | 'free_archival_framing' | 'complimentary_shipping' | 'ar_wall_consultation' = 'ar_wall_consultation';
  let followUpWindowHours = 72;

  if (tier === 'hot_prospect') {
    followUpWindowHours = 24;
    recommendedIncentive = lead.budgetRangeUsd.max >= 2000 ? 'free_archival_framing' : 'vip_presale_discount_15';
  } else if (tier === 'warm_lead') {
    followUpWindowHours = 48;
    recommendedIncentive = lead.arPreviewRequested ? 'ar_wall_consultation' : 'complimentary_shipping';
  }

  let offerCopy = `Thank you for visiting booth ${lead.boothNumber} at ${lead.artFairName}!`;
  switch (recommendedIncentive) {
    case 'free_archival_framing':
      offerCopy += ' Claim your complimentary museum-grade UV framing on your first fine art print purchase.';
      break;
    case 'vip_presale_discount_15':
      offerCopy += ' Here is an exclusive 15% VIP Art Fair discount code for your chosen print.';
      break;
    case 'complimentary_shipping':
      offerCopy += ' Enjoy complimentary white-glove insured delivery to your home or gallery space.';
      break;
    case 'ar_wall_consultation':
      offerCopy += ' Preview how your favorite print looks hanging on your wall with our AR room visualization tool.';
      break;
  }

  const estimatedOrderVal = lead.artworkPriceUsd ?? (lead.budgetRangeUsd.min + lead.budgetRangeUsd.max) / 2;
  const estimatedLtvUsd = Math.round(estimatedOrderVal * 1.65 * 100) / 100;

  return {
    leadId: lead.leadId,
    conversionScore: score,
    tier,
    recommendedIncentive,
    personalizedOfferCopy: offerCopy,
    estimatedLtvUsd,
    followUpWindowHours,
  };
}

/**
 * Aggregates cohort performance metrics for an art fair booth campaign
 */
export function aggregateArtFairCohort(
  artFairName: string,
  boothCostUsd: number,
  leads: CollectorLeadInput[]
): ArtFairCohortMetrics {
  const totalLeadsCaptured = leads.length;
  if (totalLeadsCaptured === 0) {
    return {
      artFairName,
      totalLeadsCaptured: 0,
      arPreviewConversionRatePercentage: 0,
      projectedGrossRevenueUsd: 0,
      boothCostUsd,
      roiPercentage: -100,
    };
  }

  const arRequestedCount = leads.filter(l => l.arPreviewRequested || l.wallPhotoUploaded).length;
  const arPreviewConversionRatePercentage = Math.round((arRequestedCount / totalLeadsCaptured) * 1000) / 10;

  let totalProjectedRevenue = 0;
  for (const lead of leads) {
    const scored = scoreCollectorLead(lead);
    const winProbability = scored.conversionScore / 100;
    const avgOrderVal = lead.artworkPriceUsd ?? (lead.budgetRangeUsd.min + lead.budgetRangeUsd.max) / 2;
    totalProjectedRevenue += winProbability * avgOrderVal;
  }

  const projectedGrossRevenueUsd = Math.round(totalProjectedRevenue * 100) / 100;
  const netProfit = projectedGrossRevenueUsd - boothCostUsd;
  const roiPercentage = boothCostUsd > 0 ? Math.round((netProfit / boothCostUsd) * 1000) / 10 : 0;

  return {
    artFairName,
    totalLeadsCaptured,
    arPreviewConversionRatePercentage,
    projectedGrossRevenueUsd,
    boothCostUsd,
    roiPercentage,
  };
}
