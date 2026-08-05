import {
  getGelatoFulfillmentStoreDescriptor,
  getGelatoFulfillmentSubmissions,
  type GelatoOrderSubmission,
} from "./gelato-orders";
import {
  describeFulfillmentRecordCompleteness,
  type FulfillmentRecordCompleteness,
} from "./fulfillment-submission-store";
import {
  getPrintfulFulfillmentStoreDescriptor,
  getPrintfulFulfillmentSubmissions,
  type PrintfulOrderSubmission,
} from "./printful-orders";

export type FulfillmentSubmissionRecord = PrintfulOrderSubmission | GelatoOrderSubmission;

export type FulfillmentSubmissionSummary = {
  totalSubmissions: number;
  submittedCount: number;
  queuedCount: number;
  blockedCount: number;
  skippedCount: number;
  apiSubmitCount: number;
  dryRunCount: number;
  printfulCount: number;
  gelatoCount: number;
  fulfillmentReady: boolean;
  recentSubmissions: FulfillmentSubmissionRecord[];
  blockers: string[];
  /**
   * What these counts can vouch for. Every number above is derived from the
   * submission stores, so a store that forgets makes them a lower bound —
   * `blockedCount` most of all, because a blocked submission that is not
   * counted is a paid order nobody is told about.
   */
  completeness: FulfillmentRecordCompleteness;
};

function getAllFulfillmentSubmissions(): FulfillmentSubmissionRecord[] {
  return [...getPrintfulFulfillmentSubmissions(), ...getGelatoFulfillmentSubmissions()].sort(
    (left, right) => right.orderId.localeCompare(left.orderId),
  );
}

export function buildFulfillmentSubmissionSummary(
  submissions: FulfillmentSubmissionRecord[] = getAllFulfillmentSubmissions(),
): FulfillmentSubmissionSummary {
  const submittedCount = submissions.filter((item) => item.status === "submitted").length;
  const queuedCount = submissions.filter((item) => item.status === "queued").length;
  const blockedCount = submissions.filter((item) => item.status === "blocked").length;
  const skippedCount = submissions.filter((item) => item.status === "skipped").length;
  const apiSubmitCount = submissions.filter((item) => item.mode === "api_submit").length;
  const dryRunCount = submissions.filter((item) => item.mode === "dry_run").length;
  const printfulCount = submissions.filter((item) => item.partner === "printful").length;
  const gelatoCount = submissions.filter((item) => item.partner === "gelato").length;

  const completeness = describeFulfillmentRecordCompleteness([
    getPrintfulFulfillmentStoreDescriptor(),
    getGelatoFulfillmentStoreDescriptor(),
  ]);

  const blockers: string[] = [];
  if (submissions.length === 0) {
    blockers.push("No fulfillment submissions yet — complete a Stripe test checkout");
  }
  if (!completeness.complete && completeness.reason) {
    blockers.push(completeness.reason);
  }
  if (blockedCount > 0) {
    blockers.push(`${blockedCount} submission(s) blocked by fulfillment API errors`);
  }
  if (queuedCount > 0 && apiSubmitCount === 0) {
    blockers.push(
      "Submissions queued in dry-run — configure Printful or Gelato credentials at /partner-setup",
    );
  }

  return {
    totalSubmissions: submissions.length,
    submittedCount,
    queuedCount,
    blockedCount,
    skippedCount,
    apiSubmitCount,
    dryRunCount,
    printfulCount,
    gelatoCount,
    fulfillmentReady: submittedCount > 0 && blockedCount === 0,
    // The bound on what an operator *sees*. It is deliberately separate from the
    // bound on what *exists* — collapsing the two is what the evicting store did.
    recentSubmissions: submissions.slice(0, 12),
    blockers,
    completeness,
  };
}
