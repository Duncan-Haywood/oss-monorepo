import type { ConvexPrimaryWriteOptions } from "@/lib/payments/convex-primary";

/**
 * Unsubscribe success policy for CAN-SPAM suppression writes.
 *
 * When Convex is configured, GET /api/unsubscribe must pass
 * UNSUBSCRIBE_CONVEX_PRIMARY so a Convex mutation failure returns 500
 * instead of writing only to instance-local SQLite (other instances'
 * isEmailSuppressed reads Convex-first and would keep sending).
 *
 * Visitor retry is the recovery path — same class of fix as
 * CONTACT_FORM_CONVEX_PRIMARY on POST /api/contact/[slug].
 */

/** Fail-closed write options for public unsubscribe suppression inserts. */
export const UNSUBSCRIBE_CONVEX_PRIMARY: ConvexPrimaryWriteOptions = {
  requireConvex: true,
};

/**
 * Fail-closed write options for the operator dashboard's unsuppress
 * (opt-back-in) control. Same requireConvex reasoning as
 * UNSUBSCRIBE_CONVEX_PRIMARY, but the failure mode without it is worse than
 * "stays suppressed": isEmailSuppressed reads Convex-first, so a Convex
 * mutation failure silently soft-falling back to SQLite here would let the
 * action report success while every Convex-primary read — including this
 * same instance's very next one — still finds the address suppressed. That
 * is a silent no-op dressed up as a success, the same bug class
 * update-lead-stage-action-existence-check closed for a missing slug.
 */
export const OPERATOR_UNSUPPRESS_CONVEX_PRIMARY: ConvexPrimaryWriteOptions = {
  requireConvex: true,
};
