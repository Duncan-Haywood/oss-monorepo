/**
 * Merge inquiry feeds for the dashboard's "Website inquiries" inbox panel.
 */

import type { ClientInquiry } from "./types";

/** Newest-first by createdAt (ISO string comparison, same convention as commerce/orders.ts). */
export function sortInquiriesNewestFirst<T extends { createdAt: string }>(
  inquiries: ReadonlyArray<T>,
): T[] {
  return [...inquiries].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/**
 * Merge listClientInquiries(limit)'s recent-N page (every status, for inbox
 * browsing/history) with listUnrepliedInquiries()'s uncapped unreplied-only
 * feed (new/read) into one deduplicated set, keyed on id. Passing only the
 * capped recent-N page to the dashboard's "Website inquiries" panel silently
 * drops any unreplied inquiry older than the newest N total inquiries once
 * volume exceeds the page window (archived/replied rows count against that
 * window too, so they can push a genuinely-unreplied older row out even
 * faster) — the same "capped debt/liability list" bug class
 * mergeCommerceOrdersForReview exists to prevent for Commerce orders. That
 * inquiry then has no Reply/Archive row anywhere in the dashboard even though
 * pipeline-health's MetricCard hint and the daily digest (both fed from the
 * same uncapped listUnrepliedInquiries()) correctly keep counting it as
 * outstanding — an operator sees "N unreplied, oldest Xh" at the top of the
 * page with no way to find or act on it below (inquiries-inbox-uncapped-
 * unreplied-merge). Pure — no I/O.
 */
export function mergeInquiriesForInbox(
  ...sources: ReadonlyArray<ReadonlyArray<ClientInquiry>>
): ClientInquiry[] {
  const byId = new Map<string, ClientInquiry>();
  for (const source of sources) {
    for (const inquiry of source) {
      byId.set(inquiry.id, inquiry);
    }
  }
  return sortInquiriesNewestFirst([...byId.values()]);
}
