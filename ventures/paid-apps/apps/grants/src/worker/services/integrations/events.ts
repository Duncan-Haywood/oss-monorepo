// Event builders: what each source of truth may send to chat. Every builder returns titles, counts
// and an app link only. notify() inputs are mapped by kind; their `body` is deliberately dropped
// (it is free text written by other modules), and the fixed per-kind summary is used instead.
import type { IntegrationEventKind } from "@shared/integrations";
import type { NotificationKind } from "@shared/notifications";
import type { StoredIntegrationEvent } from "../../db/schema/integrations";

export interface IntegrationEvent extends StoredIntegrationEvent {
  /** Idempotency key: one delivery per destination per key, ever. */
  dedupeKey: string;
}

const FROM_NOTIFICATION: Partial<Record<NotificationKind, IntegrationEventKind>> = {
  "application.ready_for_review": "ready_for_review",
  "application.needs_info": "needs_info",
  "submission.sent": "submitted",
  "match.top": "top_match",
  // export.ready (personal, admin-only), followup.due and watchlist finds are not sent to chat.
};

/** The chat event for a notify() call, or null when that kind is never sent to chat. */
export function eventFromNotification(input: {
  kind: NotificationKind;
  title: string;
  link?: string | null;
  dedupeKey?: string;
}): IntegrationEvent | null {
  const kind = FROM_NOTIFICATION[input.kind];
  if (!kind || !input.link || !input.dedupeKey) return null;
  return {
    kind,
    title: input.title,
    link: input.link,
    dedupeKey: `notify:${input.dedupeKey}`,
  };
}

/** Counts from the weekly digest (services/digest WeeklyDigest); never the questions or facts. */
export interface WeeklyDigestCounts {
  orgId: string;
  week: string;
  newTopMatches: unknown[];
  closingSoon: unknown[];
  pendingReviews: unknown[];
  needsInfo: unknown[];
  submittedThisWeek: unknown[];
  awardedThisWeek: unknown[];
  factsAwaitingConfirmation: number;
}

export function weeklyDigestEvent(d: WeeklyDigestCounts): IntegrationEvent {
  return {
    kind: "weekly_digest",
    title: `Weekly digest (${d.week})`,
    link: `/orgs/${d.orgId}`,
    dedupeKey: `weekly:${d.week}`,
    counts: [
      { label: "New top matches", value: d.newTopMatches.length },
      { label: "Closing soon", value: d.closingSoon.length },
      { label: "Waiting for review", value: d.pendingReviews.length },
      { label: "Needs information", value: d.needsInfo.length },
      { label: "Submitted", value: d.submittedThisWeek.length },
      { label: "Awarded", value: d.awardedThisWeek.length },
      { label: "Facts to confirm", value: d.factsAwaitingConfirmation },
    ].filter((c) => c.value > 0),
  };
}

export function deadlineReminderEvent(p: {
  orgId: string;
  applicationId: string;
  title: string;
  daysLeft: number;
  /** The threshold (14/7/3/1) that fired, used for idempotency. */
  threshold: number;
}): IntegrationEvent {
  const days = Math.max(0, Math.trunc(p.daysLeft));
  return {
    kind: "deadline_reminder",
    title: `${p.title}: due in ${days} day${days === 1 ? "" : "s"}`,
    link: `/orgs/${p.orgId}/applications/${encodeURIComponent(p.applicationId)}`,
    dedupeKey: `deadline:${p.applicationId}:${p.threshold}`,
    counts: [{ label: "Days left", value: days }],
  };
}
