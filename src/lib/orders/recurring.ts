/**
 * Recurring-subscription entitlement helpers for bundle/Commerce orders.
 * customer.subscription.deleted marks orders.recurringCanceledAt; sold
 * monthly capabilities must ignore canceled rows while Billing Portal and
 * Starter-upsell mutual exclusion still treat historical recurring purchases
 * as non-Starter. customer.subscription.created|updated with status
 * active|trialing clears recurringCanceledAt so resubscribers regain packs.
 */

/** True when the order ever carried a Growth/Complete/Commerce recurring Price. */
export function orderHadRecurringEntitlement(order: {
  tier: string;
  commerceAddon: boolean;
}): boolean {
  if (order.commerceAddon) return true;
  return order.tier === "growth" || order.tier === "complete";
}

/** True when recurringCanceledAt is a finite positive timestamp. */
export function orderRecurringIsCanceled(order: {
  recurringCanceledAt?: number | null;
}): boolean {
  const at = order.recurringCanceledAt;
  return typeof at === "number" && Number.isFinite(at) && at > 0;
}

/**
 * Active sold entitlement for marketing packs / voice packs / commerce catalog.
 * Canceled subscribers keep stage=paid|live and Billing Portal access, but must
 * not keep receiving monthly fulfillment.
 */
export function orderHasActiveRecurringEntitlement(order: {
  tier: string;
  commerceAddon: boolean;
  recurringCanceledAt?: number | null;
}): boolean {
  return orderHadRecurringEntitlement(order) && !orderRecurringIsCanceled(order);
}

/**
 * Stripe Subscription statuses that restore CRM recurring entitlement after a
 * prior customer.subscription.deleted. past_due / unpaid stay canceled in CRM
 * until payment recovers to active|trialing (invoice.payment_failed pause is a
 * separate residual — do not clear on those statuses).
 */
export function stripeSubscriptionGrantsRecurringEntitlement(
  status: string | null | undefined,
): boolean {
  return status === "active" || status === "trialing";
}
