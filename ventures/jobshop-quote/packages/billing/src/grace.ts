// past_due grace period: a failed renewal does not cut an org off at once. Paddle retries the payment
// (dunning) for several days; the org keeps its entitlement for `graceDays` from the FIRST past_due
// event, sees a banner (graceUntil), and is blocked after that.
import type { SubscriptionStatus } from "./entitlement.ts";

/** Default days a past_due subscription keeps its entitlement, counted from its first past_due event. */
export const PAST_DUE_GRACE_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;
export const PAST_DUE_GRACE_MS = PAST_DUE_GRACE_DAYS * DAY_MS;

/**
 * End of the grace period for a past_due subscription, or null when the status is not past_due or
 * the start is unknown (rows that went past_due before grace tracking get no grace).
 */
export function pastDueGraceUntil(
  status: SubscriptionStatus,
  pastDueSince: Date | null,
  graceDays = PAST_DUE_GRACE_DAYS,
): Date | null {
  if (status !== "past_due" || !pastDueSince) return null;
  return new Date(pastDueSince.getTime() + graceDays * DAY_MS);
}

export function isWithinPastDueGrace(
  status: SubscriptionStatus,
  pastDueSince: Date | null,
  now: Date,
  graceDays = PAST_DUE_GRACE_DAYS,
): boolean {
  const until = pastDueGraceUntil(status, pastDueSince, graceDays);
  return until !== null && now.getTime() < until.getTime();
}

/**
 * The past_due start to store after applying an event with `nextStatus`: kept from the first past_due
 * event of the same subscription, set to `eventTime` on a new past_due, cleared (null) otherwise.
 */
export function nextPastDueSince(
  current: { status: SubscriptionStatus; pastDueSince: Date | null } | null,
  sameSubscription: boolean,
  nextStatus: SubscriptionStatus,
  eventTime: Date,
): Date | null {
  if (nextStatus !== "past_due") return null;
  if (sameSubscription && current?.status === "past_due" && current.pastDueSince) {
    return current.pastDueSince;
  }
  return eventTime;
}
