// "What's new?" nudges for other modules (digest email, dashboard next best actions). Pure.
import { CHECK_IN_AFTER_DAYS, checkInDue } from "@shared/fact-staleness";

/** The weekly digest goes out on Mondays: the first one of a month falls on day 1–7 (UTC). */
export function isFirstDigestOfMonth(now: Date): boolean {
  return now.getUTCDate() <= 7;
}

export interface CheckInNudge {
  title: string;
  body: string;
  /** Path under /orgs/:orgId. */
  path: string;
  cta: string;
}

/** The monthly digest block: shown in the first digest of each month. */
export function digestCheckInNudge(now: Date): CheckInNudge | null {
  if (!isFirstDigestOfMonth(now)) return null;
  return {
    title: "What's new?",
    body: "New programs, this period's results, staff or board changes, grants won, new partners or a new budget? A two-minute update keeps your applications current.",
    path: "/",
    cta: "Share an update",
  };
}

/** The dashboard next-best-action: when the last update is older than 30 days (or never). */
export function dashboardCheckInNudge(
  lastUpdateAt: string | Date | null | undefined,
  now: Date,
): CheckInNudge | null {
  if (!checkInDue(lastUpdateAt, now)) return null;
  return {
    title: "What's new? Share an update",
    body: lastUpdateAt
      ? `Your last update was more than ${CHECK_IN_AFTER_DAYS} days ago. Tell us what changed so drafts use current facts.`
      : "Tell us what changed recently so drafts use current facts.",
    path: "/",
    cta: "Share an update",
  };
}
