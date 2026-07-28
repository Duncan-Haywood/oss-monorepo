/**
 * Paid Growth → Complete upsell — pure eligibility + checkout path helpers.
 * See /docs/process (growth-upsell-nudge).
 *
 * Mirrors src/lib/billing/starter-upsell.ts's one-tier-up nudge, extended to
 * the second upgrade step: a live Growth subscriber (marketing pack, no
 * phone agent) has zero automated nudge toward Complete, even though
 * Complete is the only tier with real differentiated value over Growth
 * (seasonal promos + AI phone agent + appointment booking — see BUNDLES in
 * src/lib/pricing/bundles.ts). Unlike starter-upsell.ts, this module cannot
 * reuse orderEligibleForBillingPortal as its negative check — that predicate
 * is true for growth AND complete (it gates Billing vs no-Billing, not
 * Growth vs Complete), so it would wrongly exclude every Growth customer
 * this module exists to target. The negative check here is instead "has an
 * order at the Complete tier" specifically.
 */

import { isOrderDisputed, isOrderRefunded } from "@/lib/orders/types";

/**
 * True for a live Growth order — excludes a Growth order Stripe has refunded
 * or disputed (mirrors isStarterOnlyOrder's refund/dispute exclusion: a
 * refunded/disputed Growth charge is not reliably still a live subscription
 * to upgrade from). commerceAddon is irrelevant here (unlike
 * isStarterOnlyOrder) — Commerce is an orthogonal e-commerce add-on with no
 * overlap with Complete's phone-agent/seasonal-promo value, so a
 * Growth+Commerce lead is still a genuine Growth-upsell candidate.
 */
export function isGrowthOrder(order: {
  tier: string;
  commerceAddon?: boolean;
  refundedAt?: string;
  disputedAt?: string;
}): boolean {
  return order.tier === "growth" && !isOrderRefunded(order) && !isOrderDisputed(order);
}

/**
 * True when any order in the set is at the Complete tier, regardless of
 * refund/dispute status — mirrors starter-upsell's own "already sold, don't
 * re-pitch" reasoning documented there: a refund/dispute is a single-charge
 * event that does not reliably cancel the underlying Subscription, so a
 * lead who has ever bought Complete should never see an "upgrade to
 * Complete" nudge again, whether that specific charge was later disputed or
 * still active.
 */
export function hasCompleteOrder(
  orders: ReadonlyArray<{
    tier: string;
    commerceAddon?: boolean;
    refundedAt?: string;
    disputedAt?: string;
  }>,
): boolean {
  return orders.some((order) => order.tier === "complete");
}

/**
 * Paid/live Growth customers with a usable email and no Complete order yet —
 * the second-step MRR unlock surface for operator-triggered upsell email.
 */
export function leadEligibleForGrowthUpsell(params: {
  stage: string;
  email?: string | null;
  ordersForLead: Array<{
    tier: string;
    commerceAddon?: boolean;
    refundedAt?: string;
    disputedAt?: string;
  }>;
}): boolean {
  if (params.stage !== "paid" && params.stage !== "live") return false;
  if (!params.email?.trim()) return false;
  const orders = params.ordersForLead;
  if (orders.length === 0) return false;
  if (!orders.some(isGrowthOrder)) return false;
  if (hasCompleteOrder(orders)) return false;
  return true;
}

export function buildGrowthUpsellCheckoutPath(slug: string): string {
  const trimmed = slug.trim();
  return `/checkout?slug=${encodeURIComponent(trimmed)}&tier=complete`;
}

/** Paid Growth leads ready for an operator Complete-upsell nudge, slug-sorted for stable UI. */
export function listGrowthUpsellCandidates<
  T extends {
    slug: string;
    stage: string;
    email?: string | null;
  },
>(
  leads: T[],
  orders: Array<{
    leadSlug: string;
    tier: string;
    commerceAddon?: boolean;
    refundedAt?: string;
    disputedAt?: string;
  }>,
): T[] {
  return leads
    .filter((lead) =>
      leadEligibleForGrowthUpsell({
        stage: lead.stage,
        email: lead.email,
        ordersForLead: orders.filter((o) => o.leadSlug === lead.slug),
      }),
    )
    .sort((a, b) => a.slug.localeCompare(b.slug));
}

/**
 * Age in whole hours since the oldest qualifying Growth order among
 * `candidates` was created; null when there are no candidates or none of
 * their orders parse. Pass nowMs from the caller — never Date.now() inside
 * list/age helpers, mirroring oldestStarterUpsellCandidateAgeHours.
 */
export function oldestGrowthUpsellCandidateAgeHours(
  candidates: ReadonlyArray<{ slug: string }>,
  orders: ReadonlyArray<{
    leadSlug: string;
    tier: string;
    refundedAt?: string;
    disputedAt?: string;
    createdAt?: string;
  }>,
  nowMs: number,
): number | null {
  const candidateSlugs = new Set(candidates.map((candidate) => candidate.slug));
  let oldestCreatedAtMs: number | null = null;
  for (const order of orders) {
    if (!candidateSlugs.has(order.leadSlug)) continue;
    if (!isGrowthOrder(order)) continue;
    if (order.createdAt === undefined) continue;
    const createdAtMs = Date.parse(order.createdAt);
    if (Number.isNaN(createdAtMs)) continue;
    if (oldestCreatedAtMs === null || createdAtMs < oldestCreatedAtMs) {
      oldestCreatedAtMs = createdAtMs;
    }
  }
  if (oldestCreatedAtMs === null) return null;
  if (nowMs < oldestCreatedAtMs) return 0;
  return Math.max(0, Math.floor((nowMs - oldestCreatedAtMs) / (60 * 60 * 1000)));
}
