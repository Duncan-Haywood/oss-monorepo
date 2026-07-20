import type { ConvexPrimaryWriteOptions } from "@/lib/payments/convex-primary";

/**
 * Fail-closed write options for a lead's stripeConnectAccountId
 * (updateLeadStripeConnectAccountId).
 *
 * getLeads/getLeadBySlug read Convex-first. createStripeConnectAccountAction
 * must pass LEAD_STRIPE_CONNECT_CONVEX_PRIMARY so a Convex mutation failure
 * surfaces to the operator instead of writing only to instance-local SQLite —
 * otherwise a Connect account created on Stripe (idempotent, so a retry finds
 * it again via metadata search — see createExpressConnectAccount) would
 * silently fail to persist its id on every OTHER instance, which would each
 * try to look it up fresh instead of reusing the same account.
 *
 * Mirrors LEAD_NOTES_CONVEX_PRIMARY / LEAD_SNOOZE_CONVEX_PRIMARY (operator
 * action, fail closed, operator retries). Dashboard keeps the Convex→SQLite
 * fallback when Convex is not configured.
 */

/** Fail-closed write options for lead.stripeConnectAccountId marks. */
export const LEAD_STRIPE_CONNECT_CONVEX_PRIMARY: ConvexPrimaryWriteOptions = {
  requireConvex: true,
};
