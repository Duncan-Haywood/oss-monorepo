// past_due grace period: a failed renewal does not block drafting at once. Paddle retries the
// payment (dunning) for several days; the org keeps drafting for PAST_DUE_GRACE_DAYS from the first
// past_due event, sees a banner (GET /billing `graceUntil`), and is blocked after that.
import type { SubscriptionStatus } from "@shared/enums";

/** Days a past_due subscription may keep drafting, counted from its first past_due event. */
export const PAST_DUE_GRACE_DAYS = 7;
export const PAST_DUE_GRACE_MS = PAST_DUE_GRACE_DAYS * 24 * 60 * 60 * 1000;

/**
 * End of the grace period for a past_due subscription, or null when the status is not past_due or
 * the start is unknown (rows that went past_due before grace tracking get no grace).
 */
export function pastDueGraceUntil(
  status: SubscriptionStatus,
  pastDueSince: Date | null,
): Date | null {
  if (status !== "past_due" || !pastDueSince) return null;
  return new Date(pastDueSince.getTime() + PAST_DUE_GRACE_MS);
}

export function isWithinPastDueGrace(
  status: SubscriptionStatus,
  pastDueSince: Date | null,
  now: Date,
): boolean {
  const until = pastDueGraceUntil(status, pastDueSince);
  return until !== null && now.getTime() < until.getTime();
}
