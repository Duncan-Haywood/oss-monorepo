/**
 * Seasonal Print Drop Campaign & SMS Subscriber VIP Presale Manager
 * 
 * Orchestrates limited-edition seasonal artwork drops, manages tiered early presale access windows
 * for SMS subscribers and VIP collectors, enforces reserved edition allocations, and optimizes sell-out velocity.
 */

export type DropStatus =
  | "draft"
  | "presale_active"
  | "public_active"
  | "sold_out"
  | "archived";

export type VipTier = "sms_subscriber" | "collector_club" | "patron_vip";

export interface SeasonalDropPayload {
  dropId: string;
  campaignName: string;
  totalReservedEditions: number;
  claimedEditionsCount: number;
  presaleStartTimestamp: number;
  publicStartTimestamp: number;
  status: DropStatus;
}

export interface PresaleAccessResult {
  dropId: string;
  campaignName: string;
  isAccessGranted: boolean;
  vipTier?: VipTier;
  earlyAccessWindowHours: number;
  remainingReservedEditions: number;
  priceDiscountPercent: number;
  status: DropStatus;
  notes: string[];
}

export interface SeasonalDropSummary {
  totalDrops: number;
  totalReservedEditions: number;
  totalClaimedEditions: number;
  overallSelloutRatePercent: number;
  activePresaleCount: number;
  publicActiveCount: number;
}

const TIER_PRIVILEGES: Record<VipTier, { windowHours: number; discountPercent: number }> = {
  patron_vip: { windowHours: 24, discountPercent: 15 },
  collector_club: { windowHours: 12, discountPercent: 10 },
  sms_subscriber: { windowHours: 2, discountPercent: 5 },
};

/**
 * Evaluates VIP presale access privileges and edition availability for a seasonal print drop.
 */
export function evaluateVipPresaleAccess(
  drop: SeasonalDropPayload,
  userVipTier?: VipTier,
  nowTimestamp: number = Date.now()
): PresaleAccessResult {
  const notes: string[] = [];

  const remainingReservedEditions = Math.max(0, drop.totalReservedEditions - drop.claimedEditionsCount);

  // Sold out check
  if (remainingReservedEditions === 0 || drop.status === "sold_out") {
    notes.push("Seasonal drop is completely sold out.");
    return {
      dropId: drop.dropId,
      campaignName: drop.campaignName,
      isAccessGranted: false,
      vipTier: userVipTier,
      earlyAccessWindowHours: 0,
      remainingReservedEditions: 0,
      priceDiscountPercent: 0,
      status: "sold_out",
      notes,
    };
  }

  // Public sale is open to all
  if (nowTimestamp >= drop.publicStartTimestamp || drop.status === "public_active") {
    notes.push("Public drop is active. Standard checkout open to all collectors.");
    return {
      dropId: drop.dropId,
      campaignName: drop.campaignName,
      isAccessGranted: true,
      vipTier: userVipTier,
      earlyAccessWindowHours: 0,
      remainingReservedEditions,
      priceDiscountPercent: userVipTier ? TIER_PRIVILEGES[userVipTier].discountPercent : 0,
      status: "public_active",
      notes,
    };
  }

  // Presale evaluation
  if (!userVipTier) {
    notes.push("Presale access requires SMS subscription or VIP status. Sign up for early access.");
    return {
      dropId: drop.dropId,
      campaignName: drop.campaignName,
      isAccessGranted: false,
      earlyAccessWindowHours: 0,
      remainingReservedEditions,
      priceDiscountPercent: 0,
      status: drop.status,
      notes,
    };
  }

  const privileges = TIER_PRIVILEGES[userVipTier];
  const userWindowStart = drop.publicStartTimestamp - privileges.windowHours * 3600 * 1000;

  if (nowTimestamp >= userWindowStart) {
    notes.push(
      `Exclusive presale access granted for ${userVipTier.replace("_", " ").toUpperCase()} (${privileges.windowHours}h window).`
    );
    return {
      dropId: drop.dropId,
      campaignName: drop.campaignName,
      isAccessGranted: true,
      vipTier: userVipTier,
      earlyAccessWindowHours: privileges.windowHours,
      remainingReservedEditions,
      priceDiscountPercent: privileges.discountPercent,
      status: "presale_active",
      notes,
    };
  }

  notes.push(
    `Presale window for ${userVipTier.replace("_", " ").toUpperCase()} opens in ${Math.ceil(
      (userWindowStart - nowTimestamp) / (3600 * 1000)
    )} hours.`
  );
  return {
    dropId: drop.dropId,
    campaignName: drop.campaignName,
    isAccessGranted: false,
    vipTier: userVipTier,
    earlyAccessWindowHours: privileges.windowHours,
    remainingReservedEditions,
    priceDiscountPercent: privileges.discountPercent,
    status: drop.status,
    notes,
  };
}

/**
 * Aggregates performance metrics across seasonal print drops.
 */
export function summarizeSeasonalDrops(drops: SeasonalDropPayload[]): SeasonalDropSummary {
  const totalDrops = drops.length;
  if (totalDrops === 0) {
    return {
      totalDrops: 0,
      totalReservedEditions: 0,
      totalClaimedEditions: 0,
      overallSelloutRatePercent: 0,
      activePresaleCount: 0,
      publicActiveCount: 0,
    };
  }

  const totalReservedEditions = drops.reduce((sum, d) => sum + d.totalReservedEditions, 0);
  const totalClaimedEditions = drops.reduce((sum, d) => sum + d.claimedEditionsCount, 0);
  const activePresaleCount = drops.filter((d) => d.status === "presale_active").length;
  const publicActiveCount = drops.filter((d) => d.status === "public_active").length;

  return {
    totalDrops,
    totalReservedEditions,
    totalClaimedEditions,
    overallSelloutRatePercent:
      totalReservedEditions > 0 ? Math.round((totalClaimedEditions / totalReservedEditions) * 10000) / 100 : 0,
    activePresaleCount,
    publicActiveCount,
  };
}

/**
 * Generates Convex Schema snippet for seasonal drops.
 */
export function generateConvexSeasonalDropSchema(): string {
  return `
export const seasonal_drops = defineTable({
  dropId: v.string(),
  campaignName: v.string(),
  totalReservedEditions: v.number(),
  claimedEditionsCount: v.number(),
  presaleStartTimestamp: v.number(),
  publicStartTimestamp: v.number(),
  status: v.string(),
  createdAt: v.number(),
}).index("by_status", ["status"])
  .index("by_campaign", ["campaignName"]);
`.trim();
}

/**
 * In-memory store for seasonal print drops.
 */
class SeasonalDropStore {
  private drops: Map<string, SeasonalDropPayload> = new Map();

  public registerDrop(drop: SeasonalDropPayload): void {
    this.drops.set(drop.dropId, drop);
  }

  public getDrop(dropId: string): SeasonalDropPayload | undefined {
    return this.drops.get(dropId);
  }

  public clear(): void {
    this.drops.clear();
  }
}

export const seasonalDropStore = new SeasonalDropStore();
