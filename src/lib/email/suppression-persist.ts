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
