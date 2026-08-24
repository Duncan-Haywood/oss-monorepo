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
  /**
   * Epoch ms of the most recent reason *upgrade* (see preferSuppressionReason)
   * — undefined for a row whose reason has never changed since insert.
   * createdAt itself can't be used for this: Convex's _creationTime is an
   * immutable system field, so a later bounce/complaint on an
   * already-unsubscribed address has no mutable timestamp to record the
   * upgrade against unless this field exists separately. Recency-based reads
   * (the 7-day rolling bounce/complaint window) must use
   * suppressionRecencyMs, never createdAt directly, or an address that
   * unsubscribed long ago and only just hard-bounced today reads as
   * long-since-stale.
   */
  reasonUpdatedAt?: number;
}

/** The timestamp recency reads should compare against — see reasonUpdatedAt. */
export function suppressionRecencyMs(record: SuppressionRecord): number {
  return record.reasonUpdatedAt ?? record.createdAt;
}

/** Legacy rows (written before the reason field shipped) display as unsubscribe. */
export function suppressionReasonOrDefault(reason: SuppressionReason | undefined): SuppressionReason {
  return reason ?? "unsubscribe";
}

const SUPPRESSION_REASON_RANK: Record<SuppressionReason, number> = {
  unsubscribe: 0,
  bounce: 1,
  complaint: 2,
};

/**
 * An address already suppressed for one reason can later trigger a
 * different reason event (e.g. a routine unsubscribe click, then a later
 * hard bounce or spam complaint for that same address). Never downgrade a
 * bounce/complaint back to a routine unsubscribe (the original intent of
 * this table's idempotency, see suppression-reason-visibility), but DO
 * upgrade from unsubscribe/legacy(undefined) to bounce, and from bounce to
 * complaint — a write that only no-ops on an existing row (as both
 * convex/suppressions.ts's `suppress` mutation and db.ts's SQLite fallback
 * originally did) silently discards the more severe, actionable signal and
 * leaves the dashboard panel's badge/copy misrepresenting the address as a
 * low-risk routine opt-out. Mirrors the never-downgrade pattern
 * preferAdvancedHandoffStatus (src/lib/deploy/handoff-preserve.ts) already
 * uses for deploy handoff status.
 */
export function preferSuppressionReason(
  existing: SuppressionReason | undefined,
  incoming: SuppressionReason,
): SuppressionReason {
  const existingRank = SUPPRESSION_REASON_RANK[suppressionReasonOrDefault(existing)];
  const incomingRank = SUPPRESSION_REASON_RANK[incoming];
  return incomingRank > existingRank ? incoming : suppressionReasonOrDefault(existing);
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
    (r) => isBounceOrComplaintSuppression(r) && suppressionRecencyMs(r) >= cutoffMs,
  ).length;
}

/** Hours since the most recent bounce/complaint; null when there has never been one. */
export function newestBounceOrComplaintSuppressionAgeHours(
  records: ReadonlyArray<SuppressionRecord>,
  nowMs: number,
): number | null {
  const newest = records
    .filter(isBounceOrComplaintSuppression)
    .reduce<number | null>((max, r) => {
      const recency = suppressionRecencyMs(r);
      return max === null || recency > max ? recency : max;
    }, null);
  if (newest === null) return null;
  return Math.floor((nowMs - newest) / (60 * 60 * 1000));
}
