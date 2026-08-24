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
import { orderRecurringIsCanceled } from "@/lib/orders/recurring";
import type { BundleBillingInterval } from "@/lib/pricing/bundles";

/**
 * True for a live Growth order — excludes a Growth order Stripe has refunded
 * or disputed (mirrors isStarterOnlyOrder's refund/dispute exclusion: a
 * refunded/disputed Growth charge is not reliably still a live subscription
 * to upgrade from), AND excludes a Growth order whose Subscription
 * customer.subscription.deleted already canceled (orders.recurringCanceledAt
 * — see src/lib/orders/recurring.ts's own file-level invariant: "sold
 * monthly capabilities must ignore canceled rows"). Unlike Billing Portal
 * (orderEligibleForBillingPortal, deliberately true for a canceled
 * subscriber so they can self-serve resubscribe), this is a positive
 * "actively running Growth today" check — pitching sendGrowthUpsellEmail's
 * "Your marketing is already running on Growth" copy at a lapsed subscriber
 * would be false, and nudging a $99/mo upgrade to $199/mo for a subscription
 * that no longer exists doesn't make sense; they need to resubscribe first,
 * unrelated to this upgrade nudge. See growth-upsell-canceled-exclusion.
 * commerceAddon is irrelevant here (unlike isStarterOnlyOrder) — Commerce is
 * an orthogonal e-commerce add-on with no overlap with Complete's
 * phone-agent/seasonal-promo value, so a Growth+Commerce lead is still a
 * genuine Growth-upsell candidate.
 */
export function isGrowthOrder(order: {
  tier: string;
  commerceAddon?: boolean;
  refundedAt?: string;
  disputedAt?: string;
  recurringCanceledAt?: number | null;
}): boolean {
  return (
    order.tier === "growth" &&
    !isOrderRefunded(order) &&
    !isOrderDisputed(order) &&
    !orderRecurringIsCanceled(order)
  );
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
    recurringCanceledAt?: number | null;
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

/**
 * billingInterval carries the customer's existing Growth cadence onto the
 * Complete checkout link — unlike buildStarterUpsellCheckoutPath (a
 * brand-new subscriber choosing a cadence for the first time, since Starter
 * has no recurring price of its own), a Growth subscriber upgrading to
 * Complete already has a live annual or monthly Subscription; omitting this
 * silently switches an annual subscriber to Monthly the moment they land on
 * /checkout (checkout-form.tsx defaults billingInterval to "monthly" for a
 * missing/unrecognized param, same as parseBundleBillingInterval). See
 * growth-upsell-annual-billing-carry-through.
 */
export function buildGrowthUpsellCheckoutPath(
  slug: string,
  billingInterval?: BundleBillingInterval,
): string {
  const trimmed = slug.trim();
  const billingParam = billingInterval === "annual" ? "&billing=annual" : "";
  return `/checkout?slug=${encodeURIComponent(trimmed)}&tier=complete${billingParam}`;
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
    recurringCanceledAt?: number | null;
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
    recurringCanceledAt?: number | null;
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

/**
 * " · $199/mo" / " · $1990/yr" — the dashboard candidate-row price suffix for
 * /dashboard/leads' Growth → Complete panel. growth-upsell-annual-billing-
 * carry-through taught the actual send path (buildGrowthUpsellCheckoutPath /
 * sendGrowthUpsellEmail) to quote a live annual Growth subscriber's real
 * $1990/yr cadence instead of always "$199/mo", but never touched this
 * operator-facing row — an operator reading "$199/mo" right before clicking
 * Send saw a different number than the email/link that click actually
 * produces for an annual subscriber. billingInterval defaults to "monthly"
 * so an unresolved lookup (see resolveGrowthUpsellCandidateBillingIntervals)
 * degrades to the original, always-correct-for-monthly display rather than
 * showing nothing. See growth-upsell-dashboard-candidate-annual-billing-display.
 */
export function growthUpsellCandidatePriceSuffix(
  bundle: { monthlyPriceUsd: number | null; annualPriceUsd?: number | null } | undefined,
  billingInterval: BundleBillingInterval = "monthly",
): string | null {
  if (!bundle) return null;
  if (billingInterval === "annual" && bundle.annualPriceUsd != null) {
    return ` · $${bundle.annualPriceUsd}/yr`;
  }
  return bundle.monthlyPriceUsd != null ? ` · $${bundle.monthlyPriceUsd}/mo` : null;
}
