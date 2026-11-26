// Email rendering for the digest module, built on the shared email templates (every value is
// escaped by the layout). The weeklyDigest template has no slots for submissions, follow-ups, the
// facts count or the monthly check-in yet, so those sections are added here as layout blocks before
// the closing button.
import { type RenderedEmail, renderEmail } from "../email-templates";
import { display, formatDate, plural, seg } from "../email-templates/format";
import { type Block, createTemplateContext, renderContent } from "../email-templates/layout";
import { weeklyDigest } from "../email-templates/templates/reminders";
import type { WeeklyDigest } from "./build";

/** Per-recipient extras: the one-click unsubscribe page for this recipient (null when unavailable). */
export interface NotificationRenderOptions {
  unsubscribeUrl?: string | null;
}

export function renderWeeklyDigestEmail(
  d: WeeklyDigest,
  appUrl: string,
  opts: NotificationRenderOptions = {},
): RenderedEmail {
  const t = createTemplateContext(appUrl);
  const o = (path: string) => t.orgUrl(d.orgId, path);
  const content = weeklyDigest(
    {
      orgId: d.orgId,
      orgName: d.orgName,
      weekOf: d.periodStart,
      newMatches: d.newTopMatches.map((m) => ({
        opportunityId: m.opportunityId,
        title: m.title,
        funderName: m.funderName,
        deadline: m.closeDate,
      })),
      closingSoon: d.closingSoon.map((c) => ({
        title: c.title,
        deadline: c.deadline,
        applicationId: c.applicationId,
        opportunityId: c.opportunityId,
      })),
      pendingReviews: d.pendingReviews.map((r) => ({
        applicationId: r.applicationId,
        title: r.title,
        tier: r.reviewTier,
      })),
      needsInfo: d.needsInfo.map((n) => ({
        applicationId: n.applicationId,
        title: n.title,
        questions: n.questions.length,
      })),
      awarded: d.awardedThisWeek.map((a) => ({
        applicationId: a.applicationId,
        title: a.title,
        funderName: a.funderName,
        amountCents: a.awardedAmountCents,
      })),
    },
    t,
  );

  const extra: Block[] = [];
  if (d.submittedThisWeek.length) {
    extra.push(
      { type: "heading", text: `Submitted this week (${d.submittedThisWeek.length})` },
      {
        type: "list",
        items: d.submittedThisWeek.slice(0, 5).map((s) => ({
          text: display(s.title, "Application"),
          detail: display(s.funderName, "") || null,
          url: o(`/applications/${seg(s.applicationId)}`),
        })),
      },
    );
  }
  if (d.followupsDue.length) {
    extra.push(
      { type: "heading", text: `Follow-ups due (${d.followupsDue.length})` },
      {
        type: "list",
        items: d.followupsDue.slice(0, 5).map((f) => ({
          text: display(f.title, "Follow-up"),
          detail: f.overdue ? "overdue" : `due ${formatDate(f.dueAt) ?? "soon"}`,
          url: o("/submissions"),
        })),
      },
    );
  }
  if (d.factsAwaitingConfirmation > 0) {
    const n = d.factsAwaitingConfirmation;
    extra.push(
      { type: "heading", text: "Facts to confirm" },
      {
        type: "paragraph",
        text: `${plural(n, "fact")} from your documents and interviews ${n === 1 ? "is" : "are"} waiting for confirmation. Claims that cite unconfirmed facts are flagged for review, and autopilot only submits drafts whose facts are all confirmed.`,
      },
      { type: "link", label: "Review facts", url: o("/knowledge/facts") },
    );
  }
  if (d.checkIn) {
    extra.push(
      { type: "heading", text: d.checkIn.title },
      { type: "paragraph", text: d.checkIn.body },
      { type: "link", label: d.checkIn.cta, url: o(d.checkIn.path) },
    );
  }
  const blocks = [...content.blocks];
  let at = blocks.length;
  for (let i = blocks.length - 1; i >= 0; i--) {
    const b = blocks[i];
    if (b && b.type === "button") {
      at = i;
      break;
    }
  }
  blocks.splice(at, 0, ...extra);
  const footer = opts.unsubscribeUrl
    ? { ...content.footer, unsubscribeUrl: opts.unsubscribeUrl }
    : content.footer;
  return renderContent({ ...content, blocks, footer }, t);
}

export function renderDeadlineNudgeEmail(
  d: {
    orgId: string;
    orgName: string;
    applicationId: string;
    title: string;
    funderName: string;
    deadline: Date;
    daysLeft: number;
  },
  appUrl: string,
  opts: NotificationRenderOptions = {},
): RenderedEmail {
  return renderEmail(
    "deadlineReminder",
    {
      orgId: d.orgId,
      orgName: d.orgName,
      applicationId: d.applicationId,
      applicationTitle: d.title,
      funderName: d.funderName,
      deadline: d.deadline,
      daysLeft: d.daysLeft,
    },
    { appUrl, unsubscribeUrl: opts.unsubscribeUrl ?? null },
  );
}
