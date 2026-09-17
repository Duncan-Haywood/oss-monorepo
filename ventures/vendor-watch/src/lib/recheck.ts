// Recheck-due reminders, computed purely from a baseline's own `fetchedAt`.
//
// VENTURE.yaml's first (untested) hypothesis is that a visitor who checks a
// URL once will come back and recheck it later *without being prompted*.
// Nothing on the page currently prompts anyone — the watch list just shows
// when each snapshot was taken and lets a visitor re-check it, silently,
// forever. This adds the prompt: a watched entry that has gone unchecked
// past a fixed interval is flagged, and the list surfaces those first, so a
// returning visitor with several watches sees which ones are actually due
// instead of having to eyeball dates.
//
// No new persisted field: this reads `fetchedAt` off the existing Baseline
// shape, so it works on snapshots saved before this file existed and needs no
// storage migration.

import type { Baseline } from "./baseline-store";

// 30 days: long enough that most terms/privacy pages have not changed, short
// enough to catch a quarterly update before it is old news. Not
// user-configurable yet — see README for why that is a deliberate first cut
// rather than a missing feature.
export const DEFAULT_RECHECK_INTERVAL_DAYS = 30;

export type RecheckStatus = {
  /** Whole days since `fetchedAt`, floored. Never negative. */
  daysSinceChecked: number;
  /** True once `daysSinceChecked` has reached the interval. */
  isDue: boolean;
};

/**
 * `nowIso` defaults to the real current time; a caller passes it explicitly
 * in tests so the result does not depend on when the test runs.
 */
export function recheckStatus(
  fetchedAt: string,
  intervalDays: number = DEFAULT_RECHECK_INTERVAL_DAYS,
  nowIso: string = new Date().toISOString(),
): RecheckStatus {
  const fetchedMs = Date.parse(fetchedAt);
  const nowMs = Date.parse(nowIso);
  // An unparseable timestamp (hand-edited storage, a future format change)
  // reads as "just checked" rather than crashing the watch list or claiming
  // a false positive on staleness.
  if (!Number.isFinite(fetchedMs) || !Number.isFinite(nowMs)) {
    return { daysSinceChecked: 0, isDue: false };
  }
  const daysSinceChecked = Math.max(0, Math.floor((nowMs - fetchedMs) / (24 * 60 * 60 * 1000)));
  return { daysSinceChecked, isDue: daysSinceChecked >= intervalDays };
}

/**
 * Watched baselines ordered for a returning visitor: most overdue first, then
 * most recently checked first among the rest. Stable beyond that (by URL) so
 * the list does not reorder itself between renders when two entries tie.
 */
export function sortByRecheckPriority<T extends Pick<Baseline, "url" | "fetchedAt">>(
  entries: T[],
  intervalDays: number = DEFAULT_RECHECK_INTERVAL_DAYS,
  nowIso: string = new Date().toISOString(),
): T[] {
  return [...entries].sort((a, b) => {
    const statusA = recheckStatus(a.fetchedAt, intervalDays, nowIso);
    const statusB = recheckStatus(b.fetchedAt, intervalDays, nowIso);
    if (statusA.isDue !== statusB.isDue) return statusA.isDue ? -1 : 1;
    if (statusA.daysSinceChecked !== statusB.daysSinceChecked) {
      return statusB.daysSinceChecked - statusA.daysSinceChecked;
    }
    return a.url.localeCompare(b.url);
  });
}
