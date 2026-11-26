// Reminders and digests to the org's team: due follow-ups, deadline reminders and the weekly digest.
import type { ReviewTier } from "@shared/enums";
import { display, formatDate, formatMoney, optional, plural, seg, tierLabel } from "../format";
import type { Block, EmailContent, ListItem, TemplateContext } from "../layout";
import { teamReason } from "./applications";

// ---- followupDue -----------------------------------------------------------------------------

export interface FollowupDueData {
  orgId: string;
  orgName?: string | null;
  title: string;
  applicationTitle?: string | null;
  dueAt: Date | string;
  notes?: string | null;
}

export function followupDue(d: FollowupDueData, t: TemplateContext): EmailContent {
  const title = display(d.title, "Follow-up");
  const notes = d.notes?.trim();
  return {
    subject: `Reminder: ${title}`,
    preheader: `Due ${formatDate(d.dueAt) ?? "now"}.`,
    heading: "A follow-up is due",
    blocks: [
      { type: "paragraph", text: title },
      {
        type: "details",
        rows: [
          { label: "Application", value: optional(d.applicationTitle) },
          { label: "Due", value: formatDate(d.dueAt) ?? "Now" },
        ],
      },
      notes ? { type: "quote", text: notes } : null,
      {
        type: "button",
        label: "Mark it done or skipped",
        url: t.orgUrl(d.orgId, "/submissions"),
      },
    ],
    footer: { reason: teamReason(d.orgName), manageNotificationsUrl: t.notificationsUrl(d.orgId) },
  };
}

// ---- deadlineReminder ------------------------------------------------------------------------

export interface DeadlineReminderData {
  orgId: string;
  orgName?: string | null;
  applicationId: string;
  applicationTitle: string;
  funderName?: string | null;
  deadline: Date | string;
  daysLeft: number;
}

const inDays = (n: number) => (n <= 0 ? "today" : n === 1 ? "tomorrow" : `in ${plural(n, "day")}`);

export function deadlineReminder(d: DeadlineReminderData, t: TemplateContext): EmailContent {
  const title = display(d.applicationTitle, "An application");
  const funder = optional(d.funderName);
  const when = formatDate(d.deadline);
  const days = Math.trunc(d.daysLeft || 0);
  return {
    subject: `Deadline ${inDays(days)}: "${title}"`,
    preheader: when ? `Due ${when}.` : null,
    heading: `"${title}" is due ${inDays(days)}`,
    blocks: [
      {
        type: "paragraph",
        text: `The application "${title}"${funder ? ` for ${funder}` : ""} is due ${inDays(days)}${when ? ` (${when})` : ""}.`,
      },
      {
        type: "button",
        label: "Open the application",
        url: t.orgUrl(d.orgId, `/applications/${seg(d.applicationId)}`),
      },
    ],
    footer: { reason: teamReason(d.orgName), manageNotificationsUrl: t.notificationsUrl(d.orgId) },
  };
}

// ---- weeklyDigest ----------------------------------------------------------------------------

export interface WeeklyDigestData {
  orgId: string;
  orgName: string;
  /** First day of the week the digest covers. */
  weekOf?: Date | string | null;
  newMatches: {
    opportunityId: string;
    title: string;
    funderName?: string | null;
    deadline?: Date | string | null;
  }[];
  closingSoon: {
    title: string;
    deadline: Date | string;
    applicationId?: string | null;
    opportunityId?: string | null;
  }[];
  pendingReviews: {
    applicationId: string;
    title: string;
    tier?: ReviewTier | null;
    blockers?: number | null;
  }[];
  needsInfo: {
    title: string;
    applicationId?: string | null;
    interviewId?: string | null;
    questions?: number | null;
  }[];
  awarded: {
    applicationId: string;
    title: string;
    funderName?: string | null;
    amountCents?: number | null;
  }[];
  /** Items listed per section before "and N more" (default 5). */
  maxItemsPerSection?: number;
}

function section(
  heading: string,
  items: ListItem[],
  empty: string,
  more: { label: string; url: string },
  max: number,
): Block[] {
  if (items.length === 0) {
    return [
      { type: "heading", text: heading },
      { type: "note", text: empty },
    ];
  }
  const out: Block[] = [
    { type: "heading", text: `${heading} (${items.length})` },
    { type: "list", items: items.slice(0, max) },
  ];
  if (items.length > max) {
    out.push({
      type: "link",
      label: `and ${items.length - max} more: ${more.label}`,
      url: more.url,
    });
  }
  return out;
}

const dueDetail = (d: Date | string | null | undefined) => {
  const s = formatDate(d);
  return s ? `due ${s}` : null;
};

export function weeklyDigest(d: WeeklyDigestData, t: TemplateContext): EmailContent {
  const org = display(d.orgName, "your organization");
  const max = Math.max(1, d.maxItemsPerSection ?? 5);
  const o = (path: string) => t.orgUrl(d.orgId, path);
  const week = formatDate(d.weekOf);
  const join = (...parts: (string | null)[]) => parts.filter(Boolean).join(" · ") || null;

  const matches: ListItem[] = d.newMatches.map((m) => ({
    text: display(m.title, "Opportunity"),
    detail: join(optional(m.funderName), dueDetail(m.deadline)),
    url: o(`/opportunities/${seg(m.opportunityId)}`),
  }));
  const closing: ListItem[] = d.closingSoon.map((c) => ({
    text: display(c.title, "Application"),
    detail: dueDetail(c.deadline),
    url: c.applicationId
      ? o(`/applications/${seg(c.applicationId)}`)
      : c.opportunityId
        ? o(`/opportunities/${seg(c.opportunityId)}`)
        : o("/applications"),
  }));
  const reviews: ListItem[] = d.pendingReviews.map((r) => ({
    text: display(r.title, "Application"),
    detail: join(tierLabel(r.tier), r.blockers ? plural(r.blockers, "blocker") : null),
    url: o(`/applications/${seg(r.applicationId)}`),
  }));
  const info: ListItem[] = d.needsInfo.map((n) => ({
    text: display(n.title, "Application"),
    detail: n.questions ? plural(n.questions, "open question") : null,
    url: n.interviewId
      ? o(`/interviews/${seg(n.interviewId)}`)
      : n.applicationId
        ? o(`/applications/${seg(n.applicationId)}`)
        : o("/interviews"),
  }));
  const awarded: ListItem[] = d.awarded.map((a) => ({
    text: display(a.title, "Application"),
    detail: join(optional(a.funderName), formatMoney(a.amountCents)),
    url: o(`/applications/${seg(a.applicationId)}`),
  }));

  const summary = [
    plural(matches.length, "new match", "new matches"),
    `${closing.length} closing soon`,
    plural(reviews.length, "pending review"),
  ].join(", ");

  return {
    subject: `Weekly digest for ${org}: ${plural(matches.length, "new match", "new matches")}, ${closing.length} closing soon`,
    preheader: summary,
    heading: week ? `Your week in grants (week of ${week})` : "Your week in grants",
    blocks: [
      { type: "paragraph", text: `Here's what changed for ${org}: ${summary}.` },
      ...section(
        "New matches",
        matches,
        "No new matches this week.",
        { label: "see all opportunities", url: o("/opportunities") },
        max,
      ),
      ...section(
        "Closing soon",
        closing,
        "Nothing is closing soon.",
        { label: "see all applications", url: o("/applications") },
        max,
      ),
      ...section(
        "Waiting for review",
        reviews,
        "No applications are waiting for review.",
        { label: "open the review queue", url: o("/reviews") },
        max,
      ),
      ...section(
        "Needs information",
        info,
        "No open questions.",
        { label: "see all interviews", url: o("/interviews") },
        max,
      ),
      ...section(
        "Awarded",
        awarded,
        "No new awards this week.",
        { label: "see all applications", url: o("/applications") },
        max,
      ),
      { type: "button", label: "Open your dashboard", url: o("") },
    ],
    footer: { reason: teamReason(d.orgName), manageNotificationsUrl: t.notificationsUrl(d.orgId) },
  };
}
