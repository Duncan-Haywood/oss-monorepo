/**
 * Automated Influencer Affiliate Commission & Promo Code ROI Attribution Engine
 * 
 * Provides:
 * - Tiered influencer affiliate registration & custom promo code generation
 * - Commission payout calculation with minimum payout thresholds
 * - Order GMV attribution, discount application, & net platform ROI metrics
 * - Convex schema definition & in-memory snapshot state persistence
 */

export type InfluencerTier = "standard" | "silver" | "gold" | "vip";

export interface InfluencerAffiliate {
  influencerId: string;
  name: string;
  email: string;
  tier: InfluencerTier;
  promoCode: string;
  commissionRatePercent: number;
  discountRatePercent: number;
  totalGmvGeneratedCents: number;
  totalCommissionEarnedCents: number;
  totalCommissionPaidCents: number;
  pendingPayoutCents: number;
  createdAt: number;
}

export interface InfluencerOrderAttribution {
  attributionId: string;
  orderId: string;
  influencerId: string;
  promoCode: string;
  orderGrossUsdCents: number;
  discountUsdCents: number;
  netOrderUsdCents: number;
  commissionUsdCents: number;
  attributedAt: number;
}

export interface InfluencerCampaignRoi {
  influencerId: string;
  promoCode: string;
  tier: InfluencerTier;
  totalOrders: number;
  totalGmvCents: number;
  totalDiscountsCents: number;
  netRevenueCents: number;
  totalCommissionCents: number;
  platformProfitCents: number;
  roiMultiplier: number; // netRevenue / commission
}

export const TIER_COMMISSION_RATES: Record<InfluencerTier, { commissionPercent: number; discountPercent: number }> = {
  standard: { commissionPercent: 10.0, discountPercent: 10.0 },
  silver: { commissionPercent: 12.5, discountPercent: 15.0 },
  gold: { commissionPercent: 15.0, discountPercent: 15.0 },
  vip: { commissionPercent: 20.0, discountPercent: 20.0 },
};

export const MINIMUM_PAYOUT_THRESHOLD_CENTS = 5000; // $50.00 minimum threshold for payout execution

let affiliateStore: Map<string, InfluencerAffiliate> = new Map();
let orderAttributionStore: InfluencerOrderAttribution[] = [];

/**
 * Registers a new influencer affiliate with default tier parameters
 */
export function registerInfluencerAffiliate(
  influencerId: string,
  name: string,
  email: string,
  tier: InfluencerTier = "standard",
  customPromoCode?: string
): InfluencerAffiliate {
  const rates = TIER_COMMISSION_RATES[tier] || TIER_COMMISSION_RATES.standard;
  const promoCode = (customPromoCode || `${name.replace(/\s+/g, "").toUpperCase()}${rates.discountPercent}`).toUpperCase();

  const affiliate: InfluencerAffiliate = {
    influencerId,
    name,
    email,
    tier,
    promoCode,
    commissionRatePercent: rates.commissionPercent,
    discountRatePercent: rates.discountPercent,
    totalGmvGeneratedCents: 0,
    totalCommissionEarnedCents: 0,
    totalCommissionPaidCents: 0,
    pendingPayoutCents: 0,
    createdAt: Date.now(),
  };

  affiliateStore.set(influencerId, affiliate);
  return affiliate;
}

/**
 * Evaluates order and calculates influencer promo discount and commission earned
 */
export function attributeOrderToInfluencer(
  orderId: string,
  promoCode: string,
  orderGrossUsdCents: number
): InfluencerOrderAttribution | null {
  const normalizedCode = promoCode.trim().toUpperCase();
  let matchedAffiliate: InfluencerAffiliate | undefined;

  for (const aff of affiliateStore.values()) {
    if (aff.promoCode.toUpperCase() === normalizedCode) {
      matchedAffiliate = aff;
      break;
    }
  }

  if (!matchedAffiliate) {
    return null;
  }

  const discountUsdCents = Math.round(orderGrossUsdCents * (matchedAffiliate.discountRatePercent / 100));
  const netOrderUsdCents = Math.max(0, orderGrossUsdCents - discountUsdCents);
  const commissionUsdCents = Math.round(netOrderUsdCents * (matchedAffiliate.commissionRatePercent / 100));

  const attribution: InfluencerOrderAttribution = {
    attributionId: `attr_${orderId}_${matchedAffiliate.influencerId}`,
    orderId,
    influencerId: matchedAffiliate.influencerId,
    promoCode: matchedAffiliate.promoCode,
    orderGrossUsdCents,
    discountUsdCents,
    netOrderUsdCents,
    commissionUsdCents,
    attributedAt: Date.now(),
  };

  // Update affiliate aggregated stats
  matchedAffiliate.totalGmvGeneratedCents += orderGrossUsdCents;
  matchedAffiliate.totalCommissionEarnedCents += commissionUsdCents;
  matchedAffiliate.pendingPayoutCents += commissionUsdCents;

  orderAttributionStore.push(attribution);
  return attribution;
}

/**
 * Calculates campaign ROI metrics for a given influencer
 */
export function calculateInfluencerCampaignRoi(influencerId: string): InfluencerCampaignRoi | null {
  const affiliate = affiliateStore.get(influencerId);
  if (!affiliate) return null;

  const attributions = orderAttributionStore.filter((a) => a.influencerId === influencerId);

  const totalOrders = attributions.length;
  const totalGmvCents = attributions.reduce((acc, curr) => acc + curr.orderGrossUsdCents, 0);
  const totalDiscountsCents = attributions.reduce((acc, curr) => acc + curr.discountUsdCents, 0);
  const netRevenueCents = totalGmvCents - totalDiscountsCents;
  const totalCommissionCents = attributions.reduce((acc, curr) => acc + curr.commissionUsdCents, 0);

  // Platform gross profit assumes estimated 50% fulfillment cost margin after commission
  const platformProfitCents = Math.max(0, netRevenueCents * 0.5 - totalCommissionCents);
  const roiMultiplier = totalCommissionCents > 0 ? Number((netRevenueCents / totalCommissionCents).toFixed(2)) : 0;

  return {
    influencerId,
    promoCode: affiliate.promoCode,
    tier: affiliate.tier,
    totalOrders,
    totalGmvCents,
    totalDiscountsCents,
    netRevenueCents,
    totalCommissionCents,
    platformProfitCents,
    roiMultiplier,
  };
}

/**
 * Determines whether an influencer has reached the minimum payout execution threshold
 */
export function evaluatePayoutEligibility(influencerId: string): {
  isEligible: boolean;
  pendingPayoutCents: number;
  thresholdCents: number;
  remainingToThresholdCents: number;
} {
  const affiliate = affiliateStore.get(influencerId);
  if (!affiliate) {
    return { isEligible: false, pendingPayoutCents: 0, thresholdCents: MINIMUM_PAYOUT_THRESHOLD_CENTS, remainingToThresholdCents: MINIMUM_PAYOUT_THRESHOLD_CENTS };
  }

  const pending = affiliate.pendingPayoutCents;
  const isEligible = pending >= MINIMUM_PAYOUT_THRESHOLD_CENTS;
  const remaining = isEligible ? 0 : MINIMUM_PAYOUT_THRESHOLD_CENTS - pending;

  return {
    isEligible,
    pendingPayoutCents: pending,
    thresholdCents: MINIMUM_PAYOUT_THRESHOLD_CENTS,
    remainingToThresholdCents: remaining,
  };
}

/**
 * Generates Convex database schema for influencer affiliate tracking
 */
export function generateConvexInfluencerSchema(): {
  influencer_affiliates: {
    columns: Record<string, string>;
    indexes: Record<string, string[]>;
  };
  influencer_attributions: {
    columns: Record<string, string>;
    indexes: Record<string, string[]>;
  };
} {
  return {
    influencer_affiliates: {
      columns: {
        influencerId: "string",
        name: "string",
        email: "string",
        tier: "string",
        promoCode: "string",
        commissionRatePercent: "number",
        pendingPayoutCents: "number",
        createdAt: "number",
      },
      indexes: {
        by_promo: ["promoCode"],
        by_influencer: ["influencerId"],
      },
    },
    influencer_attributions: {
      columns: {
        attributionId: "string",
        orderId: "string",
        influencerId: "string",
        orderGrossUsdCents: "number",
        commissionUsdCents: "number",
        attributedAt: "number",
      },
      indexes: {
        by_order: ["orderId"],
        by_influencer: ["influencerId"],
      },
    },
  };
}

export function getInfluencerAffiliates(): InfluencerAffiliate[] {
  return Array.from(affiliateStore.values());
}

export function clearInfluencersForTesting(): void {
  if (!affiliateStore) {
    affiliateStore = new Map();
  } else {
    affiliateStore.clear();
  }
  orderAttributionStore = [];
}
