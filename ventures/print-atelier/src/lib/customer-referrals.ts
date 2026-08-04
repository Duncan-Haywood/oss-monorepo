/**
 * Automated Customer Referral Reward & Viral Loop Attribution Engine
 * 
 * Drives organic acquisition and lowers CAC by incentivizing art buyers and artists to invite friends.
 * 
 * Features:
 * - Deterministic & random referral code generation per advocate
 * - Dual-sided reward structure (Advocate reward credit + Referee discount)
 * - Referral attribution & conversion tracking
 * - Viral K-Factor calculation: K = (invites per customer) * (conversion rate)
 * - CAC reduction & viral payback velocity metrics
 * - Convex schema & state persistence for referral ledger
 */

export interface ReferralProgramConfig {
  advocateRewardUsdCents: number; // e.g., $15.00 = 1500 cents credit on next purchase
  refereeDiscountPercent: number; // e.g., 15% discount off first order
  minOrderValueUsdCents: number;  // e.g., $40.00 = 4000 cents minimum order to redeem
  expiryDays: number;            // e.g., 60 days code validity
}

export const DEFAULT_REFERRAL_CONFIG: ReferralProgramConfig = {
  advocateRewardUsdCents: 1500, // $15
  refereeDiscountPercent: 15,   // 15% off
  minOrderValueUsdCents: 4000,  // $40 min order
  expiryDays: 60,
};

export type ReferralStatus = "pending" | "converted" | "rewarded" | "expired";

export interface CustomerReferralRecord {
  referralCode: string;
  advocateId: string;
  advocateEmail?: string;
  refereeEmail?: string;
  refereeOrderId?: string;
  status: ReferralStatus;
  invitesSent: number;
  advocateRewardEarnedUsdCents: number;
  refereeDiscountAppliedUsdCents: number;
  createdAt: number;
  convertedAt?: number;
  expiresAt: number;
}

export interface ViralLoopMetrics {
  totalAdvocates: number;
  totalInvitesSent: number;
  totalConversions: number;
  kFactor: number; // K = (totalInvitesSent / totalAdvocates) * (totalConversions / totalInvitesSent)
  viralConversionRatePercent: number;
  totalAdvocateRewardsEarnedUsdCents: number;
  totalRefereeDiscountsGivenUsdCents: number;
  estimatedCacSavingsUsdCents: number; // baseline CAC * conversions - total rewards given
}

// In-memory store for testing & persistence
let referralStore: CustomerReferralRecord[] = [];

/**
 * Generates a unique referral code for an advocate (e.g. "DUNCAN-REF-7A9B")
 */
export function generateReferralCode(advocateId: string, prefix = "ART"): string {
  const cleanId = advocateId.replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, 6);
  const randomSuffix = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `${prefix}-${cleanId || "USER"}-${randomSuffix}`;
}

/**
 * Creates a new customer referral tracking entry for an advocate
 */
export function createCustomerReferral(
  advocateId: string,
  advocateEmail?: string,
  config: ReferralProgramConfig = DEFAULT_REFERRAL_CONFIG
): CustomerReferralRecord {
  const now = Date.now();
  const expiresAt = now + config.expiryDays * 24 * 60 * 60 * 1000;
  const referralCode = generateReferralCode(advocateId);

  const record: CustomerReferralRecord = {
    referralCode,
    advocateId,
    advocateEmail,
    status: "pending",
    invitesSent: 1,
    advocateRewardEarnedUsdCents: 0,
    refereeDiscountAppliedUsdCents: 0,
    createdAt: now,
    expiresAt,
  };

  referralStore.push(record);
  return record;
}

/**
 * Validates a referral code for a referee purchase and calculates discount
 */
export function evaluateReferralCode(
  referralCode: string,
  orderValueUsdCents: number,
  config: ReferralProgramConfig = DEFAULT_REFERRAL_CONFIG
): {
  valid: boolean;
  discountUsdCents: number;
  finalOrderValueUsdCents: number;
  reason?: string;
  record?: CustomerReferralRecord;
} {
  const record = referralStore.find((r) => r.referralCode === referralCode);
  if (!record) {
    return {
      valid: false,
      discountUsdCents: 0,
      finalOrderValueUsdCents: orderValueUsdCents,
      reason: "Referral code not found",
    };
  }

  if (record.status === "expired" || Date.now() > record.expiresAt) {
    record.status = "expired";
    return {
      valid: false,
      discountUsdCents: 0,
      finalOrderValueUsdCents: orderValueUsdCents,
      reason: "Referral code has expired",
      record,
    };
  }

  if (orderValueUsdCents < config.minOrderValueUsdCents) {
    return {
      valid: false,
      discountUsdCents: 0,
      finalOrderValueUsdCents: orderValueUsdCents,
      reason: `Order value must be at least $${(config.minOrderValueUsdCents / 100).toFixed(2)}`,
      record,
    };
  }

  const discountUsdCents = Math.round(orderValueUsdCents * (config.refereeDiscountPercent / 100));
  const finalOrderValueUsdCents = Math.max(0, orderValueUsdCents - discountUsdCents);

  return {
    valid: true,
    discountUsdCents,
    finalOrderValueUsdCents,
    record,
  };
}

/**
 * Converts a referral upon successful referee checkout, rewarding advocate & referee
 */
export function convertReferralOrder(
  referralCode: string,
  refereeEmail: string,
  refereeOrderId: string,
  orderValueUsdCents: number,
  config: ReferralProgramConfig = DEFAULT_REFERRAL_CONFIG
): CustomerReferralRecord {
  const evaluation = evaluateReferralCode(referralCode, orderValueUsdCents, config);
  if (!evaluation.valid || !evaluation.record) {
    throw new Error(evaluation.reason || "Invalid referral code conversion attempt");
  }

  const record = evaluation.record;
  record.status = "converted";
  record.refereeEmail = refereeEmail;
  record.refereeOrderId = refereeOrderId;
  record.convertedAt = Date.now();
  record.refereeDiscountAppliedUsdCents = evaluation.discountUsdCents;
  record.advocateRewardEarnedUsdCents = config.advocateRewardUsdCents;

  return record;
}

/**
 * Calculates aggregate viral loop metrics and K-Factor
 */
export function calculateViralLoopMetrics(
  records: CustomerReferralRecord[] = referralStore,
  baselineCacUsdCents = 4500 // $45.00 default paid CAC benchmark
): ViralLoopMetrics {
  if (records.length === 0) {
    return {
      totalAdvocates: 0,
      totalInvitesSent: 0,
      totalConversions: 0,
      kFactor: 0,
      viralConversionRatePercent: 0,
      totalAdvocateRewardsEarnedUsdCents: 0,
      totalRefereeDiscountsGivenUsdCents: 0,
      estimatedCacSavingsUsdCents: 0,
    };
  }

  const advocateIds = new Set(records.map((r) => r.advocateId));
  const totalAdvocates = advocateIds.size;
  const totalInvitesSent = records.reduce((acc, r) => acc + r.invitesSent, 0);
  const convertedRecords = records.filter((r) => r.status === "converted" || r.status === "rewarded");
  const totalConversions = convertedRecords.length;

  const invitesPerAdvocate = totalAdvocates > 0 ? totalInvitesSent / totalAdvocates : 0;
  const conversionRate = totalInvitesSent > 0 ? totalConversions / totalInvitesSent : 0;
  const kFactor = Number((invitesPerAdvocate * conversionRate).toFixed(2));
  const viralConversionRatePercent = Number((conversionRate * 100).toFixed(1));

  const totalAdvocateRewardsEarnedUsdCents = records.reduce(
    (acc, r) => acc + r.advocateRewardEarnedUsdCents,
    0
  );
  const totalRefereeDiscountsGivenUsdCents = records.reduce(
    (acc, r) => acc + r.refereeDiscountAppliedUsdCents,
    0
  );

  const totalIncentiveCost = totalAdvocateRewardsEarnedUsdCents + totalRefereeDiscountsGivenUsdCents;
  const grossCacReplaced = totalConversions * baselineCacUsdCents;
  const estimatedCacSavingsUsdCents = Math.max(0, grossCacReplaced - totalIncentiveCost);

  return {
    totalAdvocates,
    totalInvitesSent,
    totalConversions,
    kFactor,
    viralConversionRatePercent,
    totalAdvocateRewardsEarnedUsdCents,
    totalRefereeDiscountsGivenUsdCents,
    estimatedCacSavingsUsdCents,
  };
}

/**
 * Convex schema definition for customer_referrals table
 */
export function generateConvexReferralsSchema(): {
  customer_referrals: {
    columns: Record<string, string>;
    indexes: Record<string, string[]>;
  };
} {
  return {
    customer_referrals: {
      columns: {
        referralCode: "string",
        advocateId: "string",
        advocateEmail: "string?",
        refereeEmail: "string?",
        refereeOrderId: "string?",
        status: "string",
        invitesSent: "number",
        advocateRewardEarnedUsdCents: "number",
        refereeDiscountAppliedUsdCents: "number",
        createdAt: "number",
        convertedAt: "number?",
        expiresAt: "number",
      },
      indexes: {
        by_code: ["referralCode"],
        by_advocate: ["advocateId"],
        by_status: ["status"],
      },
    },
  };
}

/**
 * Retrieves stored referral records
 */
export function getReferralRecords(): CustomerReferralRecord[] {
  return [...referralStore];
}

/**
 * Clears referral store for isolated testing
 */
export function clearReferralStoreForTesting(): void {
  referralStore = [];
}
