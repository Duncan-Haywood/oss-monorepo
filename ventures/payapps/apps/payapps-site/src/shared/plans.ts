// The plans shown on the pricing page and the cost model behind them (docs/PRICING.md).
//
// The plans MIRROR the app's own catalog (apps/payapps/src/shared/plans.ts, the one the Billing page
// and Paddle sell): same names, prices, active-job and user limits. test/unit/plans-sync.test.ts reads
// the app's file and fails when the two drift, so a price change is made in the app and copied here.
// Nothing is charged yet: checkout in the app is dark until the owner sets the Paddle secrets.
//
// Cost-plus check: every paid plan's price must sit between MIN_MARKUP and MAX_MARKUP times what it
// costs us to serve a customer who uses the whole plan (plans.test.ts enforces the band). The biggest
// cost is people, not hosting: setting up each job's schedule of values and answering "why doesn't my
// total match the GC's?" takes support time, so support hours are in the model. The app makes no AI
// calls, so there is no model cost.

/** Price band, as multiples of the full-use monthly cost. */
export const MIN_MARKUP = 1.5;
export const MAX_MARKUP = 2.0;

/** Active jobs assumed for an unlimited plan in the cost model (the app's FAIR_USE_ACTIVE_JOBS). */
export const FAIR_USE_ACTIVE_JOBS = 200;

export const COST_ASSUMPTIONS = {
  /** Merchant of record (Paddle, 5% + $0.50 per charge). */
  merchantPercent: 0.05,
  merchantFixedCents: 50,
  /** Refunds still cost the fee and the work already done. */
  refundReservePercent: 0.03,
  /** Loaded cost of an hour of onboarding/support (SOV set-up, "why doesn't it match the GC's?"). */
  supportHourCents: 6_000,
  /** Cloudflare Workers Paid ($5/month) spread over 25 customers, plus D1/email per job. */
  hostingBaseCents: 40,
  hostingPerJobCents: 2,
  /** R2 storage, $0.015 per GB-month, for a customer who fills the plan's attachment allowance. */
  storagePerGbCents: 1.5,
} as const;

export type PlanKey = "free" | "solo" | "crew" | "company";

export interface Plan {
  key: PlanKey;
  name: string;
  priceCents: number;
  /** The app's annual price (packages/billing's annualPriceFor); null when not sold. */
  annualPriceCents: number | null;
  /** Jobs open at once (closing a finished job in the app frees its slot); null = unlimited. */
  activeJobs: number | null;
  /** Users in the company; null = unlimited. */
  seats: number | null;
  /** Attachment storage for backup, photos and signed copies, in MB (1 GB = 1,024 MB). */
  storageMb: number;
  /** Onboarding and support hours a month we budget for a customer using the whole plan. */
  supportHours: number;
  summary: string;
  features: readonly string[];
}

export const PLANS: readonly Plan[] = [
  {
    key: "free",
    name: "Free",
    priceCents: 0,
    annualPriceCents: null,
    activeJobs: 1,
    seats: 1,
    storageMb: 250,
    supportHours: 0,
    summary: "Try it on one real job, start to finish.",
    features: [
      "Schedule of values, change orders and retainage",
      "Pay application summary and continuation sheet as PDF and CSV",
      "250 MB of attached backup and photos",
    ],
  },
  {
    key: "solo",
    name: "Solo",
    priceCents: 9_900,
    annualPriceCents: 106_900,
    activeJobs: 5,
    seats: 2,
    storageMb: 5 * 1024,
    supportHours: 0.75,
    summary: "For an owner who does the billing after the crew goes home.",
    features: ["Everything in Free", "5 GB of attachments"],
  },
  {
    key: "crew",
    name: "Crew",
    priceCents: 17_900,
    annualPriceCents: 193_300,
    activeJobs: 20,
    seats: 3,
    storageMb: 20 * 1024,
    supportHours: 1.25,
    summary: "For a shop with an office manager billing several GCs every month.",
    features: [
      "Everything in Solo",
      "Lien waivers per pay app, with statutory forms where verified",
      "QuickBooks Online: pay apps as invoices with retainage, payments applied",
      "Job cost per line and a WIP schedule (over/under billing, projected profit)",
      "20 GB of attachments",
    ],
  },
  {
    key: "company",
    name: "Company",
    priceCents: 24_900,
    annualPriceCents: 268_900,
    activeJobs: null,
    seats: null,
    storageMb: 50 * 1024,
    supportHours: 1.75,
    summary: "For a subcontractor with project managers and a billing team.",
    features: ["Everything in Crew", "50 GB of attachments"],
  },
];

export const PAID_PLANS: readonly Plan[] = PLANS.filter((p) => p.priceCents > 0);

export interface PlanCost {
  merchantCents: number;
  refundReserveCents: number;
  supportCents: number;
  hostingCents: number;
  storageCents: number;
  totalCents: number;
  markup: number;
}

/** What one month of a plan costs us when the customer uses all of it. */
export function planCost(plan: Plan, a = COST_ASSUMPTIONS): PlanCost {
  const jobs = plan.activeJobs ?? FAIR_USE_ACTIVE_JOBS;
  const charged = plan.priceCents > 0;
  const merchantCents = charged ? plan.priceCents * a.merchantPercent + a.merchantFixedCents : 0;
  const refundReserveCents = plan.priceCents * a.refundReservePercent;
  const supportCents = plan.supportHours * a.supportHourCents;
  const hostingCents = a.hostingBaseCents + jobs * a.hostingPerJobCents;
  const storageCents = (plan.storageMb / 1024) * a.storagePerGbCents;
  const totalCents =
    merchantCents + refundReserveCents + supportCents + hostingCents + storageCents;
  return {
    merchantCents,
    refundReserveCents,
    supportCents,
    hostingCents,
    storageCents,
    totalCents,
    markup: plan.priceCents / totalCents,
  };
}

/** "$99" for whole dollars, "$99.50" otherwise. */
export function formatUsd(cents: number): string {
  const dollars = cents / 100;
  return `$${Number.isInteger(dollars) ? dollars.toLocaleString("en-US") : dollars.toFixed(2)}`;
}

/** "5 active jobs" / "unlimited active jobs"; "1 user" / "unlimited users". */
export function limitText(n: number | null, unit: string): string {
  if (n === null) return `unlimited ${unit}s`;
  return `${n} ${unit}${n === 1 ? "" : "s"}`;
}

export type PaidPlanKey = Exclude<PlanKey, "free">;

/** Paying customers needed for a monthly revenue target at a paid-plan mix (shares sum to 1). */
export function customersForMrr(targetCents: number, mix: Record<PaidPlanKey, number>): number {
  const blended = PAID_PLANS.reduce((sum, p) => sum + p.priceCents * mix[p.key as PaidPlanKey], 0);
  return Math.ceil(targetCents / blended);
}
