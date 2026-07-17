/**
 * Recurring-subscription entitlement helpers for bundle/Commerce orders.
 * customer.subscription.deleted marks orders.recurringCanceledAt; sold
 * monthly capabilities must ignore canceled rows while Billing Portal and
 * Starter-upsell mutual exclusion still treat historical recurring purchases
 * as non-Starter. customer.subscription.created|updated with status
 * active|trialing clears recurringCanceledAt so resubscribers regain packs.
 * past_due|unpaid subscription.updated and invoice.payment_failed (subscription
 * invoices) re-mark recurringCanceledAt so failed renewals pause packs until
 * payment recovers to active|trialing.
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
 * prior customer.subscription.deleted or past_due/unpaid pause. past_due /
 * unpaid must not clear — they pause via stripeSubscriptionPausesRecurringEntitlement.
 */
export function stripeSubscriptionGrantsRecurringEntitlement(
  status: string | null | undefined,
): boolean {
  return status === "active" || status === "trialing";
}

/**
 * Stripe Subscription statuses that pause CRM recurring entitlement while the
 * customer still has a Subscription (failed renewal before cancel). Reuses
 * orders.recurringCanceledAt; active|trialing clear restores after recovery.
 * canceled/incomplete are handled by subscription.deleted / skip (not pause).
 */
export function stripeSubscriptionPausesRecurringEntitlement(
  status: string | null | undefined,
): boolean {
  return status === "past_due" || status === "unpaid";
}

/**
 * True when an invoice.payment_failed event is tied to a Subscription (not a
 * one-time invoice). Only subscription renewals should pause packs/catalog.
 */
export function invoicePaymentFailedPausesRecurringEntitlement(invoice: {
  subscription?: unknown;
}): boolean {
  const sub = invoice.subscription;
  if (typeof sub === "string") {
    return sub.trim().length > 0;
  }
  if (sub && typeof sub === "object" && "id" in sub) {
    const id = (sub as { id: unknown }).id;
    return typeof id === "string" && id.trim().length > 0;
  }
  return false;
}
