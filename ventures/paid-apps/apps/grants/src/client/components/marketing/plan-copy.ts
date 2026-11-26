// Marketing copy derived from the billing plans, so the landing page can never drift from
// src/shared/billing/plans.ts. Only purchasable plans are advertised (comp is operator-granted).
import { formatCents } from "@client/lib/api";
import { PLAN_LIST, type Plan } from "@shared/billing/plans";

/** Money-back window, matching docs/legal/refunds.md. */
export const GUARANTEE_DAYS = 30;

/** Plans we sell, cheapest first. */
export function marketingPlans(plans: readonly Plan[] = PLAN_LIST): Plan[] {
  return plans.filter((p) => p.purchasable).sort((a, b) => a.priceCents - b.priceCents);
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export const draftsPerMonthLabel = (n: number) =>
  `${plural(n, "application draft", "application drafts")} a month`;

export const applicationsPerYearLabel = (draftsPerMonth: number) =>
  `Room for ${plural(draftsPerMonth * 12, "application", "applications")} a year`;

export const seatsLabel = (n: number) => `Up to ${plural(n, "team member", "team members")}`;

export const monthlyPrice = (plan: Plan) => formatCents(plan.priceCents);

export const yearlyPriceLabel = (plan: Plan) =>
  plan.annualPriceCents
    ? `or ${formatCents(plan.annualPriceCents)} a year if you pay yearly`
    : null;

/** Lowest monthly price among the plans we sell, e.g. "$5" (null when nothing is for sale). */
export function startingPrice(plans: readonly Plan[] = PLAN_LIST): string | null {
  const first = marketingPlans(plans)[0];
  return first ? monthlyPrice(first) : null;
}
