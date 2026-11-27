// Cost-plus pricing: what one org-month on a plan costs to serve, fully loaded, and the markup check
// every paid app enforces in a unit test: price must be at least 1.67× the cost (a 40% margin, see
// MIN_MARGIN in pricing.ts) for BOTH monthly and annual billing (pattern from apps/grants docs/PRICING.md).
//
// Full cost = variable cost at full allowance (LLM tokens + per-unit work, supplied by the app)
//           + hosting (amortized platform base + per-org + per-unit)
//           + merchant-of-record fee (Paddle 5% + $0.50 per charge; annual spreads it over 12)
//           + refund reserve (3% of revenue: refunds still cost the fee and the tokens used).
import type { BillingInterval } from "./provider.ts";

/** 1 USD = 1_000_000 micro-USD; 1 cent = 10_000 micro-USD. */
export const MICROS_PER_CENT = 10_000;
export const centsToMicros = (cents: number) => cents * MICROS_PER_CENT;
export const microsToUsd = (micros: number) => micros / 1_000_000;

// ---- LLM token prices ------------------------------------------------------------------------------

/** USD per million tokens. */
export interface ModelPrice {
  inputPerMTok: number;
  outputPerMTok: number;
  cacheReadPerMTok: number;
  /** 5-minute TTL writes = 1.25× input. */
  cacheWritePerMTok: number;
}

export const DEFAULT_MODEL = "claude-opus-5-5";

/** Anthropic first-party list prices, cached 2026-11 (same table as apps/grants ports/llm-pricing.ts). */
export const MODEL_PRICES: Record<string, ModelPrice> = {
  "claude-opus-5-5": {
    inputPerMTok: 4,
    outputPerMTok: 20,
    cacheReadPerMTok: 0.2,
    cacheWritePerMTok: 5,
  },
  "claude-sonnet-5-5": {
    inputPerMTok: 2,
    outputPerMTok: 10,
    cacheReadPerMTok: 0.1,
    cacheWritePerMTok: 2.5,
  },
  "claude-haiku-5-5": {
    inputPerMTok: 0.1,
    outputPerMTok: 0.5,
    cacheReadPerMTok: 0.01,
    cacheWritePerMTok: 0.125,
  },
};

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export const tokens = (
  input: number,
  output: number,
  cacheRead = 0,
  cacheWrite = 0,
): TokenUsage => ({
  inputTokens: input,
  outputTokens: output,
  cacheReadTokens: cacheRead,
  cacheWriteTokens: cacheWrite,
});

/** Cost of one call in micro-USD. Unknown models are priced as the default model (conservative). */
export function llmCostMicros(
  u: TokenUsage,
  model = DEFAULT_MODEL,
  prices: Record<string, ModelPrice> = MODEL_PRICES,
): number {
  const p = prices[model] ?? prices[DEFAULT_MODEL] ?? (MODEL_PRICES[DEFAULT_MODEL] as ModelPrice);
  // tokens × $/MTok = micro-USD
  return Math.round(
    u.inputTokens * p.inputPerMTok +
      u.outputTokens * p.outputPerMTok +
      u.cacheReadTokens * p.cacheReadPerMTok +
      u.cacheWriteTokens * p.cacheWritePerMTok,
  );
}

// ---- Hosting --------------------------------------------------------------------------------------

export interface HostingModel {
  /** Platform base fee per month (Cloudflare Workers Paid: $5). */
  baseMonthlyMicros: number;
  /** Paying orgs the base fee is spread over (be conservative). */
  amortizedOverOrgs: number;
  /** Per-org storage / vector / email budget per month. */
  perOrgVariableMicros: number;
  /** Per metered unit (e.g. per drafted application). */
  perUnitMicros: number;
}

/** apps/grants' hosting assumptions (docs/PRICING.md "Hosting per org-month"). */
export const CLOUDFLARE_HOSTING: HostingModel = {
  baseMonthlyMicros: 5_000_000,
  amortizedOverOrgs: 25,
  perOrgVariableMicros: 100_000,
  perUnitMicros: 10_000,
};

export function hostingMicros(units: number, h: HostingModel = CLOUDFLARE_HOSTING): number {
  return (
    Math.round(h.baseMonthlyMicros / h.amortizedOverOrgs) +
    h.perOrgVariableMicros +
    units * h.perUnitMicros
  );
}

// ---- Merchant of record ---------------------------------------------------------------------------

export interface MerchantFees {
  provider: string;
  percent: number;
  fixedCents: number;
}

/** Paddle pay-as-you-go: 5% + $0.50 per checkout transaction (tax, invoicing, fraud included). */
export const PADDLE_FEES: MerchantFees = { provider: "paddle", percent: 0.05, fixedCents: 50 };

/** Reserve for the money-back guarantee (refunded charges still cost the MoR fee + tokens). */
export const REFUND_RESERVE_PERCENT = 0.03;

export function merchantFeeMicros(chargeCents: number, fees: MerchantFees = PADDLE_FEES): number {
  if (chargeCents <= 0) return 0;
  return Math.round(centsToMicros(chargeCents) * fees.percent + centsToMicros(fees.fixedCents));
}

// ---- Org-month ------------------------------------------------------------------------------------

export interface Charge {
  cents: number;
  interval: BillingInterval;
}

export interface MonthlyCostBreakdown {
  variableMicros: number;
  hostingMicros: number;
  merchantFeeMicros: number;
  refundReserveMicros: number;
  totalMicros: number;
}

export interface FullCostOptions {
  fees?: MerchantFees;
  refundReservePercent?: number;
}

/**
 * Fully loaded monthly cost of an org that uses its whole allowance. `variableMicros` and
 * `hostingMicros` are per month; the MoR fee and refund reserve of an annual charge are spread over 12.
 */
export function fullMonthlyCost(
  costs: { variableMicros: number; hostingMicros: number },
  charge: Charge,
  opts: FullCostOptions = {},
): MonthlyCostBreakdown {
  const months = charge.interval === "year" ? 12 : 1;
  const fee = Math.round(merchantFeeMicros(charge.cents, opts.fees) / months);
  const reserve = Math.round(
    (centsToMicros(charge.cents) * (opts.refundReservePercent ?? REFUND_RESERVE_PERCENT)) / months,
  );
  return {
    variableMicros: costs.variableMicros,
    hostingMicros: costs.hostingMicros,
    merchantFeeMicros: fee,
    refundReserveMicros: reserve,
    totalMicros: costs.variableMicros + costs.hostingMicros + fee + reserve,
  };
}

/** price / cost for one month of service (1.4 = 40% over full cost). */
export function markup(charge: Charge, costMicrosPerMonth: number): number {
  const months = charge.interval === "year" ? 12 : 1;
  return centsToMicros(charge.cents) / months / costMicrosPerMonth;
}
