/**
 * B2B Trade Account Credit Limit & Invoicing Term Inspector
 * 
 * Manages B2B trade buyer credit lines, payment terms (Net-30/60/90),
 * credit risk scoring, credit hold enforcement, and receivables exposure tracking
 * for interior designers, hospitality projects, and corporate art buyers.
 */

export type TradeCompanyTier = "boutique_studio" | "regional_design_firm" | "enterprise_hospitality";

export type PaymentTerm = "net_15" | "net_30" | "net_60" | "net_90";

export interface TradeAccountInput {
  accountId: string;
  companyName: string;
  tier: TradeCompanyTier;
  creditScore: number; // 300 to 850
  annualVolumeCommitmentUsdCents: number;
  promptPaymentScore: number; // 0 to 100 (percentage paid on-time)
  currentOutstandingBalanceCents: number;
  currentOverdueBalanceCents: number;
}

export interface CreditEvaluationResult {
  accountId: string;
  companyName: string;
  tier: TradeCompanyTier;
  recommendedCreditLimitCents: number;
  availableCreditCents: number;
  maxApprovedPaymentTerm: PaymentTerm;
  creditRiskLevel: "low" | "medium" | "high" | "critical";
  creditHoldActive: boolean;
  holdReasons: string[];
}

export interface InvoiceAuthorizationInput {
  accountId: string;
  orderAmountCents: number;
  requestedTerm: PaymentTerm;
}

export interface InvoiceAuthorizationResult {
  authorized: boolean;
  accountId: string;
  orderAmountCents: number;
  approvedTerm: PaymentTerm;
  creditHoldEnforced: boolean;
  rejectionReasons: string[];
  remainingCreditAfterPurchaseCents: number;
}

export interface TradeCreditPortfolioSummary {
  totalAccounts: number;
  totalCreditLineExposureCents: number;
  totalOutstandingBalanceCents: number;
  totalOverdueBalanceCents: number;
  creditHoldAccountCount: number;
  overdueRatioPercent: number;
  portfolioRiskLevel: "healthy" | "moderate_risk" | "high_risk";
}

const TERM_MAX_DAYS: Record<PaymentTerm, number> = {
  net_15: 15,
  net_30: 30,
  net_60: 60,
  net_90: 90,
};

/**
 * Calculates credit limit and max allowed payment term based on tier, credit score, volume, and payment history.
 */
export function evaluateTradeCreditLimit(account: TradeAccountInput): CreditEvaluationResult {
  const holdReasons: string[] = [];

  // 1. Base multiplier by company tier
  let baseLimitUsd = 5000; // $5k base for boutique
  if (account.tier === "regional_design_firm") baseLimitUsd = 25000;
  if (account.tier === "enterprise_hospitality") baseLimitUsd = 100000;

  // 2. Adjust by Credit Score factor (0.5x for poor credit up to 2.0x for excellent credit)
  let creditMultiplier = 1.0;
  if (account.creditScore >= 750) creditMultiplier = 1.5;
  else if (account.creditScore >= 680) creditMultiplier = 1.2;
  else if (account.creditScore < 600) creditMultiplier = 0.5;

  // 3. Adjust by Prompt Payment Score (0 to 100%)
  const paymentMultiplier = account.promptPaymentScore >= 90 ? 1.2 : account.promptPaymentScore < 70 ? 0.7 : 1.0;

  // 4. Volume bonus (10% of committed annual volume)
  const volumeBonusUsd = (account.annualVolumeCommitmentUsdCents / 100) * 0.1;

  const calculatedLimitUsd = (baseLimitUsd * creditMultiplier * paymentMultiplier) + volumeBonusUsd;
  let recommendedCreditLimitCents = Math.round(calculatedLimitUsd * 100);

  // Hard caps & floors
  if (recommendedCreditLimitCents < 100000) recommendedCreditLimitCents = 100000; // Min $1,000 credit line

  // Determine Risk Level
  let creditRiskLevel: "low" | "medium" | "high" | "critical" = "low";
  if (account.creditScore < 580 || account.promptPaymentScore < 50) creditRiskLevel = "critical";
  else if (account.creditScore < 650 || account.promptPaymentScore < 75) creditRiskLevel = "high";
  else if (account.creditScore < 720) creditRiskLevel = "medium";

  // Check Credit Hold Conditions
  let creditHoldActive = false;
  if (account.currentOverdueBalanceCents > 0) {
    creditHoldActive = true;
    holdReasons.push(`Outstanding overdue balance of $${(account.currentOverdueBalanceCents / 100).toFixed(2)}`);
  }
  if (creditRiskLevel === "critical") {
    creditHoldActive = true;
    holdReasons.push("High credit risk rating (low credit score or poor payment history)");
  }

  const availableCreditCents = Math.max(0, recommendedCreditLimitCents - account.currentOutstandingBalanceCents);

  // Max Approved Payment Term
  let maxApprovedPaymentTerm: PaymentTerm = "net_30";
  if (account.tier === "enterprise_hospitality" && creditRiskLevel === "low") {
    maxApprovedPaymentTerm = "net_90";
  } else if (account.tier === "regional_design_firm" && (creditRiskLevel === "low" || creditRiskLevel === "medium")) {
    maxApprovedPaymentTerm = "net_60";
  } else if (creditRiskLevel === "high" || creditRiskLevel === "critical") {
    maxApprovedPaymentTerm = "net_15";
  }

  return {
    accountId: account.accountId,
    companyName: account.companyName,
    tier: account.tier,
    recommendedCreditLimitCents,
    availableCreditCents,
    maxApprovedPaymentTerm,
    creditRiskLevel,
    creditHoldActive,
    holdReasons,
  };
}

/**
 * Authorizes a B2B order purchase on credit terms.
 */
export function authorizeTradeInvoicePurchase(
  account: TradeAccountInput,
  input: InvoiceAuthorizationInput
): InvoiceAuthorizationResult {
  const evalResult = evaluateTradeCreditLimit(account);
  const rejectionReasons: string[] = [];

  // Check 1: Active credit hold
  if (evalResult.creditHoldActive) {
    rejectionReasons.push(...evalResult.holdReasons);
  }

  // Check 2: Available credit balance
  if (input.orderAmountCents > evalResult.availableCreditCents) {
    rejectionReasons.push(
      `Order amount ($${(input.orderAmountCents / 100).toFixed(2)}) exceeds available credit ($${(evalResult.availableCreditCents / 100).toFixed(2)})`
    );
  }

  // Check 3: Payment term request
  const requestedDays = TERM_MAX_DAYS[input.requestedTerm];
  const maxApprovedDays = TERM_MAX_DAYS[evalResult.maxApprovedPaymentTerm];
  if (requestedDays > maxApprovedDays) {
    rejectionReasons.push(
      `Requested term ${input.requestedTerm} exceeds max approved term ${evalResult.maxApprovedPaymentTerm} for risk profile`
    );
  }

  const authorized = rejectionReasons.length === 0;
  const remainingCreditAfterPurchaseCents = authorized
    ? evalResult.availableCreditCents - input.orderAmountCents
    : evalResult.availableCreditCents;

  return {
    authorized,
    accountId: account.accountId,
    orderAmountCents: input.orderAmountCents,
    approvedTerm: authorized ? input.requestedTerm : evalResult.maxApprovedPaymentTerm,
    creditHoldEnforced: evalResult.creditHoldActive,
    rejectionReasons,
    remainingCreditAfterPurchaseCents,
  };
}

/**
 * Summarizes risk exposure across a portfolio of trade accounts.
 */
export function summarizeTradeCreditPortfolio(accounts: TradeAccountInput[]): TradeCreditPortfolioSummary {
  const totalAccounts = accounts.length;
  if (totalAccounts === 0) {
    return {
      totalAccounts: 0,
      totalCreditLineExposureCents: 0,
      totalOutstandingBalanceCents: 0,
      totalOverdueBalanceCents: 0,
      creditHoldAccountCount: 0,
      overdueRatioPercent: 0,
      portfolioRiskLevel: "healthy",
    };
  }

  let totalCreditLineExposureCents = 0;
  let totalOutstandingBalanceCents = 0;
  let totalOverdueBalanceCents = 0;
  let creditHoldAccountCount = 0;

  for (const acct of accounts) {
    const evalResult = evaluateTradeCreditLimit(acct);
    totalCreditLineExposureCents += evalResult.recommendedCreditLimitCents;
    totalOutstandingBalanceCents += acct.currentOutstandingBalanceCents;
    totalOverdueBalanceCents += acct.currentOverdueBalanceCents;
    if (evalResult.creditHoldActive) creditHoldAccountCount++;
  }

  const overdueRatioPercent =
    totalOutstandingBalanceCents > 0
      ? Math.round((totalOverdueBalanceCents / totalOutstandingBalanceCents) * 10000) / 100
      : 0;

  let portfolioRiskLevel: "healthy" | "moderate_risk" | "high_risk" = "healthy";
  if (overdueRatioPercent >= 15 || creditHoldAccountCount / totalAccounts >= 0.25) {
    portfolioRiskLevel = "high_risk";
  } else if (overdueRatioPercent >= 5 || creditHoldAccountCount / totalAccounts >= 0.1) {
    portfolioRiskLevel = "moderate_risk";
  }

  return {
    totalAccounts,
    totalCreditLineExposureCents,
    totalOutstandingBalanceCents,
    totalOverdueBalanceCents,
    creditHoldAccountCount,
    overdueRatioPercent,
    portfolioRiskLevel,
  };
}

/**
 * Generates Convex Schema definition for trade_credit_accounts
 */
export function generateConvexTradeCreditSchema(): string {
  return `
export const trade_credit_accounts = defineTable({
  accountId: v.string(),
  companyName: v.string(),
  tier: v.string(),
  creditScore: v.number(),
  annualVolumeCommitmentUsdCents: v.number(),
  promptPaymentScore: v.number(),
  currentOutstandingBalanceCents: v.number(),
  currentOverdueBalanceCents: v.number(),
}).index("by_account", ["accountId"])
  .index("by_tier", ["tier"]);
`.trim();
}

class TradeCreditStore {
  private accounts: Map<string, TradeAccountInput> = new Map();

  public upsertAccount(account: TradeAccountInput): void {
    this.accounts.set(account.accountId, account);
  }

  public getAccount(accountId: string): TradeAccountInput | undefined {
    return this.accounts.get(accountId);
  }

  public clear(): void {
    this.accounts.clear();
  }
}

export const tradeCreditStore = new TradeCreditStore();
