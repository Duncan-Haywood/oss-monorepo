// Proposed plans and the cost model behind them (docs/PRICING.md explains every number).
// Nothing here is on sale yet: the product is in development and early access is free. The pricing
// page shows these as "proposed" and the unit test keeps each paid plan inside the markup band.

/** Claude Opus 5.5 list prices, USD per million tokens (same figures as apps/grants' cost model). */
export const MODEL_PRICES = { input: 4, output: 20 } as const;

/**
 * Estimated tokens per stage of one RFQ. These are design estimates for a product that is not built
 * yet, not measurements: re-run them against real RFQs before taking money (docs/PRICING.md).
 */
export const STAGE_TOKENS = {
  /** Read the email and attachment list: parts, quantities, due date, material callouts. */
  "rfq.intake": { input: 5_000, output: 1_200, calls: 1 },
  /** Read one drawing page (image + instructions): features, tolerances, finishes, notes. */
  "drawing.read": { input: 4_500, output: 1_800, calls: 3 },
  /** Independent check of every extracted value against the drawing; flags what it can't confirm. */
  "quote.check": { input: 9_000, output: 1_800, calls: 1 },
  /** Draft the cover note around the priced lines (prices come from code, never from the model). */
  "quote.letter": { input: 3_000, output: 900, calls: 1 },
} as const;

/** Re-reads, edits and re-checks per RFQ. */
export const REVISION_FACTOR = 1.3;

/** Hosting per shop-month: Workers Paid base spread over 25 shops plus R2/D1 allowance. */
export const HOSTING_PER_SHOP = 0.3;
/** Drawing storage and retrieval per RFQ. */
export const HOSTING_PER_RFQ = 0.01;
/** Merchant-of-record fee per charge (Paddle, as in apps/grants). */
export const MOR_PERCENT = 0.05;
export const MOR_FIXED = 0.5;
/** Refunds still cost the fee and the tokens already used. */
export const REFUND_RESERVE = 0.03;

/**
 * Margin policy (owner, 2026-11-24: "aim for min 40-60% margins in the products"). Margin is
 * 1 − full cost / price at full allowance. Allowances are derived at a 50% margin (2×)...
 */
export const TARGET_MARKUP = 2.0;
/** ...and the test fails the build below a 40% margin (1.67×). There is no ceiling. */
export const MIN_MARGIN = 0.4;
export const MARKUP_BAND = [1 / (1 - MIN_MARGIN), Number.POSITIVE_INFINITY] as const;
/** Annual billing discount. */
export const ANNUAL_DISCOUNT = 0.1;

export function llmCostPerRfq(): number {
  let cost = 0;
  for (const s of Object.values(STAGE_TOKENS)) {
    cost += (s.calls * (s.input * MODEL_PRICES.input + s.output * MODEL_PRICES.output)) / 1_000_000;
  }
  return cost * REVISION_FACTOR;
}

export interface PlanInput {
  key: string;
  name: string;
  monthlyPrice: number;
  seats: number;
  /** Onboarding help and email support, owner's time, estimated per shop-month. */
  supportPerMonth: number;
  summary: string;
}

export interface Plan extends PlanInput {
  annualPrice: number;
  rfqsPerMonth: number;
}

export type Billing = "monthly" | "annual";

export function annualPrice(monthlyPrice: number): number {
  return Math.round(monthlyPrice * 12 * (1 - ANNUAL_DISCOUNT));
}

/** Revenue per month for a billing cycle (annual spread over 12 months). */
export function revenuePerMonth(plan: Pick<Plan, "monthlyPrice">, billing: Billing): number {
  return billing === "monthly" ? plan.monthlyPrice : annualPrice(plan.monthlyPrice) / 12;
}

/** Full cost per month for a shop that uses its whole allowance. */
export function fullCostPerMonth(
  plan: Pick<Plan, "monthlyPrice" | "supportPerMonth">,
  rfqs: number,
  billing: Billing,
): number {
  const charge = billing === "monthly" ? plan.monthlyPrice : annualPrice(plan.monthlyPrice);
  const feePerMonth = (charge * MOR_PERCENT + MOR_FIXED) / (billing === "monthly" ? 1 : 12);
  const revenue = revenuePerMonth(plan, billing);
  return (
    rfqs * (llmCostPerRfq() + HOSTING_PER_RFQ) +
    HOSTING_PER_SHOP +
    plan.supportPerMonth +
    feePerMonth +
    revenue * REFUND_RESERVE
  );
}

export function markup(plan: Plan, billing: Billing): number {
  return revenuePerMonth(plan, billing) / fullCostPerMonth(plan, plan.rfqsPerMonth, billing);
}

/**
 * Largest RFQ allowance, rounded down to a multiple of 25 so it reads cleanly, that keeps the markup
 * at or above TARGET_MARKUP for both monthly and annual billing.
 */
export function deriveRfqAllowance(plan: PlanInput): number {
  let best = 0;
  for (let n = 25; n <= 10_000; n += 25) {
    const ok = (["monthly", "annual"] as const).every(
      (b) => revenuePerMonth(plan, b) / fullCostPerMonth(plan, n, b) >= TARGET_MARKUP,
    );
    if (!ok) break;
    best = n;
  }
  return best;
}

const PLAN_INPUTS: readonly PlanInput[] = [
  {
    key: "shop",
    name: "Shop",
    monthlyPrice: 199,
    seats: 3,
    supportPerMonth: 15,
    summary: "For a shop where the owner or one estimator does the quoting.",
  },
  {
    key: "shop_plus",
    name: "Shop Plus",
    monthlyPrice: 399,
    seats: 10,
    supportPerMonth: 25,
    summary: "For shops with a quoting team or a steady stream of multi-part RFQs.",
  },
];

export const PLANS: readonly Plan[] = PLAN_INPUTS.map((p) => ({
  ...p,
  annualPrice: annualPrice(p.monthlyPrice),
  rfqsPerMonth: deriveRfqAllowance(p),
}));

/** Free during development, capped so the cost stays bounded. Never sold. */
export const EARLY_ACCESS_PLAN = {
  name: "Early access",
  rfqsPerMonth: 40,
  seats: 3,
} as const;

export const formatUsd = (n: number): string =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
