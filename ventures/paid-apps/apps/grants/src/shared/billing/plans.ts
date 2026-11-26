// Plans: subscriptions priced by applications drafted per month (the high-value unit). Each paid plan
// includes a chosen number of drafts (`includedDrafts`), capped by the cost model: never more than the
// largest quota that keeps a 50% margin over the fully loaded cost (LLM tokens + hosting +
// merchant-of-record fees + refund reserve) for both monthly and annual billing. The test fails below
// a 40% margin (owner, 2026-11-24: "aim for min 40-60% margins"). See docs/PRICING.md.
import {
  type BillingInterval,
  DEFAULT_MODEL,
  type MonthlyCostBreakdown,
  markup,
  monthlyCost,
  type UsageAllowance,
} from "./cost-model";

export const PLAN_KEYS = ["comp", "starter", "standard", "pro"] as const;
export type PlanKey = (typeof PLAN_KEYS)[number];
export const PAID_PLAN_KEYS = ["starter", "standard", "pro"] as const;
export type PaidPlanKey = (typeof PAID_PLAN_KEYS)[number];

/** Margin floor every paid plan must keep at full allowance; margin = 1 − full cost / price. */
export const MIN_MARGIN = 0.4;
/** Quotas are derived at this margin so small model-price changes don't push a plan below the floor. */
export const QUOTA_MARGIN = 0.5;
/** Markup band (price / full cost) equivalent to the floor; there is no ceiling. */
export const MIN_MARKUP = 1 / (1 - MIN_MARGIN);
export const MAX_MARKUP = Number.POSITIVE_INFINITY;
export const TARGET_MARKUP = 1 / (1 - QUOTA_MARGIN);
/** Annual billing = 12 months at 10% off; one MoR fixed fee per year instead of twelve. */
export const ANNUAL_DISCOUNT = 0.1;

export interface Plan {
  key: PlanKey;
  name: string;
  description: string;
  /** Monthly price in cents (0 for comp). */
  priceCents: number;
  /** Annual price in cents, or null when not sold annually. */
  annualPriceCents: number | null;
  includedApplicationDrafts: number;
  maxOpportunityScoresPerMonth: number;
  /** Fair-use allowances assumed by the cost model (not hard-enforced). */
  fairUse: { documentPagesPerMonth: number; interviewTurnsPerMonth: number };
  seats: number;
  features: string[];
  /** Purchasable through checkout (comp is granted by an operator, never sold). */
  purchasable: boolean;
}

interface PaidPlanSpec {
  key: PaidPlanKey;
  name: string;
  description: string;
  priceCents: number;
  /** Drafts a month the plan offers (a product choice); the cost model caps it (deriveIncludedDrafts). */
  includedDrafts: number;
  maxOpportunityScoresPerMonth: number;
  documentPagesPerMonth: number;
  interviewTurnsPerMonth: number;
  seats: number;
  features: string[];
}

const BASE_FEATURES = [
  "Daily grant discovery + fit scoring",
  "Drafts grounded only in your documents and interviews",
  "Independent grounding verification + human review routing",
  "Deadline and follow-up reminders",
];

const PAID_SPECS: PaidPlanSpec[] = [
  {
    key: "starter",
    name: "Starter",
    description: "For a small team drafting a few applications a month.",
    priceCents: 1_000,
    includedDrafts: 5,
    maxOpportunityScoresPerMonth: 20,
    documentPagesPerMonth: 25,
    interviewTurnsPerMonth: 15,
    seats: 3,
    features: BASE_FEATURES,
  },
  {
    key: "standard",
    name: "Standard",
    description: "For an active development office with a steady grant calendar.",
    priceCents: 2_900,
    includedDrafts: 20,
    maxOpportunityScoresPerMonth: 100,
    documentPagesPerMonth: 100,
    interviewTurnsPerMonth: 40,
    seats: 10,
    features: [...BASE_FEATURES, "Autopilot submission for small, low-risk asks"],
  },
  {
    key: "pro",
    name: "Pro",
    description: "For multi-program organizations and grant consultants.",
    priceCents: 14_900,
    includedDrafts: 120,
    maxOpportunityScoresPerMonth: 400,
    documentPagesPerMonth: 400,
    interviewTurnsPerMonth: 150,
    seats: 25,
    features: [...BASE_FEATURES, "Autopilot submission", "Priority support"],
  },
];

export const annualPriceFor = (priceCents: number) =>
  Math.round((priceCents * 12 * (1 - ANNUAL_DISCOUNT)) / 100) * 100;

const allowanceOf = (spec: PaidPlanSpec, drafts: number): UsageAllowance => ({
  applicationDrafts: drafts,
  opportunityScores: spec.maxOpportunityScoresPerMonth,
  documentPages: spec.documentPagesPerMonth,
  interviewTurns: spec.interviewTurnsPerMonth,
});

const chargesOf = (priceCents: number, annualPriceCents: number | null) => {
  const out: { cents: number; interval: BillingInterval }[] = [
    { cents: priceCents, interval: "month" },
  ];
  if (annualPriceCents) out.push({ cents: annualPriceCents, interval: "year" });
  return out;
};

/** Largest draft quota whose fully loaded cost keeps markup ≥ target for every billing interval. */
export function deriveIncludedDrafts(
  spec: PaidPlanSpec,
  model = DEFAULT_MODEL,
  target = TARGET_MARKUP,
): number {
  const charges = chargesOf(spec.priceCents, annualPriceFor(spec.priceCents));
  let drafts = 0;
  for (let k = 1; k <= 1000; k++) {
    const ok = charges.every(
      (ch) => markup(ch, monthlyCost(allowanceOf(spec, k), ch, model).totalMicros) >= target,
    );
    if (!ok) break;
    drafts = k;
  }
  return drafts;
}

function buildPaidPlan(spec: PaidPlanSpec): Plan {
  return {
    key: spec.key,
    name: spec.name,
    description: spec.description,
    priceCents: spec.priceCents,
    annualPriceCents: annualPriceFor(spec.priceCents),
    includedApplicationDrafts: Math.min(spec.includedDrafts, deriveIncludedDrafts(spec)),
    maxOpportunityScoresPerMonth: spec.maxOpportunityScoresPerMonth,
    fairUse: {
      documentPagesPerMonth: spec.documentPagesPerMonth,
      interviewTurnsPerMonth: spec.interviewTurnsPerMonth,
    },
    seats: spec.seats,
    features: spec.features,
    purchasable: true,
  };
}

const COMP_PLAN: Plan = {
  key: "comp",
  name: "Pilot partner (complimentary)",
  description: "Complimentary plan for pilot partner organizations. Costs are absorbed by us.",
  priceCents: 0,
  annualPriceCents: null,
  includedApplicationDrafts: 25,
  maxOpportunityScoresPerMonth: 500,
  fairUse: { documentPagesPerMonth: 500, interviewTurnsPerMonth: 200 },
  seats: 50,
  features: [...BASE_FEATURES, "Autopilot submission", "Direct line to the product team"],
  purchasable: false,
};

export const PLANS: Record<PlanKey, Plan> = {
  comp: COMP_PLAN,
  ...(Object.fromEntries(PAID_SPECS.map((s) => [s.key, buildPaidPlan(s)])) as Record<
    PaidPlanKey,
    Plan
  >),
};

export const PLAN_LIST: Plan[] = PLAN_KEYS.map((k) => PLANS[k]);

export const isPlanKey = (k: string): k is PlanKey => (PLAN_KEYS as readonly string[]).includes(k);
export const isPaidPlanKey = (k: string): k is PaidPlanKey =>
  (PAID_PLAN_KEYS as readonly string[]).includes(k);

export function getPlan(key: string | null | undefined): Plan | null {
  return key && isPlanKey(key) ? PLANS[key] : null;
}

/** Fully loaded monthly cost of a plan used to its full allowance. */
export function planMonthlyCost(
  plan: Plan,
  interval: BillingInterval = "month",
  model = DEFAULT_MODEL,
): MonthlyCostBreakdown {
  const cents = interval === "year" ? (plan.annualPriceCents ?? 0) : plan.priceCents;
  return monthlyCost(
    {
      applicationDrafts: plan.includedApplicationDrafts,
      opportunityScores: plan.maxOpportunityScoresPerMonth,
      documentPages: plan.fairUse.documentPagesPerMonth,
      interviewTurns: plan.fairUse.interviewTurnsPerMonth,
    },
    { cents, interval },
    model,
  );
}

export function planMarkup(plan: Plan, interval: BillingInterval = "month", model = DEFAULT_MODEL) {
  const cents = interval === "year" ? (plan.annualPriceCents ?? 0) : plan.priceCents;
  return markup({ cents, interval }, planMonthlyCost(plan, interval, model).totalMicros);
}

/**
 * Checkout price key passed to the billing provider as CheckoutRequest.planKey: "starter" (monthly) or
 * "starter:annual".
 */
export const checkoutPriceKey = (planKey: PaidPlanKey, interval: BillingInterval) =>
  interval === "year" ? `${planKey}:annual` : planKey;

export function parseCheckoutPriceKey(
  key: string,
): { planKey: PaidPlanKey; interval: BillingInterval } | null {
  const [plan, suffix] = key.split(":");
  if (!plan || !isPaidPlanKey(plan)) return null;
  if (suffix !== undefined && suffix !== "annual") return null;
  return { planKey: plan, interval: suffix === "annual" ? "year" : "month" };
}
