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

/**
 * Fail-closed write options for the Stripe Connect onboarding status cache
 * (updateLeadStripeConnectStatus's stripeConnectChargesEnabled/
 * stripeConnectPayoutsEnabled/stripeConnectDetailsSubmitted/
 * stripeConnectStatusCheckedAt fields).
 *
 * getLeads/getLeadBySlug read Convex-first, and connectOnboardingIncompleteCount
 * (pipeline-health/digest) reads this cache across every instance. Without
 * requireConvex, a Convex mutation failure here silently wrote the freshly
 * checked status to instance-local SQLite only — a Convex-backed deployment's
 * getLeads() would keep serving the stale pre-check value on every other
 * instance until the operator happened to re-click "Check status" and Convex
 * happened to succeed, the same split-brain shape LEAD_STRIPE_CONNECT_CONVEX_PRIMARY
 * exists to prevent for the account id itself (see
 * stripe-connect-status-cache-convex-fail-closed). The caller
 * (checkStripeConnectAccountStatusAction) still wraps the persist call in a
 * try/catch that swallows any resulting ConvexPrimaryWriteError — an
 * already-successful live status check must never be reported as an error —
 * so fail-closed here means "skip persistence," not "fail the request."
 */
export const LEAD_STRIPE_CONNECT_STATUS_CONVEX_PRIMARY: ConvexPrimaryWriteOptions = {
  requireConvex: true,
};
