import type { ConvexPrimaryWriteOptions } from "@/lib/payments/convex-primary";

/**
 * Fail-closed write options for the outreach cadence mark (recordLeadOutreach).
 *
 * isFollowUpDue / pipeline-health / the daily digest all read Convex-first.
 * Email 1/2/3 actions must durably mark outreachStep + lastOutreachAt BEFORE
 * calling Resend (persist-then-notify — same house pattern as
 * CHECKOUT_RECOVERY_SENT_CONVEX_PRIMARY): a SQLite-only mark landing after a
 * successful send would leave the lead looking due for that same step on
 * every other instance, risking a duplicate Email 2/3 (CAN-SPAM / reputation
 * risk). Mark failure skips the send and surfaces a retry to the operator;
 * send failure after a durable mark leaves the lead off the due queue for
 * that step until the operator retries from the dashboard (accepted
 * trade-off — matches recoverySentAt).
 */
export const OUTREACH_CADENCE_CONVEX_PRIMARY: ConvexPrimaryWriteOptions = {
  requireConvex: true,
};
