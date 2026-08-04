/**
 * Creator Affiliate Attribution Tier & Commission Payout Threshold Manager
 * 
 * Manages performance-based creator commission tiers (Bronze, Silver, Gold, Diamond),
 * calculates dynamic commission rates, enforces minimum payout threshold safety ($50 floor),
 * and verifies tax document readiness before approving automated payouts.
 */

export type CreatorTier = "bronze" | "silver" | "gold" | "diamond";

export type PayoutStatus =
  | "below_threshold"
  | "payout_ready"
  | "tax_form_missing"
  | "payout_held";

export interface CreatorAffiliatePayload {
  creatorId: string;
  creatorHandle: string;
  totalAttributedSalesCount: number;
  totalAttributedGmvCents: number;
  accruedCommissionCents: number;
  minimumPayoutThresholdCents?: number; // Defaults to 5000 cents ($50)
  taxFormVerified: boolean;
  holdPayout?: boolean;
}

export interface CreatorPayoutEvaluation {
  creatorId: string;
  creatorHandle: string;
  currentTier: CreatorTier;
  commissionRatePercent: number;
  accruedCommissionCents: number;
  minimumPayoutThresholdCents: number;
  payoutStatus: PayoutStatus;
  eligiblePayoutAmountCents: number;
  nextTierTargetGmvCents: number;
  gmvNeededForNextTierCents: number;
  notes: string[];
}

export interface CreatorAffiliateSummary {
  totalCreators: number;
  totalAttributedGmvCents: number;
  totalAccruedCommissionsCents: number;
  totalReadyForPayoutCents: number;
  tierBreakdown: Record<CreatorTier, number>;
  payoutStatusBreakdown: Record<PayoutStatus, number>;
}

const DEFAULT_MINIMUM_PAYOUT_THRESHOLD_CENTS = 5000; // $50.00

/**
 * Determines creator commission tier based on total GMV and sales volume.
 */
export function calculateCreatorTier(totalGmvCents: number, salesCount: number): {
  tier: CreatorTier;
  ratePercent: number;
  nextTierGmvTargetCents: number;
} {
  if (totalGmvCents >= 2500000 || salesCount >= 250) {
    // $25,000 GMV or 250 sales
    return { tier: "diamond", ratePercent: 20, nextTierGmvTargetCents: 2500000 };
  }
  if (totalGmvCents >= 500000 || salesCount >= 50) {
    // $5,000 GMV or 50 sales
    return { tier: "gold", ratePercent: 15, nextTierGmvTargetCents: 2500000 };
  }
  if (totalGmvCents >= 100000 || salesCount >= 10) {
    // $1,000 GMV or 10 sales
    return { tier: "silver", ratePercent: 12, nextTierGmvTargetCents: 500000 };
  }
  return { tier: "bronze", ratePercent: 10, nextTierGmvTargetCents: 100000 };
}

/**
 * Evaluates creator commission payout eligibility and progression status.
 */
export function evaluateCreatorPayout(payload: CreatorAffiliatePayload): CreatorPayoutEvaluation {
  const notes: string[] = [];
  const thresholdCents = payload.minimumPayoutThresholdCents ?? DEFAULT_MINIMUM_PAYOUT_THRESHOLD_CENTS;
  const { tier, ratePercent, nextTierGmvTargetCents } = calculateCreatorTier(
    payload.totalAttributedGmvCents,
    payload.totalAttributedSalesCount
  );

  const gmvNeededForNextTierCents = Math.max(0, nextTierGmvTargetCents - payload.totalAttributedGmvCents);

  let payoutStatus: PayoutStatus = "below_threshold";
  let eligiblePayoutAmountCents = 0;

  if (payload.holdPayout) {
    payoutStatus = "payout_held";
    notes.push("Payout manually held by operations.");
  } else if (!payload.taxFormVerified) {
    payoutStatus = "tax_form_missing";
    notes.push("Payout held until W-9 / W-8BEN tax form is verified.");
  } else if (payload.accruedCommissionCents < thresholdCents) {
    payoutStatus = "below_threshold";
    notes.push(
      `Accrued balance ($${(payload.accruedCommissionCents / 100).toFixed(2)}) below payout threshold ($${(
        thresholdCents / 100
      ).toFixed(2)}).`
    );
  } else {
    payoutStatus = "payout_ready";
    eligiblePayoutAmountCents = payload.accruedCommissionCents;
    notes.push(`Payout approved for $${(eligiblePayoutAmountCents / 100).toFixed(2)} on ${tier.toUpperCase()} tier.`);
  }

  return {
    creatorId: payload.creatorId,
    creatorHandle: payload.creatorHandle,
    currentTier: tier,
    commissionRatePercent: ratePercent,
    accruedCommissionCents: payload.accruedCommissionCents,
    minimumPayoutThresholdCents: thresholdCents,
    payoutStatus,
    eligiblePayoutAmountCents,
    nextTierTargetGmvCents: nextTierGmvTargetCents,
    gmvNeededForNextTierCents,
    notes,
  };
}

/**
 * Summarizes affiliate performance and pending payout obligations.
 */
export function summarizeCreatorAffiliates(payloads: CreatorAffiliatePayload[]): CreatorAffiliateSummary {
  const totalCreators = payloads.length;
  if (totalCreators === 0) {
    return {
      totalCreators: 0,
      totalAttributedGmvCents: 0,
      totalAccruedCommissionsCents: 0,
      totalReadyForPayoutCents: 0,
      tierBreakdown: { bronze: 0, silver: 0, gold: 0, diamond: 0 },
      payoutStatusBreakdown: { below_threshold: 0, payout_ready: 0, tax_form_missing: 0, payout_held: 0 },
    };
  }

  const totalAttributedGmvCents = payloads.reduce((sum, c) => sum + c.totalAttributedGmvCents, 0);
  const totalAccruedCommissionsCents = payloads.reduce((sum, c) => sum + c.accruedCommissionCents, 0);

  const tierBreakdown: Record<CreatorTier, number> = { bronze: 0, silver: 0, gold: 0, diamond: 0 };
  const payoutStatusBreakdown: Record<PayoutStatus, number> = {
    below_threshold: 0,
    payout_ready: 0,
    tax_form_missing: 0,
    payout_held: 0,
  };

  let totalReadyForPayoutCents = 0;

  for (const c of payloads) {
    const evalResult = evaluateCreatorPayout(c);
    tierBreakdown[evalResult.currentTier] = (tierBreakdown[evalResult.currentTier] || 0) + 1;
    payoutStatusBreakdown[evalResult.payoutStatus] = (payoutStatusBreakdown[evalResult.payoutStatus] || 0) + 1;
    totalReadyForPayoutCents += evalResult.eligiblePayoutAmountCents;
  }

  return {
    totalCreators,
    totalAttributedGmvCents,
    totalAccruedCommissionsCents,
    totalReadyForPayoutCents,
    tierBreakdown,
    payoutStatusBreakdown,
  };
}

/**
 * Generates Convex Schema snippet for creator affiliate tracking.
 */
export function generateConvexCreatorAffiliateSchema(): string {
  return `
export const creator_affiliates = defineTable({
  creatorId: v.string(),
  creatorHandle: v.string(),
  currentTier: v.string(),
  totalAttributedGmvCents: v.number(),
  accruedCommissionCents: v.number(),
  taxFormVerified: v.boolean(),
  status: v.string(),
  updatedAt: v.number(),
}).index("by_handle", ["creatorHandle"])
  .index("by_tier", ["currentTier"]);
`.trim();
}

/**
 * In-memory store for creator affiliate payloads
 */
class CreatorAffiliateStore {
  private creators: Map<string, CreatorAffiliatePayload> = new Map();

  public registerCreator(creator: CreatorAffiliatePayload): void {
    this.creators.set(creator.creatorId, creator);
  }

  public getCreator(creatorId: string): CreatorAffiliatePayload | undefined {
    return this.creators.get(creatorId);
  }

  public clear(): void {
    this.creators.clear();
  }
}

export const creatorAffiliateStore = new CreatorAffiliateStore();
