/**
 * Automated Gallery Art Collector VIP Membership Tier & Private View Engine
 *
 * Manages fine art collector spending tiers, preview access invitations, private exhibition RSVPs,
 * tier-based artwork discounts, and VIP concierge event perks.
 */

export type CollectorVipTier =
  | 'collector_bronze'
  | 'collector_silver'
  | 'collector_gold'
  | 'patron_platinum'
  | 'benefactor_diamond';

export interface CollectorProfile {
  collectorId: string;
  name: string;
  email: string;
  totalSpendUSD: number;
  totalPrintsAcquired: number;
  exhibitionPassesAttended: number;
  joinedAtTimestamp: number;
}

export interface PrivateViewAccessEvaluation {
  collectorId: string;
  tier: CollectorVipTier;
  accessGranted: boolean;
  maxGuestsAllowed: number;
  vipDiscountPercent: number;
  conciergePerks: string[];
  denialReason?: string;
}

export interface PrivateViewRSVP {
  rsvpId: string;
  exhibitionId: string;
  collectorId: string;
  guestCount: number;
  tierAtRSVP: CollectorVipTier;
  accessGranted: boolean;
  specialRequests?: string;
  rsvpTimestamp: number;
}

export interface CollectorVipSummary {
  totalRegisteredCollectors: number;
  tierBreakdown: Record<CollectorVipTier, number>;
  totalPrivateViewRSVPs: number;
  averageCollectorSpendUSD: number;
  totalVipDiscountVolumeUSD: number;
}

const TIER_HIERARCHY: Record<CollectorVipTier, number> = {
  collector_bronze: 1,
  collector_silver: 2,
  collector_gold: 3,
  patron_platinum: 4,
  benefactor_diamond: 5,
};

const collectorStore = new Map<string, CollectorProfile>();
const rsvpStore = new Map<string, PrivateViewRSVP>();

export function determineCollectorVipTier(totalSpendUSD: number, totalPrintsAcquired: number): CollectorVipTier {
  if (totalSpendUSD < 0 || totalPrintsAcquired < 0) {
    throw new Error('Total spend and prints acquired must be non-negative.');
  }

  if (totalSpendUSD >= 50000 || totalPrintsAcquired >= 25) {
    return 'benefactor_diamond';
  }
  if (totalSpendUSD >= 20000 || totalPrintsAcquired >= 10) {
    return 'patron_platinum';
  }
  if (totalSpendUSD >= 7500 || totalPrintsAcquired >= 5) {
    return 'collector_gold';
  }
  if (totalSpendUSD >= 2500 || totalPrintsAcquired >= 2) {
    return 'collector_silver';
  }
  return 'collector_bronze';
}

export function registerCollector(profile: CollectorProfile): { profile: CollectorProfile; tier: CollectorVipTier } {
  if (!profile.collectorId || !profile.email) {
    throw new Error('Collector ID and email are required.');
  }

  const tier = determineCollectorVipTier(profile.totalSpendUSD, profile.totalPrintsAcquired);
  collectorStore.set(profile.collectorId, profile);
  return { profile, tier };
}

export function getCollector(collectorId: string): CollectorProfile | undefined {
  return collectorStore.get(collectorId);
}

export function evaluatePrivateViewAccess(
  collectorId: string,
  minRequiredTier: CollectorVipTier = 'collector_bronze',
  requestedGuests: number = 1
): PrivateViewAccessEvaluation {
  const collector = collectorStore.get(collectorId);
  if (!collector) {
    throw new Error(`Collector ${collectorId} not found.`);
  }

  const tier = determineCollectorVipTier(collector.totalSpendUSD, collector.totalPrintsAcquired);
  const userTierLevel = TIER_HIERARCHY[tier];
  const requiredTierLevel = TIER_HIERARCHY[minRequiredTier];

  let maxGuestsAllowed = 1;
  let vipDiscountPercent = 5;
  const conciergePerks: string[] = ['Storefront Private Catalog Preview'];

  if (tier === 'collector_silver') {
    maxGuestsAllowed = 2;
    vipDiscountPercent = 10;
    conciergePerks.push('Free Standard Archival Packaging');
  } else if (tier === 'collector_gold') {
    maxGuestsAllowed = 4;
    vipDiscountPercent = 15;
    conciergePerks.push('Free Standard Archival Packaging', 'Priority Gallery Opening Passes');
  } else if (tier === 'patron_platinum') {
    maxGuestsAllowed = 6;
    vipDiscountPercent = 20;
    conciergePerks.push(
      'Free Standard Archival Packaging',
      'Priority Gallery Opening Passes',
      'Private Artist Q&A Reception',
      'Custom Framing Consultation Voucher'
    );
  } else if (tier === 'benefactor_diamond') {
    maxGuestsAllowed = 10;
    vipDiscountPercent = 25;
    conciergePerks.push(
      'Free Standard Archival Packaging',
      'Priority Gallery Opening Passes',
      'Private Artist Q&A Reception',
      'Custom Framing Consultation Voucher',
      'Private Curator Studio Tour',
      'Complimentary Champagne Reception'
    );
  }

  if (userTierLevel < requiredTierLevel) {
    return {
      collectorId,
      tier,
      accessGranted: false,
      maxGuestsAllowed,
      vipDiscountPercent,
      conciergePerks,
      denialReason: `Tier '${tier}' does not meet minimum required tier '${minRequiredTier}'.`,
    };
  }

  if (requestedGuests > maxGuestsAllowed) {
    return {
      collectorId,
      tier,
      accessGranted: false,
      maxGuestsAllowed,
      vipDiscountPercent,
      conciergePerks,
      denialReason: `Requested guest count (${requestedGuests}) exceeds maximum allowed guests (${maxGuestsAllowed}) for ${tier}.`,
    };
  }

  return {
    collectorId,
    tier,
    accessGranted: true,
    maxGuestsAllowed,
    vipDiscountPercent,
    conciergePerks,
  };
}

export function recordPrivateViewRSVP(
  exhibitionId: string,
  collectorId: string,
  guestCount: number,
  minRequiredTier: CollectorVipTier = 'collector_bronze',
  specialRequests?: string
): PrivateViewRSVP {
  const evalResult = evaluatePrivateViewAccess(collectorId, minRequiredTier, guestCount);
  const rsvpId = `rsvp_${exhibitionId}_${collectorId}_${Date.now()}`;

  const rsvp: PrivateViewRSVP = {
    rsvpId,
    exhibitionId,
    collectorId,
    guestCount,
    tierAtRSVP: evalResult.tier,
    accessGranted: evalResult.accessGranted,
    specialRequests,
    rsvpTimestamp: Date.now(),
  };

  rsvpStore.set(rsvpId, rsvp);
  return rsvp;
}

export function getCollectorVipSummary(): CollectorVipSummary {
  const collectors = Array.from(collectorStore.values());
  const rsvps = Array.from(rsvpStore.values());

  const tierBreakdown: Record<CollectorVipTier, number> = {
    collector_bronze: 0,
    collector_silver: 0,
    collector_gold: 0,
    patron_platinum: 0,
    benefactor_diamond: 0,
  };

  let totalSpendSum = 0;
  let totalDiscountVolume = 0;

  for (const col of collectors) {
    const tier = determineCollectorVipTier(col.totalSpendUSD, col.totalPrintsAcquired);
    tierBreakdown[tier] += 1;
    totalSpendSum += col.totalSpendUSD;

    const evalRes = evaluatePrivateViewAccess(col.collectorId);
    totalDiscountVolume += col.totalSpendUSD * (evalRes.vipDiscountPercent / 100);
  }

  const totalRegisteredCollectors = collectors.length;
  const averageCollectorSpendUSD = totalRegisteredCollectors > 0 ? totalSpendSum / totalRegisteredCollectors : 0;

  return {
    totalRegisteredCollectors,
    tierBreakdown,
    totalPrivateViewRSVPs: rsvps.length,
    averageCollectorSpendUSD: Number(averageCollectorSpendUSD.toFixed(2)),
    totalVipDiscountVolumeUSD: Number(totalDiscountVolume.toFixed(2)),
  };
}

export function resetCollectorVipStore(): void {
  collectorStore.clear();
  rsvpStore.clear();
}

export function generateConvexCollectorVipSchema(): string {
  return `
import { defineTable } from "convex/server";
import { v } from "convex/values";

export const collectorProfiles = defineTable({
  collectorId: v.string(),
  name: v.string(),
  email: v.string(),
  totalSpendUSD: v.number(),
  totalPrintsAcquired: v.number(),
  exhibitionPassesAttended: v.number(),
  joinedAtTimestamp: v.number(),
}).index("by_collectorId", ["collectorId"])
  .index("by_email", ["email"]);

export const privateViewRSVPs = defineTable({
  rsvpId: v.string(),
  exhibitionId: v.string(),
  collectorId: v.string(),
  guestCount: v.number(),
  tierAtRSVP: v.string(),
  accessGranted: v.boolean(),
  specialRequests: v.optional(v.string()),
  rsvpTimestamp: v.number(),
}).index("by_rsvpId", ["rsvpId"])
  .index("by_exhibitionId", ["exhibitionId"])
  .index("by_collectorId", ["collectorId"]);
`;
}
