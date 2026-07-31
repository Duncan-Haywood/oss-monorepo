export type B2BTradeTierName = "standard" | "silver" | "gold" | "platinum";

export type B2BTradeTier = {
  name: B2BTradeTierName;
  displayName: string;
  minAnnualSpendUsd: number;
  discountPct: number;
  minimumOrderQuantity: number;
  description: string;
};

export const B2B_TRADE_TIERS: Record<B2BTradeTierName, B2BTradeTier> = {
  standard: {
    name: "standard",
    displayName: "Standard Trade",
    minAnnualSpendUsd: 0,
    discountPct: 20,
    minimumOrderQuantity: 1,
    description: "20% trade discount for verified interior designers and architects.",
  },
  silver: {
    name: "silver",
    displayName: "Silver Partner",
    minAnnualSpendUsd: 5000,
    discountPct: 28,
    minimumOrderQuantity: 3,
    description: "28% trade discount for design studios with $5k+ annual purchasing.",
  },
  gold: {
    name: "gold",
    displayName: "Gold Preferred",
    minAnnualSpendUsd: 20000,
    discountPct: 35,
    minimumOrderQuantity: 5,
    description: "35% trade discount for hospitality and commercial interior buyers ($20k+ annual).",
  },
  platinum: {
    name: "platinum",
    displayName: "Platinum Key Account",
    minAnnualSpendUsd: 50000,
    discountPct: 42,
    minimumOrderQuantity: 10,
    description: "42% trade discount for corporate enterprise and hotel group master accounts ($50k+ annual).",
  },
};

export type B2BQuoteRequest = {
  quantity: number;
  unitRetailUsd: number;
  podCostPerUnitUsd?: number;
  annualSpendUsd?: number;
  tierOverride?: B2BTradeTierName;
  clientName?: string;
  projectName?: string;
};

export type B2BTradeQuote = {
  quoteId: string;
  createdAt: string;
  expiresAt: string;
  clientName: string;
  projectName: string;
  tier: B2BTradeTier;
  quantity: number;
  unitRetailUsd: number;
  unitTradePriceUsd: number;
  totalRetailUsd: number;
  totalTradePriceUsd: number;
  totalSavingsUsd: number;
  effectiveDiscountPct: number;
  podCostTotalUsd: number;
  artistPayoutTotalUsd: number;
  netVentureMarginUsd: number;
  netVentureMarginPct: number;
  payoutSafe: boolean;
  guardrailWarning?: string;
};

export function resolveB2BTradeTier(annualSpendUsd = 0, overrideTier?: B2BTradeTierName): B2BTradeTier {
  if (overrideTier && B2B_TRADE_TIERS[overrideTier]) {
    return B2B_TRADE_TIERS[overrideTier];
  }
  if (annualSpendUsd >= 50000) return B2B_TRADE_TIERS.platinum;
  if (annualSpendUsd >= 20000) return B2B_TRADE_TIERS.gold;
  if (annualSpendUsd >= 5000) return B2B_TRADE_TIERS.silver;
  return B2B_TRADE_TIERS.standard;
}

export function generateB2BQuoteId(): string {
  return `q_b2b_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

export function calculateB2BTradeQuote(request: B2BQuoteRequest): B2BTradeQuote {
  const quantity = Math.max(1, Math.floor(request.quantity || 1));
  const unitRetail = Math.max(0, request.unitRetailUsd || 0);
  const podCostUnit = request.podCostPerUnitUsd ?? 22.0; // Benchmark POD print cost
  const tier = resolveB2BTradeTier(request.annualSpendUsd ?? 0, request.tierOverride);

  const unitTradePrice = Math.round(unitRetail * (1 - tier.discountPct / 100) * 100) / 100;
  const totalRetail = Math.round(unitRetail * quantity * 100) / 100;
  const totalTradePrice = Math.round(unitTradePrice * quantity * 100) / 100;
  const totalSavings = Math.round((totalRetail - totalTradePrice) * 100) / 100;

  const podCostTotal = Math.round(podCostUnit * quantity * 100) / 100;
  const grossMargin = totalTradePrice - podCostTotal;

  // Artist gets 30% of net profit pool (gross margin after POD)
  const artistPayoutTotal = grossMargin > 0 ? Math.round(grossMargin * 0.3 * 100) / 100 : 0;
  const netVentureMargin = Math.round((grossMargin - artistPayoutTotal) * 100) / 100;
  const netVentureMarginPct = totalTradePrice > 0 ? Math.round((netVentureMargin / totalTradePrice) * 10000) / 100 : 0;

  const payoutSafe = grossMargin > 0 && netVentureMargin > 0;
  let guardrailWarning: string | undefined;

  if (!payoutSafe) {
    guardrailWarning = `Trade discount (${tier.discountPct}%) exceeds profitable margin for unit retail $${unitRetail} and POD cost $${podCostUnit}. Floor trade price required to protect artist payout.`;
  } else if (quantity < tier.minimumOrderQuantity) {
    guardrailWarning = `Quantity ${quantity} is below tier minimum (${tier.minimumOrderQuantity} units). Standard single-item trade rate applied.`;
  }

  const now = new Date();
  const expires = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  return {
    quoteId: generateB2BQuoteId(),
    createdAt: now.toISOString(),
    expiresAt: expires.toISOString(),
    clientName: request.clientName || "Interior Design Partner",
    projectName: request.projectName || "Commercial Art Package",
    tier,
    quantity,
    unitRetailUsd: unitRetail,
    unitTradePriceUsd: unitTradePrice,
    totalRetailUsd: totalRetail,
    totalTradePriceUsd: totalTradePrice,
    totalSavingsUsd: totalSavings,
    effectiveDiscountPct: tier.discountPct,
    podCostTotalUsd: podCostTotal,
    artistPayoutTotalUsd: artistPayoutTotal,
    netVentureMarginUsd: netVentureMargin,
    netVentureMarginPct,
    payoutSafe,
    guardrailWarning,
  };
}
