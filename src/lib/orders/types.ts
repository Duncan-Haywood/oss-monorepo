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
  /** USD dollars (not cents). */
  amountPaid: number;
  status: string;
  createdAt: string;
}

/**
 * Newest-first by createdAt (ISO or comparable string). Matches SQLite
 * `ORDER BY createdAt DESC` so latestEligibleOrder / Billing Portal stay correct
 * when orders come from Convex (unordered .collect()).
 */
export function sortOrdersNewestFirst<T extends { createdAt: string }>(orders: T[]): T[] {
  return [...orders].sort((a, b) =>
    a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0,
  );
}
