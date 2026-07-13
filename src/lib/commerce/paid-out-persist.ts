import type { ConvexPrimaryWriteOptions } from "@/lib/payments/convex-primary";

/**
 * Commerce Mark paid out policy for pass-through payout reconciliation.
 *
 * When Convex is configured, markCommerceOrderPaidOutAction must pass
 * COMMERCE_PAID_OUT_CONVEX_PRIMARY so a Convex mutation failure surfaces to
 * the operator instead of writing only to instance-local SQLite.
 * listUnpaidCommerceOrders / summarizeCommerceOrdersByLead / pipeline-health unpaid
 * owed totals read Convex-first — a SQLite-only paidOutAt leaves the order
 * looking owed on other instances and risks double-paying the client until
 * Stripe Connect ships. Mark paid out looks up via getCommerceOrderByStripeSessionId
 * (never a truncated listCommerceOrders scan).
 *
 * Mirrors CHECKOUT_RECOVERY_SENT_CONVEX_PRIMARY (operator action, fail closed,
 * operator retries). Dashboard keeps the Convex→SQLite fallback when Convex
 * is not configured.
 */

/** Fail-closed write options for commerceOrders.paidOutAt marks. */
export const COMMERCE_PAID_OUT_CONVEX_PRIMARY: ConvexPrimaryWriteOptions = {
  requireConvex: true,
};
