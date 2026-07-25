/**
 * Shared suppression-list domain types + pure helpers.
 *
 * Split out from suppression-persist.ts (which only holds ConvexPrimaryWriteOptions
 * constants) because this type is used by both write call sites (unsubscribe route,
 * Resend webhook route) and read/aggregation call sites (dashboard panel,
 * pipeline-health) — see suppression-reason-visibility.
 */

/**
 * "unsubscribe" = a routine CAN-SPAM opt-out (customer preference, safe to
 * reconsider/remove). "bounce"/"complaint" = a Resend delivery-event signal
 * (deliverability/sender-reputation risk) — see
 * src/app/api/resend/webhook/route.ts. Rows written before this field
 * existed have no reason at all (undefined) and are treated as legacy
 * unsubscribes by every reason-aware read site.
 */
export type SuppressionReason = "unsubscribe" | "bounce" | "complaint";

export interface SuppressionRecord {
  email: string;
  reason?: SuppressionReason;
  createdAt: number;
}

/** Legacy rows (written before the reason field shipped) display as unsubscribe. */
export function suppressionReasonOrDefault(reason: SuppressionReason | undefined): SuppressionReason {
  return reason ?? "unsubscribe";
}

export function isBounceOrComplaintSuppression(record: SuppressionRecord): boolean {
  const reason = suppressionReasonOrDefault(record.reason);
  return reason === "bounce" || reason === "complaint";
}

/**
 * Rolling reputation-risk signal: how many hard bounces/spam complaints
 * landed in the last `windowHours` — a rising count here (unlike the
 * permanently-suppressed total, which only ever grows) is the thing an
 * operator can actually react to (bad list hygiene, a broken capture form,
 * a compromised sending domain).
 */
export function recentBounceOrComplaintSuppressionCount(
  records: ReadonlyArray<SuppressionRecord>,
  nowMs: number,
  windowHours: number,
): number {
  const cutoffMs = nowMs - windowHours * 60 * 60 * 1000;
  return records.filter(
    (r) => isBounceOrComplaintSuppression(r) && r.createdAt >= cutoffMs,
  ).length;
}

/** Hours since the most recent bounce/complaint; null when there has never been one. */
export function newestBounceOrComplaintSuppressionAgeHours(
  records: ReadonlyArray<SuppressionRecord>,
  nowMs: number,
): number | null {
  const newest = records
    .filter(isBounceOrComplaintSuppression)
    .reduce<number | null>(
      (max, r) => (max === null || r.createdAt > max ? r.createdAt : max),
      null,
    );
  if (newest === null) return null;
  return Math.floor((nowMs - newest) / (60 * 60 * 1000));
}
