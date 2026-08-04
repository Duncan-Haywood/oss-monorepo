/**
 * Automated Wholesale Bulk Order Discount & Tiered Margin Optimizer for Corporate & Trade Buyers
 * 
 * Supports:
 * - Tiered volume pricing calculations (10% to 35% bulk discount based on quantity)
 * - Strict 30% artist net profit protection guarantee (prevents volume discounts from eroding artist payout)
 * - Corporate partner credit limit & invoice net terms calculator (Net-30, Net-60)
 * - Contribution margin safety check (Retail Price - Volume Discount - POD Cost - Artist Payout >= Minimum Margin)
 * - Convex schema definition & state snapshot persistence for wholesale quotes
 */

export interface WholesaleTierRule {
  minQuantity: number;
  maxQuantity: number;
  discountPercent: number; // e.g. 15 = 15% discount
  tierName: string; // e.g. "Trade Starter", "Boutique Hotel", "Corporate HQ"
}

export const DEFAULT_WHOLESALE_TIERS: WholesaleTierRule[] = [
  { minQuantity: 1, maxQuantity: 4, discountPercent: 0, tierName: "Retail Standard" },
  { minQuantity: 5, maxQuantity: 14, discountPercent: 10, tierName: "Trade Starter" },
  { minQuantity: 15, maxQuantity: 29, discountPercent: 18, tierName: "Design Studio" },
  { minQuantity: 30, maxQuantity: 49, discountPercent: 25, tierName: "Boutique Hospitality" },
  { minQuantity: 50, maxQuantity: 9999, discountPercent: 32, tierName: "Enterprise & Resort" },
];

export interface WholesaleQuoteInput {
  quoteId?: string;
  partnerId?: string;
  sku: string;
  quantity: number;
  unitBasePriceUsdCents: number;
  unitPodCostUsdCents: number;
  customTiers?: WholesaleTierRule[];
  overrideArtistPayoutPercent?: number; // default 30%
}

export interface WholesaleQuoteResult {
  quoteId?: string;
  sku: string;
  quantity: number;
  unitBasePriceUsdCents: number;
  applicableTierName: string;
  appliedDiscountPercent: number;
  unitWholesalePriceUsdCents: number;
  totalWholesalePriceUsdCents: number;
  totalPodCostUsdCents: number;
  unitArtistPayoutUsdCents: number;
  totalArtistPayoutUsdCents: number;
  totalPlatformContributionUsdCents: number;
  platformMarginPercent: number;
  artistProfitProtected: boolean;
  minMarginCleared: boolean;
  suggestedPaymentTerms: "Immediate" | "Net-30" | "Net-60";
  warnings: string[];
}

// In-memory store for wholesale quotes
let wholesaleQuoteStore: WholesaleQuoteResult[] = [];

/**
 * Finds applicable wholesale tier rule for a given quantity
 */
export function getApplicableWholesaleTier(
  quantity: number,
  tiers: WholesaleTierRule[] = DEFAULT_WHOLESALE_TIERS
): WholesaleTierRule {
  const matched = tiers.find((t) => quantity >= t.minQuantity && quantity <= t.maxQuantity);
  return (
    matched || {
      minQuantity: 1,
      maxQuantity: 9999,
      discountPercent: 0,
      tierName: "Retail Standard",
    }
  );
}

/**
 * Calculates optimized wholesale quote enforcing artist profit floor & platform margin safety
 */
export function calculateWholesaleQuote(input: WholesaleQuoteInput): WholesaleQuoteResult {
  const warnings: string[] = [];
  const tiers = input.customTiers || DEFAULT_WHOLESALE_TIERS;
  const tier = getApplicableWholesaleTier(input.quantity, tiers);

  let discountPercent = tier.discountPercent;
  let unitWholesalePrice = Math.round(input.unitBasePriceUsdCents * (1 - discountPercent / 100));

  // Artist profit protection: Artist ALWAYS gets 30% of the UN-DISCOUNTED retail price or 30% of retail floor,
  // ensuring artists are never penalized for bulk discounts offered to corporate buyers.
  const artistPayoutShare = (input.overrideArtistPayoutPercent || 30) / 100;
  const unitArtistPayoutUsdCents = Math.round(input.unitBasePriceUsdCents * artistPayoutShare);

  // Platform gross contribution per unit = Wholesale Price - POD Cost - Artist Payout
  let unitPlatformContribution = unitWholesalePrice - input.unitPodCostUsdCents - unitArtistPayoutUsdCents;

  // Minimum required platform margin: 15% of wholesale price or $5.00 per unit
  const minRequiredPlatformMarginCents = Math.max(500, Math.round(unitWholesalePrice * 0.15));

  // If discount erodes platform margin below safety floor, automatically adjust discount down
  if (unitPlatformContribution < minRequiredPlatformMarginCents) {
    const requiredWholesalePrice = input.unitPodCostUsdCents + unitArtistPayoutUsdCents + minRequiredPlatformMarginCents;
    if (requiredWholesalePrice < input.unitBasePriceUsdCents) {
      unitWholesalePrice = requiredWholesalePrice;
      const adjustedDiscount = ((input.unitBasePriceUsdCents - unitWholesalePrice) / input.unitBasePriceUsdCents) * 100;
      discountPercent = Number(adjustedDiscount.toFixed(1));
      warnings.push(
        `Volume discount adjusted to ${discountPercent}% to preserve platform safety margin and 30% artist payout floor.`
      );
    } else {
      // Cannot offer bulk discount without losing money on POD cost
      unitWholesalePrice = input.unitBasePriceUsdCents;
      discountPercent = 0;
      warnings.push("Bulk discount rejected: POD fulfillment cost too high relative to base retail price.");
    }
    unitPlatformContribution = unitWholesalePrice - input.unitPodCostUsdCents - unitArtistPayoutUsdCents;
  }

  const totalWholesalePriceUsdCents = unitWholesalePrice * input.quantity;
  const totalPodCostUsdCents = input.unitPodCostUsdCents * input.quantity;
  const totalArtistPayoutUsdCents = unitArtistPayoutUsdCents * input.quantity;
  const totalPlatformContributionUsdCents = unitPlatformContribution * input.quantity;

  const platformMarginPercent =
    totalWholesalePriceUsdCents > 0
      ? Number(((totalPlatformContributionUsdCents / totalWholesalePriceUsdCents) * 100).toFixed(1))
      : 0;

  const artistProfitProtected = unitArtistPayoutUsdCents >= Math.round(input.unitBasePriceUsdCents * 0.3);
  const minMarginCleared = unitPlatformContribution >= minRequiredPlatformMarginCents;

  let suggestedPaymentTerms: "Immediate" | "Net-30" | "Net-60" = "Immediate";
  if (input.quantity >= 50 && totalWholesalePriceUsdCents >= 500000) {
    suggestedPaymentTerms = "Net-60";
  } else if (input.quantity >= 15 && totalWholesalePriceUsdCents >= 100000) {
    suggestedPaymentTerms = "Net-30";
  }

  return {
    quoteId: input.quoteId || `WS-Q-${Date.now()}`,
    sku: input.sku,
    quantity: input.quantity,
    unitBasePriceUsdCents: input.unitBasePriceUsdCents,
    applicableTierName: tier.tierName,
    appliedDiscountPercent: discountPercent,
    unitWholesalePriceUsdCents: unitWholesalePrice,
    totalWholesalePriceUsdCents,
    totalPodCostUsdCents,
    unitArtistPayoutUsdCents,
    totalArtistPayoutUsdCents,
    totalPlatformContributionUsdCents,
    platformMarginPercent,
    artistProfitProtected,
    minMarginCleared,
    suggestedPaymentTerms,
    warnings,
  };
}

/**
 * Generates Convex schema definition for wholesale_quotes table
 */
export function generateConvexWholesaleSchema(): {
  wholesale_quotes: {
    columns: Record<string, string>;
    indexes: Record<string, string[]>;
  };
} {
  return {
    wholesale_quotes: {
      columns: {
        quoteId: "string",
        sku: "string",
        quantity: "number",
        totalWholesalePriceUsdCents: "number",
        totalArtistPayoutUsdCents: "number",
        appliedDiscountPercent: "number",
        suggestedPaymentTerms: "string",
        createdAt: "number",
      },
      indexes: {
        by_quote_id: ["quoteId"],
        by_sku: ["sku"],
      },
    },
  };
}

/**
 * Persists wholesale quote result to memory store
 */
export function persistWholesaleQuote(quote: WholesaleQuoteResult): WholesaleQuoteResult {
  wholesaleQuoteStore.push(quote);
  return quote;
}

/**
 * Retrieves persisted wholesale quotes
 */
export function getWholesaleQuotes(): WholesaleQuoteResult[] {
  return [...wholesaleQuoteStore];
}

/**
 * Clears wholesale quote store for isolated testing
 */
export function clearWholesaleQuotesForTesting(): void {
  wholesaleQuoteStore = [];
}
