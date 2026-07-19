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
  /**
   * ISO timestamp when Stripe charge.refunded (full or partial) resolved to
   * this bundle order's Checkout Session. Absent/undefined means never
   * refunded. See isOrderRefunded / bundle-order-refund-tracking.
   */
  refundedAt?: string;
  /**
   * ISO timestamp when Stripe charge.dispute.created (or dispute.closed lost)
   * resolved to this bundle order's Checkout Session. Cleared by
   * charge.dispute.closed when status is won / warning_closed. See
   * isOrderDisputed / bundle-order-dispute-tracking.
   */
  disputedAt?: string;
}

/** True when Stripe has refunded (fully or partially) this bundle order's charge. */
export function isOrderRefunded(order: Pick<OrderRecord, "refundedAt">): boolean {
  return Boolean(order.refundedAt);
}

/** True when Stripe has an open or lost dispute on this bundle order's charge. */
export function isOrderDisputed(order: Pick<OrderRecord, "disputedAt">): boolean {
  return Boolean(order.disputedAt);
}

/**
 * Bundle revenue that still counts toward pipeline-health revenueTotalUsd —
 * excludes refunded and disputed orders (Stripe has returned or debited the
 * funds). See bundle-order-refund-tracking / bundle-order-dispute-tracking.
 */
export function orderCountsTowardRevenue(
  order: Pick<OrderRecord, "refundedAt" | "disputedAt">,
): boolean {
  return !isOrderRefunded(order) && !isOrderDisputed(order);
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

/**
 * Stable app-owned id for a new SQLite-fallback bundle order row (see
 * leads-sqlite-id-collision-guard). The prior generator was
 * `order_${Date.now()}` — millisecond-only, same collision-prone class as the
 * pre-fix lead/inquiry id generators. `orders.id` is a SQLite PRIMARY KEY, so
 * two orders inserted in the same millisecond (e.g. two Stripe webhook
 * deliveries processed back-to-back) throw a constraint-violation error on
 * INSERT instead of silently colliding.
 */
export function newOrderId(): string {
  return `order_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
