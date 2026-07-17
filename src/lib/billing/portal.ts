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
 * Checkout-Session path eligibility for Billing Portal / success-page CTA.
 *
 * Create path always sets `mode: "subscription"` when Growth/Complete or
 * Starter+Commerce Prices are on the Session (`hasRecurring`). Payment-mode
 * sessions are Starter one-time only — trusting `metadata.tier ===
 * "growth"|"complete"` here would only help Dashboard-minted / tampered
 * Sessions open Manage billing without a recurring Price.
 *
 * Pass `commerceAddon` already proven (line-item Price IDs on the API path;
 * metadata is acceptable only as a soft SSR hint until the success-page twin
 * also lists line items). Never pass raw metadata.tier into this helper.
 */
export function checkoutSessionEligibleForBillingPortal(input: {
  mode?: string | null;
  commerceAddon: boolean;
  /**
   * Subscription mode must prove a create-path catalog recurring Price is on
   * listLineItems (Growth/Complete/Commerce monthly). mode===subscription alone
   * is not enough — Dashboard-minted sessions can use any Price.
   */
  catalogRecurringProven?: boolean;
}): boolean {
  if (input.mode === "subscription") {
    return input.catalogRecurringProven === true;
  }
  return input.commerceAddon;
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
