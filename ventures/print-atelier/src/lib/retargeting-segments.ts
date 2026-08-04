/**
 * Dynamic Ad Catalog Retargeting Audience Segment Builder
 * 
 * Classifies user intent signals (cart abandoners, high-value collectors, category browsers),
 * generates hashed customer match payloads for Meta, Google, Pinterest, and TikTok Ads,
 * and calculates dynamic bidding multipliers to maximize ad spend ROI.
 */

export type AdPlatform = "meta" | "google" | "pinterest" | "tiktok";

export type AudienceSegmentType =
  | "high_intent_abandoners"
  | "vip_repeat_collectors"
  | "artwork_category_browsers"
  | "dormant_buyers";

export interface UserSessionEvent {
  userId: string;
  email?: string;
  phone?: string;
  viewCount: number;
  cartValueCents: number;
  checkoutAbandoned: boolean;
  daysSinceLastActivity: number;
  purchaseHistoryCount: number;
  favoriteCategory?: string;
  gdprOptOut?: boolean;
}

export interface RetargetingAudiencePayload {
  platform: AdPlatform;
  segmentType: AudienceSegmentType;
  audienceName: string;
  hashedUserIds: string[];
  bidMultiplier: number;
  targetCategory?: string;
  matchedCount: number;
  excludedCount: number;
}

export interface RetargetingSegmentsSummary {
  totalAudienceSize: number;
  segmentBreakdown: Record<AudienceSegmentType, number>;
  platformDistribution: Record<AdPlatform, number>;
  gdprExcludedCount: number;
}

/**
 * Classifies user sessions into high-ROI retargeting segments.
 */
export function classifyAudienceSegment(user: UserSessionEvent): AudienceSegmentType {
  if (user.checkoutAbandoned || user.cartValueCents >= 10000) {
    return "high_intent_abandoners";
  }
  if (user.purchaseHistoryCount >= 3) {
    return "vip_repeat_collectors";
  }
  if (user.daysSinceLastActivity > 30) {
    return "dormant_buyers";
  }
  return "artwork_category_browsers";
}

/**
 * Calculates bid multiplier based on segment ROI potential.
 */
export function getSegmentBidMultiplier(segment: AudienceSegmentType): number {
  switch (segment) {
    case "high_intent_abandoners":
      return 1.5; // +50% bid lift for cart abandoners
    case "vip_repeat_collectors":
      return 1.3; // +30% bid lift for repeat buyers
    case "artwork_category_browsers":
      return 1.0; // Standard base bid
    case "dormant_buyers":
      return 0.8; // Lower bid for re-engagement
  }
}

/**
 * Builds hashed audience sync payload for specified ad platform.
 */
export function buildRetargetingAudiencePayload(
  users: UserSessionEvent[],
  platform: AdPlatform,
  targetSegment: AudienceSegmentType
): RetargetingAudiencePayload {
  const eligibleUsers = users.filter(
    (u) => !u.gdprOptOut && classifyAudienceSegment(u) === targetSegment
  );
  const excludedCount = users.filter(
    (u) => u.gdprOptOut || classifyAudienceSegment(u) !== targetSegment
  ).length;

  const hashedUserIds = eligibleUsers.map((u) => {
    const rawId = u.email || u.phone || u.userId;
    // Simulated hash string representation
    return `hash_${platform}_${rawId.toLowerCase().replace(/[^a-z0-9]/g, "")}`;
  });

  return {
    platform,
    segmentType: targetSegment,
    audienceName: `print_atelier_${platform}_${targetSegment}`,
    hashedUserIds,
    bidMultiplier: getSegmentBidMultiplier(targetSegment),
    matchedCount: eligibleUsers.length,
    excludedCount,
  };
}

/**
 * Aggregates summary across built retargeting segments.
 */
export function summarizeRetargetingSegments(
  payloads: RetargetingAudiencePayload[]
): RetargetingSegmentsSummary {
  const totalAudienceSize = payloads.reduce((sum, p) => sum + p.matchedCount, 0);
  const gdprExcludedCount = payloads.reduce((sum, p) => sum + p.excludedCount, 0);

  const segmentBreakdown: Record<AudienceSegmentType, number> = {
    high_intent_abandoners: 0,
    vip_repeat_collectors: 0,
    artwork_category_browsers: 0,
    dormant_buyers: 0,
  };

  const platformDistribution: Record<AdPlatform, number> = {
    meta: 0,
    google: 0,
    pinterest: 0,
    tiktok: 0,
  };

  for (const p of payloads) {
    segmentBreakdown[p.segmentType] = (segmentBreakdown[p.segmentType] || 0) + p.matchedCount;
    platformDistribution[p.platform] = (platformDistribution[p.platform] || 0) + p.matchedCount;
  }

  return {
    totalAudienceSize,
    segmentBreakdown,
    platformDistribution,
    gdprExcludedCount,
  };
}

/**
 * Schema snippet for Convex persistence.
 */
export function generateConvexRetargetingSegmentsSchema(): string {
  return `
export const retargeting_segments = defineTable({
  platform: v.string(),
  segmentType: v.string(),
  audienceName: v.string(),
  bidMultiplier: v.number(),
  matchedCount: v.number(),
  syncedAt: v.number(),
}).index("by_platform", ["platform"])
  .index("by_segment", ["segmentType"]);
`.trim();
}

/**
 * In-memory store for retargeting segments
 */
class RetargetingSegmentsStore {
  private payloads: RetargetingAudiencePayload[] = [];

  public recordPayload(payload: RetargetingAudiencePayload): void {
    this.payloads.push(payload);
  }

  public getPayloads(): RetargetingAudiencePayload[] {
    return [...this.payloads];
  }

  public clear(): void {
    this.payloads = [];
  }
}

export const retargetingSegmentsStore = new RetargetingSegmentsStore();
