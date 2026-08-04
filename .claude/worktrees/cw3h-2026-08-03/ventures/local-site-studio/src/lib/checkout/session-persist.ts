import type { ConvexPrimaryWriteOptions } from "@/lib/payments/convex-primary";

/**
 * Checkout-session create policy for abandoned-cart tracking.
 *
 * When Convex is configured, POST /api/stripe/checkout and
 * POST /api/commerce/checkout must pass CHECKOUT_SESSION_CREATE_CONVEX_PRIMARY
 * so a Convex mutation failure returns 502 instead of writing only to
 * instance-local SQLite. listOpenCheckoutSessions (and therefore
 * listAbandonedCheckoutsDue / listCommerceAbandonedCheckoutsDue / digest)
 * reads Convex-first — a SQLite-only create leaves the cart invisible to
 * other instances and permanently drops Finish-checkout recovery revenue.
 *
 * Mirrors markCheckoutSessionComplete + WEBHOOK_CONVEX_PRIMARY on the
 * webhook complete path (checkout-session-complete-convex-primary).
 */

/** Fail-closed write options for Checkout Session create tracking. */
export const CHECKOUT_SESSION_CREATE_CONVEX_PRIMARY: ConvexPrimaryWriteOptions = {
  requireConvex: true,
};

/**
 * Recovery-sent mark policy for abandoned-cart Finish-checkout / Buy now emails.
 *
 * When Convex is configured, sendCheckoutRecoveryAction and
 * sendCommerceCheckoutRecoveryAction must pass
 * CHECKOUT_RECOVERY_SENT_CONVEX_PRIMARY so a Convex mutation failure does not
 * silently SQLite-fallback after (or before) the operator email. Convex-first
 * listOpenCheckoutSessions would otherwise keep the session due and risk a
 * second nudge (reputation / CAN-SPAM).
 *
 * House pattern: durable mark before send (persist-then-notify). Mark failure
 * surfaces to the operator and no email goes out; send failure after a durable
 * mark leaves the session off the due queue (no automatic re-nudge).
 */

/** Fail-closed write options for abandoned-checkout recoverySentAt marks. */
export const CHECKOUT_RECOVERY_SENT_CONVEX_PRIMARY: ConvexPrimaryWriteOptions = {
  requireConvex: true,
};
