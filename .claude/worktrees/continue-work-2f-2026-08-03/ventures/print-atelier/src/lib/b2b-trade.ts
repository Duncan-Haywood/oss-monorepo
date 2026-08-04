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
  const marginSafe = platformNetMarginPct >= 15;

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
