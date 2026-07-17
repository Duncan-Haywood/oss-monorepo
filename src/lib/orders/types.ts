/**
 * Paid checkout orders — written by the Stripe webhook via recordLeadPayment.
 * Amounts are USD dollars (webhook divides Stripe cents by 100).
 */

export interface OrderRecord {
  id: string;
  leadSlug: string;
  stripeSessionId: string;
  /** Stripe Customer id when checkout created/attached one (subscriptions). */
  stripeCustomerId?: string;
  tier: string;
  commerceAddon: boolean;
  /**
   * Unix ms when customer.subscription.deleted marked this recurring order
   * canceled. Absent/undefined means the subscription is still active (or the
   * order never had recurring Prices). Sold monthly entitlements must check
   * orderHasActiveRecurringEntitlement — see src/lib/orders/recurring.ts.
   */
  recurringCanceledAt?: number;
  /** USD dollars (not cents). */
  amountPaid: number;
  status: string;
  createdAt: string;
}

/**
 * Newest-first by createdAt (ISO or comparable string). Matches SQLite
 * `ORDER BY createdAt DESC` and convex/orders.list (createdAt desc) so
 * latestEligibleOrder / Billing Portal stay correct. db.ts keeps calling this
 * even though Convex already sorts — belt-and-suspenders against a future
 * unordered query consumer.
 */
export function sortOrdersNewestFirst<T extends { createdAt: string }>(orders: T[]): T[] {
  return [...orders].sort((a, b) =>
    a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0,
  );
}
