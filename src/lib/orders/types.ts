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
  /**
   * Cumulative USD actually collected for this order across its full
   * lifetime — the initial checkout amount (amountPaid) plus every
   * subsequent subscription-cycle renewal invoice recorded via
   * recordSubscriptionRenewalPayment. Absent/undefined means no renewal has
   * been recorded yet (a brand-new order, a Starter one-time order, or an
   * order created before this field existed) — use orderLifetimeRevenueUsd
   * rather than reading this directly. See revenue-total-usd-renewal-gap.
   */
  lifetimeRevenueUsd?: number;
  /**
   * Stripe Invoice id of the last subscription-cycle renewal counted into
   * lifetimeRevenueUsd — redelivery idempotency marker so a re-sent
   * invoice.paid event never double-counts the same renewal. See
   * revenue-total-usd-renewal-gap.
   */
  lastRenewalInvoiceId?: string;
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
 * Total USD actually collected for this order — falls back to amountPaid
 * (the first billing period only) when lifetimeRevenueUsd is absent, so
 * pre-existing rows and non-recurring (Starter) orders read correctly with
 * no migration/backfill needed. See revenue-total-usd-renewal-gap: before
 * this field existed, revenueTotalUsd summed amountPaid directly, which
 * silently never counted a Growth/Complete/Commerce-addon subscription's
 * renewal invoices past its first billing cycle.
 */
export function orderLifetimeRevenueUsd(
  order: Pick<OrderRecord, "amountPaid" | "lifetimeRevenueUsd">,
): number {
  return typeof order.lifetimeRevenueUsd === "number" &&
    Number.isFinite(order.lifetimeRevenueUsd)
    ? order.lifetimeRevenueUsd
    : order.amountPaid;
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
