import {
  getPrintfulFulfillmentSubmissions,
  type PrintfulOrderSubmission,
} from "./printful-orders";

export type FulfillmentSubmissionRecord = PrintfulOrderSubmission;

export type FulfillmentSubmissionSummary = {
  totalSubmissions: number;
  submittedCount: number;
  queuedCount: number;
  blockedCount: number;
  skippedCount: number;
  apiSubmitCount: number;
  dryRunCount: number;
  fulfillmentReady: boolean;
  recentSubmissions: FulfillmentSubmissionRecord[];
  blockers: string[];
};

export function buildFulfillmentSubmissionSummary(
  submissions: FulfillmentSubmissionRecord[] = getPrintfulFulfillmentSubmissions(),
): FulfillmentSubmissionSummary {
  const submittedCount = submissions.filter((item) => item.status === "submitted").length;
  const queuedCount = submissions.filter((item) => item.status === "queued").length;
  const blockedCount = submissions.filter((item) => item.status === "blocked").length;
  const skippedCount = submissions.filter((item) => item.status === "skipped").length;
  const apiSubmitCount = submissions.filter((item) => item.mode === "api_submit").length;
  const dryRunCount = submissions.filter((item) => item.mode === "dry_run").length;

  const blockers: string[] = [];
  if (submissions.length === 0) {
    blockers.push("No fulfillment submissions yet — complete a Stripe test checkout");
  }
  if (blockedCount > 0) {
    blockers.push(`${blockedCount} submission(s) blocked by Printful API errors`);
  }
  if (queuedCount > 0 && apiSubmitCount === 0) {
    blockers.push("Submissions queued in dry-run — configure PRINTFUL_API_KEY and PRINTFUL_STORE_ID");
  }

  return {
    totalSubmissions: submissions.length,
    submittedCount,
    queuedCount,
    blockedCount,
    skippedCount,
    apiSubmitCount,
    dryRunCount,
    fulfillmentReady: submittedCount > 0 && blockedCount === 0,
    recentSubmissions: submissions.slice(0, 12),
    blockers,
  };
}
