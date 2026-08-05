export type B2BTier = 'member' | 'preferred' | 'vip' | 'executive';

export interface B2BTierDetails {
  tier: B2BTier;
  name: string;
  minAnnualSpend: number;
  baseDiscountPct: number;
  freeShippingThreshold: number;
  dedicatedRep: boolean;
}

export const B2B_TIERS: Record<B2BTier, B2BTierDetails> = {
  member: {
    tier: 'member',
    name: 'Trade Member',
    minAnnualSpend: 0,
    baseDiscountPct: 20,
    freeShippingThreshold: 500,
    dedicatedRep: false,
  },
  preferred: {
    tier: 'preferred',
    name: 'Preferred Designer',
    minAnnualSpend: 5000,
    baseDiscountPct: 25,
    freeShippingThreshold: 300,
    dedicatedRep: false,
  },
  vip: {
    tier: 'vip',
    name: 'VIP Studio',
    minAnnualSpend: 20000,
    baseDiscountPct: 30,
    freeShippingThreshold: 150,
    dedicatedRep: true,
  },
  executive: {
    tier: 'executive',
    name: 'Executive Commercial Partner',
    minAnnualSpend: 50000,
    baseDiscountPct: 35,
    freeShippingThreshold: 0,
    dedicatedRep: true,
  },
};

export interface B2BQuoteItem {
  sku: string;
  title: string;
  retailPrice: number;
  podCost: number;
  quantity: number;
}

export interface B2BQuoteRequest {
  annualSpendToDate: number;
  items: B2BQuoteItem[];
  shippingEst?: number;
  taxEst?: number;
}

/**
 * The floor the trade programme protects: platform net contribution margin,
 * after POD cost and after the artist's 30%, as a percentage of the discounted
 * subtotal. Below it a bulk order is being sold at a level that cannot carry
 * both the payout promise and the platform.
 *
 * Named `MIN_` deliberately: `scripts/ci/cap_ratchet.py` watches constants with
 * this prefix and fails a change that moves the floor down, so discounting past
 * the guardrail has to be an explicit, reviewed decision rather than a one-line
 * edit inside a commit about something else.
 */
export const MIN_PLATFORM_NET_MARGIN_PCT = 15;

export interface B2BQuoteResult {
  tier: B2BTierDetails;
  totalRetail: number;
  volumeBonusPct: number;
  effectiveDiscountPct: number;
  discountAmount: number;
  subtotalTrade: number;
  totalPodCost: number;
  artistPayoutTotal: number; // 30% net profit to artist
  platformNetMargin: number; // Platform revenue after POD & artist payout
  platformNetMarginPct: number;
  freeShippingEligible: boolean;
  finalShipping: number;
  finalTotal: number;
  marginSafe: boolean;
}

/**
 * Determine the tier based on historical or committed annual spend.
 */
export function getB2BTier(annualSpend: number): B2BTierDetails {
  if (annualSpend >= 50000) return B2B_TIERS.executive;
  if (annualSpend >= 20000) return B2B_TIERS.vip;
  if (annualSpend >= 5000) return B2B_TIERS.preferred;
  return B2B_TIERS.member;
}

/**
 * Calculate volume bonus percentage for large single orders.
 */
export function calculateVolumeBonusPct(totalQuantity: number, totalRetail: number): number {
  if (totalQuantity >= 50 || totalRetail >= 10000) return 5;
  if (totalQuantity >= 20 || totalRetail >= 5000) return 3;
  if (totalQuantity >= 10 || totalRetail >= 2500) return 1.5;
  return 0;
}

/**
 * Calculate B2B trade program quote, protecting 30% artist net profit payout.
 */
export function calculateB2BQuote(request: B2BQuoteRequest): B2BQuoteResult {
  const tier = getB2BTier(request.annualSpendToDate);
  
  const totalQuantity = request.items.reduce((sum, i) => sum + i.quantity, 0);
  const totalRetail = request.items.reduce((sum, i) => sum + (i.retailPrice * i.quantity), 0);
  const totalPodCost = request.items.reduce((sum, i) => sum + (i.podCost * i.quantity), 0);

  const volumeBonusPct = calculateVolumeBonusPct(totalQuantity, totalRetail);
  // Cap max discount at 40% to maintain positive unit economics
  const effectiveDiscountPct = Math.min(40, tier.baseDiscountPct + volumeBonusPct);

  const discountAmount = Math.round((totalRetail * (effectiveDiscountPct / 100)) * 100) / 100;
  const subtotalTrade = Math.max(0, totalRetail - discountAmount);

  // Net revenue available before artist split = subtotalTrade - totalPodCost
  const netProfitPool = Math.max(0, subtotalTrade - totalPodCost);
  // Artist receives 30% of net profit
  const artistPayoutTotal = Math.round((netProfitPool * 0.30) * 100) / 100;
  
  // Platform net profit = netProfitPool - artistPayoutTotal
  const platformNetMargin = Math.round((netProfitPool - artistPayoutTotal) * 100) / 100;
  const platformNetMarginPct = subtotalTrade > 0 ? Math.round((platformNetMargin / subtotalTrade) * 10000) / 100 : 0;

  const freeShippingEligible = subtotalTrade >= tier.freeShippingThreshold;
  const estShipping = request.shippingEst ?? 25.0;
  const finalShipping = freeShippingEligible ? 0 : estShipping;
  const finalTotal = Math.round((subtotalTrade + finalShipping + (request.taxEst ?? 0)) * 100) / 100;

  // Margin safety guardrail: net platform margin percentage must be >= 15%
  const marginSafe = platformNetMarginPct >= MIN_PLATFORM_NET_MARGIN_PCT;

  return {
    tier,
    totalRetail,
    volumeBonusPct,
    effectiveDiscountPct,
    discountAmount,
    subtotalTrade,
    totalPodCost,
    artistPayoutTotal,
    platformNetMargin,
    platformNetMarginPct,
    freeShippingEligible,
    finalShipping,
    finalTotal,
    marginSafe,
  };
}

/**
 * What the trade portal should tell a designer about this quote's guardrail.
 *
 * This exists because `marginSafe` was computed, unit-tested, returned — and
 * read by nothing. `src/app/b2b-portal/page.tsx` rendered a green shield
 * reading "Verified: Artist 30% net profit promise and platform unit economics
 * clear all profit guardrails" unconditionally, on a route with no
 * authentication and no demo badge. The one field that could have contradicted
 * it was discarded at the point of render, so the badge could not go red for
 * any input.
 *
 * With the seeded catalog — POD cost around a third of retail — no quantity or
 * spend a visitor can enter drives the margin under the floor, so the claim was
 * accidentally true rather than checked. That is the failure worth naming: the
 * badge was not wrong yet, and nothing about it would have started being right.
 * Real canvas POD costs at these price points run closer to half of retail, and
 * at a 40% trade discount that is the side of the floor this lands on.
 *
 * "Verified" is also more than the code does. This is an arithmetic check on
 * one quote, not an audit of the payout promise, so the wording says which.
 */
export function describeMarginGuardrail(quote: B2BQuoteResult): {
  safe: boolean;
  headline: string;
  detail: string;
} {
  if (quote.marginSafe) {
    return {
      safe: true,
      headline: "Checked on this quote",
      detail:
        `Platform net contribution margin is ${quote.platformNetMarginPct}%, at or above the ` +
        `${MIN_PLATFORM_NET_MARGIN_PCT}% floor, so the artist's 30% net profit share and the ` +
        `platform both clear on these figures.`,
    };
  }
  return {
    safe: false,
    headline: "Below the margin floor",
    detail:
      `Platform net contribution margin is ${quote.platformNetMarginPct}%, under the ` +
      `${MIN_PLATFORM_NET_MARGIN_PCT}% floor. At a ${quote.effectiveDiscountPct}% trade discount ` +
      `this order leaves the artist $${quote.artistPayoutTotal.toFixed(2)}. It needs a floor ` +
      `trade price or a smaller discount before it can be accepted.`,
  };
}
