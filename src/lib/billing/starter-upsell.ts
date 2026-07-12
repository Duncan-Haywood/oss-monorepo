/**
 * Paid Starter → Growth/Complete upsell — pure eligibility + checkout path helpers.
 * See /docs/process (paid-starter-upsell-nudge).
 *
 * Reuses orderEligibleForBillingPortal as the "already has recurring" check so
 * Billing and Upsell buttons never both appear for the same lead/order set.
 */

import { orderEligibleForBillingPortal } from "./portal";

export type UpsellTargetTier = "growth" | "complete";

export function isStarterOnlyOrder(order: {
  tier: string;
  commerceAddon: boolean;
}): boolean {
  return order.tier === "starter" && !order.commerceAddon;
}

/**
 * Paid/live Starter customers with a usable email and no Growth/Complete/Commerce
 * order yet — the MRR unlock surface for operator-triggered upsell email.
 */
export function leadEligibleForStarterUpsell(params: {
  stage: string;
  email?: string | null;
  ordersForLead: Array<{ tier: string; commerceAddon: boolean }>;
}): boolean {
  if (params.stage !== "paid" && params.stage !== "live") return false;
  if (!params.email?.trim()) return false;
  const orders = params.ordersForLead;
  if (orders.length === 0) return false;
  if (!orders.some(isStarterOnlyOrder)) return false;
  // Inverse of Billing portal eligibility — recurring already sold ⇒ no upsell.
  if (orders.some(orderEligibleForBillingPortal)) return false;
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
