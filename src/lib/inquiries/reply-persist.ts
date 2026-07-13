import type { ConvexPrimaryWriteOptions } from "@/lib/payments/convex-primary";

/**
 * Fail-closed write options for operator inquiry reply + status marks.
 *
 * unrepliedInquiryCount / oldestUnrepliedInquiryAgeHours / the daily digest
 * all read Convex-first. replyToInquiryAction must durably mark status=replied
 * BEFORE calling Resend (persist-then-notify — same house pattern as
 * OUTREACH_CADENCE_CONVEX_PRIMARY / CHECKOUT_RECOVERY_SENT_CONVEX_PRIMARY): a
 * SQLite-only replied mark landing after a successful send would leave the
 * inquiry looking unreplied on every other instance and risk a duplicate
 * operator reply to the visitor. Mark-read on composer open /
 * updateInquiryStatusAction is the same split-brain class for new vs read
 * metrics. Mark failure skips the send and surfaces a retry; send failure
 * after a durable mark leaves the inquiry off the unreplied queue until the
 * operator retries from the dashboard (accepted trade-off).
 */
export const INQUIRY_REPLY_CONVEX_PRIMARY: ConvexPrimaryWriteOptions = {
  requireConvex: true,
};
