/**
 * Stripe Billing Portal helpers — self-serve card/invoice/cancel for
 * Growth/Complete/Commerce subscribers. See /docs/process (stripe-billing-portal).
 */

/** Bundles that include a recurring Stripe Price (or Commerce add-on). */
export function orderEligibleForBillingPortal(order: {
  tier: string;
  commerceAddon: boolean;
}): boolean {
  if (order.commerceAddon) return true;
  return order.tier === "growth" || order.tier === "complete";
}

/**
 * Normalize Checkout Session / Customer references to a customer id string.
 * Stripe may return an expanded Customer object or a plain id.
 */
export function stripeCustomerIdFromUnknown(
  customer: string | { id?: string } | null | undefined,
): string | null {
  if (!customer) return null;
  if (typeof customer === "string") {
    const trimmed = customer.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof customer === "object" && typeof customer.id === "string") {
    const trimmed = customer.id.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  return null;
}

/** Pick the newest eligible paid order for a lead (list is newest-first). */
export function latestEligibleOrder<T extends { tier: string; commerceAddon: boolean }>(
  orders: T[],
): T | null {
  for (const order of orders) {
    if (orderEligibleForBillingPortal(order)) return order;
  }
  return null;
}
