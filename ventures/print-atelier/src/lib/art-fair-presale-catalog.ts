export type VipTier = "PLATINUM" | "GOLD" | "SILVER" | "GENERAL";

export interface VipCollector {
  id: string;
  name: string;
  email: string;
  lifetimeSpendUsd: number;
  purchasedEditionsCount: number;
  preferredViewingDate?: string;
  requestedTimeSlot?: string;
}

export interface ArtFairCatalogItem {
  id: string;
  title: string;
  artistName: string;
  medium: string;
  editionTotal: number;
  presaleReservedCount: number;
  listPriceUsd: number;
  tierMinimumSpend?: number;
}

export interface PresaleOfferResult {
  collectorId: string;
  assignedTier: VipTier;
  discountPercentage: number;
  presalePriceUsd: number;
  presaleDepositRequiredUsd: number;
  reservationHoldHours: number;
  exclusivePasscode: string;
  assignedViewingSlot: string | null;
  isSlotConfirmed: boolean;
}

export interface PresaleCatalogSummary {
  fairName: string;
  totalCatalogItems: number;
  totalCatalogValueUsd: number;
  projectedPresaleRevenueUsd: number;
  projectedPresaleDepositRevenueUsd: number;
  projectedConversionRate: number;
  allocatedVipCount: Record<VipTier, number>;
}

export interface SlotAllocationResult {
  slotTime: string;
  assignedCollectors: { collectorId: string; tier: VipTier }[];
  isFull: boolean;
}

/**
 * Classifies a collector into a VIP tier based on historical spend and edition count.
 */
export function classifyVipTier(collector: VipCollector): VipTier {
  const { lifetimeSpendUsd, purchasedEditionsCount } = collector;
  if (lifetimeSpendUsd >= 50_000 || purchasedEditionsCount >= 15) {
    return "PLATINUM";
  }
  if (lifetimeSpendUsd >= 15_000 || purchasedEditionsCount >= 7) {
    return "GOLD";
  }
  if (lifetimeSpendUsd >= 5_000 || purchasedEditionsCount >= 3) {
    return "SILVER";
  }
  return "GENERAL";
}

/**
 * Calculates presale discount percentage for a VIP tier.
 */
export function getTierDiscount(tier: VipTier): number {
  switch (tier) {
    case "PLATINUM":
      return 15;
    case "GOLD":
      return 10;
    case "SILVER":
      return 5;
    case "GENERAL":
      return 0;
  }
}

/**
 * Calculates reservation hold hours for a VIP tier.
 */
export function getTierHoldHours(tier: VipTier): number {
  switch (tier) {
    case "PLATINUM":
      return 48;
    case "GOLD":
      return 24;
    case "SILVER":
      return 12;
    case "GENERAL":
      return 6;
  }
}

/**
 * Generates a deterministic exclusive passcode for catalog presale access.
 */
export function generateVipPasscode(collectorId: string, fairName: string): string {
  const cleanFair = fairName.replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, 4);
  const cleanId = collectorId.replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(-4);
  return `VIP-${cleanFair}-${cleanId}`;
}

/**
 * Generates a VIP presale offer for a specific item and collector.
 */
export function generatePresaleOffer(
  collector: VipCollector,
  item: ArtFairCatalogItem,
  requestedSlotAvailable = true
): PresaleOfferResult {
  const tier = classifyVipTier(collector);
  const discount = getTierDiscount(tier);
  const presalePriceUsd = Math.round(item.listPriceUsd * (1 - discount / 100) * 100) / 100;
  // Presale deposit is 20% of final discounted price
  const presaleDepositRequiredUsd = Math.round(presalePriceUsd * 0.2 * 100) / 100;
  const reservationHoldHours = getTierHoldHours(tier);
  const passcode = generateVipPasscode(collector.id, item.title);

  const assignedViewingSlot = collector.requestedTimeSlot ?? null;
  const isSlotConfirmed = Boolean(assignedViewingSlot && requestedSlotAvailable);

  return {
    collectorId: collector.id,
    assignedTier: tier,
    discountPercentage: discount,
    presalePriceUsd,
    presaleDepositRequiredUsd,
    reservationHoldHours,
    exclusivePasscode: passcode,
    assignedViewingSlot,
    isSlotConfirmed,
  };
}

/**
 * Calculates financial revenue projections for an art fair digital presale catalog.
 */
export function calculateCatalogPresaleProjection(
  fairName: string,
  items: ArtFairCatalogItem[],
  collectors: VipCollector[]
): PresaleCatalogSummary {
  const totalCatalogItems = items.reduce((acc, item) => acc + item.editionTotal, 0);
  const totalCatalogValueUsd = items.reduce((acc, item) => acc + item.listPriceUsd * item.editionTotal, 0);

  const allocatedVipCount: Record<VipTier, number> = {
    PLATINUM: 0,
    GOLD: 0,
    SILVER: 0,
    GENERAL: 0,
  };

  let totalWeightedConversion = 0;

  for (const collector of collectors) {
    const tier = classifyVipTier(collector);
    allocatedVipCount[tier] += 1;
    // Platinum converts at ~65%, Gold at ~45%, Silver at ~30%, General at ~15%
    switch (tier) {
      case "PLATINUM":
        totalWeightedConversion += 0.65;
        break;
      case "GOLD":
        totalWeightedConversion += 0.45;
        break;
      case "SILVER":
        totalWeightedConversion += 0.30;
        break;
      case "GENERAL":
        totalWeightedConversion += 0.15;
        break;
    }
  }

  const projectedConversionRate =
    collectors.length > 0 ? Math.round((totalWeightedConversion / collectors.length) * 10000) / 10000 : 0.25;

  const presaleReservableValueUsd = items.reduce(
    (acc, item) => acc + item.listPriceUsd * item.presaleReservedCount,
    0
  );

  const projectedPresaleRevenueUsd = Math.round(presaleReservableValueUsd * projectedConversionRate * 100) / 100;
  const projectedPresaleDepositRevenueUsd = Math.round(projectedPresaleRevenueUsd * 0.2 * 100) / 100;

  return {
    fairName,
    totalCatalogItems,
    totalCatalogValueUsd,
    projectedPresaleRevenueUsd,
    projectedPresaleDepositRevenueUsd,
    projectedConversionRate,
    allocatedVipCount,
  };
}

/**
 * Allocates private viewing appointment slots prioritized by VIP tier.
 */
export function scheduleViewingSlots(
  collectors: VipCollector[],
  availableSlots: string[],
  maxPerSlot: number
): SlotAllocationResult[] {
  const tierWeight: Record<VipTier, number> = {
    PLATINUM: 4,
    GOLD: 3,
    SILVER: 2,
    GENERAL: 1,
  };

  const sortedCollectors = [...collectors].sort((a, b) => {
    const tierA = classifyVipTier(a);
    const tierB = classifyVipTier(b);
    if (tierWeight[tierA] !== tierWeight[tierB]) {
      return tierWeight[tierB] - tierWeight[tierA];
    }
    return b.lifetimeSpendUsd - a.lifetimeSpendUsd;
  });

  const slots: Map<string, { collectorId: string; tier: VipTier }[]> = new Map();
  for (const slot of availableSlots) {
    slots.set(slot, []);
  }

  for (const collector of sortedCollectors) {
    const tier = classifyVipTier(collector);
    const requested = collector.requestedTimeSlot;

    if (requested && slots.has(requested) && (slots.get(requested)?.length ?? 0) < maxPerSlot) {
      slots.get(requested)?.push({ collectorId: collector.id, tier });
    } else {
      // Fallback to first available slot with space
      for (const [slotTime, assigned] of slots.entries()) {
        if (assigned.length < maxPerSlot) {
          assigned.push({ collectorId: collector.id, tier });
          break;
        }
      }
    }
  }

  return Array.from(slots.entries()).map(([slotTime, assignedCollectors]) => ({
    slotTime,
    assignedCollectors,
    isFull: assignedCollectors.length >= maxPerSlot,
  }));
}
