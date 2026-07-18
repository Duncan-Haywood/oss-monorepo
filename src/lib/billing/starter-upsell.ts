/**
 * Paid Starter → Growth/Complete upsell — pure eligibility + checkout path helpers.
 * See /docs/process (paid-starter-upsell-nudge).
 *
 * Reuses orderEligibleForBillingPortal as the "already has recurring" check so
 * Billing and Upsell buttons never both appear for the same lead/order set —
 * but a refunded/disputed Growth/Complete/Commerce order must not count
 * (see starter-upsell-exclusion-refund-dispute-aware): the customer has no
 * live recurring entitlement left, so it must not block the Starter upsell
 * either. Deliberately NOT orderGrantsSoldCapabilityEntitlement here — that
 * also excludes a merely-canceled (recurringCanceledAt) order, and a former
 * subscriber should still be treated as "already has recurring" for this
 * exclusion, not nudged as if they were Starter-only.
 */

import { isOrderDisputed, isOrderRefunded } from "@/lib/orders/types";
import { orderEligibleForBillingPortal } from "./portal";

function isLiveRecurringOrder(order: {
  tier: string;
  commerceAddon: boolean;
  refundedAt?: string;
  disputedAt?: string;
}): boolean {
  return (
    orderEligibleForBillingPortal(order) &&
    !isOrderRefunded(order) &&
    !isOrderDisputed(order)
  );
}

export type UpsellTargetTier = "growth" | "complete";

/**
 * True for a live Starter-only purchase — excludes Growth/Complete/Commerce
 * orders AND a Starter order Stripe has refunded or disputed. A refunded
 * customer no longer has a live one-time purchase to upsell off of; nudging
 * them toward a paid recurring upgrade is a real customer-relations misfire,
 * not just a wasted send (see starter-upsell-refund-dispute-exclusion).
 */
export function isStarterOnlyOrder(order: {
  tier: string;
  commerceAddon: boolean;
  refundedAt?: string;
  disputedAt?: string;
}): boolean {
  return (
    order.tier === "starter" &&
    !order.commerceAddon &&
    !isOrderRefunded(order) &&
    !isOrderDisputed(order)
  );
}

/**
 * Paid/live Starter customers with a usable email and no Growth/Complete/Commerce
 * order yet — the MRR unlock surface for operator-triggered upsell email.
 */
export function leadEligibleForStarterUpsell(params: {
  stage: string;
  email?: string | null;
  ordersForLead: Array<{
    tier: string;
    commerceAddon: boolean;
    refundedAt?: string;
    disputedAt?: string;
  }>;
}): boolean {
  if (params.stage !== "paid" && params.stage !== "live") return false;
  if (!params.email?.trim()) return false;
  const orders = params.ordersForLead;
  if (orders.length === 0) return false;
  if (!orders.some(isStarterOnlyOrder)) return false;
  // Inverse of Billing portal eligibility — a live (non-refunded/disputed)
  // recurring order already sold ⇒ no upsell.
  if (orders.some(isLiveRecurringOrder)) return false;
  return true;
}

/**
 * Prefer Complete when the lead was scored/recommended that way; otherwise Growth
 * (the default MRR step from one-time Starter). Never upsell back to Starter.
 */
export function resolveUpsellTargetTier(
  recommendedTier: string | undefined | null,
): UpsellTargetTier {
  if (recommendedTier === "complete") return "complete";
  return "growth";
}

export function buildStarterUpsellCheckoutPath(
  slug: string,
  tier: UpsellTargetTier,
): string {
  const trimmed = slug.trim();
  return `/checkout?slug=${encodeURIComponent(trimmed)}&tier=${encodeURIComponent(tier)}`;
}

/** Paid Starter leads ready for an operator upsell nudge, slug-sorted for stable UI. */
export function listStarterUpsellCandidates<
  T extends {
    slug: string;
    stage: string;
    email?: string | null;
  },
>(
  leads: T[],
  orders: Array<{ leadSlug: string; tier: string; commerceAddon: boolean }>,
): T[] {
  return leads
    .filter((lead) =>
      leadEligibleForStarterUpsell({
        stage: lead.stage,
        email: lead.email,
        ordersForLead: orders.filter((o) => o.leadSlug === lead.slug),
      }),
    )
    .sort((a, b) => a.slug.localeCompare(b.slug));
}

/**
 * Age in whole hours since the oldest qualifying Starter-only order among
 * `candidates` was created; null when there are no candidates or none of
 * their orders parse. Pass nowMs from the caller — never Date.now() inside
 * list/age helpers (keeps tests deterministic, see
 * oldestRecurringEntitlementPausedAgeHours for the same pattern).
 *
 * `createdAt` is optional (not required, unlike a raw OrderRecord) so this
 * also accepts daily-digest.ts's lighter orders shape — same
 * optional-and-skip-unparseable pattern as oldestMarketingPacksDueAgeHours /
 * oldestCommerceCatalogCandidateAgeHours / oldestClientVoicePacksDueAgeHours.
 */
export function oldestStarterUpsellCandidateAgeHours(
  candidates: ReadonlyArray<{ slug: string }>,
  orders: ReadonlyArray<{
    leadSlug: string;
    tier: string;
    commerceAddon: boolean;
    createdAt?: string;
  }>,
  nowMs: number,
): number | null {
  const candidateSlugs = new Set(candidates.map((candidate) => candidate.slug));
  let oldestCreatedAtMs: number | null = null;
  for (const order of orders) {
    if (!candidateSlugs.has(order.leadSlug)) continue;
    if (!isStarterOnlyOrder(order)) continue;
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
