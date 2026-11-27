// Plan catalog + the cost-plus pricing band. Apps define plans (price, annual price, quotas) and a
// cost function; this module derives quotas that fit the band and checks every paid plan against it.
// Put `assertPricingBand(...)` (or a per-plan loop over checkPricingBand) in a unit test so a model
// price or prompt change that breaks the 40% margin floor fails CI.
import { type Charge, markup } from "./cost-model.ts";

/**
 * Margin policy (owner, 2026-11-24: "aim for min 40-60% margins in the products"). Margin is
 * 1 − fullCost / price, measured at FULL allowance (the worst case), monthly and annual billing.
 *  - MIN_MARGIN 40% is the floor: a paid plan below it fails CI.
 *  - Quotas are derived at QUOTA_MARGIN 50%, so a model-price or prompt drift has room before it
 *    breaks the floor.
 *  - TARGET_MARGIN 60% is the minimum to aim for, not a ceiling (owner: "the 40-60 isn't a limit
 *    for how high the margins go but a sort of minimal goal"); higher is better. Customers rarely
 *    use their whole allowance, so realised margin sits above the full-allowance figure; that gap is unmeasured until there are paying customers.
 * There is no ceiling: a plan priced well above cost is the market's call, not a test failure.
 */
export const MIN_MARGIN = 0.4;
export const QUOTA_MARGIN = 0.5;
export const TARGET_MARGIN = 0.6;
/** price / cost that gives `margin` (40% → 1.667×, 50% → 2×, 60% → 2.5×). */
export const markupForMargin = (margin: number) => 1 / (1 - margin);
/** margin that a price / cost ratio gives (inverse of markupForMargin). */
export const marginForMarkup = (m: number) => 1 - 1 / m;

/** Markup band every paid plan must satisfy (price / full cost). */
export const MIN_MARKUP = markupForMargin(MIN_MARGIN);
export const MAX_MARKUP = Number.POSITIVE_INFINITY;
/** Derive quotas at this markup so small model-price changes don't push a plan below the floor. */
export const TARGET_MARKUP = markupForMargin(QUOTA_MARGIN);
/** Annual billing = 12 months at 10% off (one MoR fixed fee per year instead of twelve). */
export const ANNUAL_DISCOUNT = 0.1;

export interface PricingBand {
  min: number;
  max: number;
}
export const PRICING_BAND: PricingBand = { min: MIN_MARKUP, max: MAX_MARKUP };

/** The billing-relevant part of a plan. Apps extend it with their own quota fields. */
export interface BillablePlan {
  key: string;
  /** Monthly price in cents (0 for comp / free). */
  priceCents: number;
  /** Annual price in cents, or null when not sold annually. */
  annualPriceCents: number | null;
  /** Sold through checkout (comp is granted by an operator, never sold). */
  purchasable: boolean;
}

/** 12 months at `discount` off, rounded to whole dollars. */
export const annualPriceFor = (priceCents: number, discount = ANNUAL_DISCOUNT) =>
  Math.round((priceCents * 12 * (1 - discount)) / 100) * 100;

/** Every charge a plan is sold at (monthly, plus annual when offered). */
export function chargesFor(plan: Pick<BillablePlan, "priceCents" | "annualPriceCents">): Charge[] {
  const out: Charge[] = [{ cents: plan.priceCents, interval: "month" }];
  if (plan.annualPriceCents) out.push({ cents: plan.annualPriceCents, interval: "year" });
  return out;
}

export interface PlanCatalog<P extends BillablePlan> {
  plans: readonly P[];
  get(key: string | null | undefined): P | null;
  isPlanKey(key: string): boolean;
  /** Purchasable plans only (what checkout and webhooks may grant). */
  purchasable: readonly P[];
  purchasableKeys: readonly string[];
  isPurchasable(key: string): boolean;
}

export function definePlanCatalog<P extends BillablePlan>(plans: readonly P[]): PlanCatalog<P> {
  const byKey = new Map<string, P>();
  for (const p of plans) {
    if (byKey.has(p.key)) throw new Error(`duplicate plan key ${p.key}`);
    if (p.key.includes(":")) throw new Error(`plan key ${p.key} must not contain ":"`);
    byKey.set(p.key, p);
  }
  const purchasable = plans.filter((p) => p.purchasable);
  const purchasableKeys = purchasable.map((p) => p.key);
  return {
    plans,
    get: (key) => (key ? (byKey.get(key) ?? null) : null),
    isPlanKey: (key) => byKey.has(key),
    purchasable,
    purchasableKeys,
    isPurchasable: (key) => purchasableKeys.includes(key),
  };
}

/**
 * Largest quota q in [0, max] whose fully loaded cost keeps markup ≥ target for EVERY charge.
 * `costForQuota(q, charge)` returns the monthly cost in micro-USD at quota q (cost must grow with q).
 */
export function deriveLargestQuota(
  charges: readonly Charge[],
  costForQuota: (quota: number, charge: Charge) => number,
  target = TARGET_MARKUP,
  max = 1000,
): number {
  let best = 0;
  for (let q = 1; q <= max; q++) {
    if (!charges.every((ch) => markup(ch, costForQuota(q, ch)) >= target)) break;
    best = q;
  }
  return best;
}

export interface PricingCheck {
  planKey: string;
  interval: Charge["interval"];
  priceCents: number;
  costMicrosPerMonth: number;
  markup: number;
  ok: boolean;
}

/** Markup of every purchasable plan at every charge, flagged against the band. */
export function checkPricingBand<P extends BillablePlan>(
  plans: readonly P[],
  costFor: (plan: P, charge: Charge) => number,
  band: PricingBand = PRICING_BAND,
): PricingCheck[] {
  const out: PricingCheck[] = [];
  for (const plan of plans) {
    if (!plan.purchasable) continue;
    for (const ch of chargesFor(plan)) {
      const cost = costFor(plan, ch);
      const m = markup(ch, cost);
      out.push({
        planKey: plan.key,
        interval: ch.interval,
        priceCents: ch.cents,
        costMicrosPerMonth: cost,
        markup: m,
        ok: Number.isFinite(m) && m >= band.min && m <= band.max,
      });
    }
  }
  return out;
}

/** Throws a readable error listing every purchasable plan/interval outside the band. */
export function assertPricingBand<P extends BillablePlan>(
  plans: readonly P[],
  costFor: (plan: P, charge: Charge) => number,
  band: PricingBand = PRICING_BAND,
): PricingCheck[] {
  const checks = checkPricingBand(plans, costFor, band);
  if (checks.length === 0) throw new Error("no purchasable plans to check");
  const bad = checks.filter((c) => !c.ok);
  if (bad.length) {
    const lines = bad.map(
      (c) =>
        `${c.planKey} (${c.interval}): ${c.markup.toFixed(2)}× (${(marginForMarkup(c.markup) * 100).toFixed(0)}% margin)` +
        ` outside [${band.min.toFixed(2)}×, ${band.max}×]` +
        ` — price ${c.priceCents}¢, cost $${(c.costMicrosPerMonth / 1e6).toFixed(2)}/mo`,
    );
    throw new Error(`Pricing band violated:\n${lines.join("\n")}`);
  }
  return checks;
}
