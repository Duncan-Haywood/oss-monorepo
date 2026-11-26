// Pure view-model builders for the dashboard. GET /submissions/dashboard (DashboardSummary) is the
// source of truth for KPIs, deadlines and activity; the list endpoints fill in while it loads/fails.
import type { FollowupDto } from "@shared/api/types";
import type { ApplicationStatus } from "@shared/enums";
import { daysUntil, humanize, IN_PROGRESS_STATUSES } from "./format";
import type {
  ApplicationListItem,
  DashboardActivity,
  DashboardDeadline,
  DashboardSummary,
  MatchWithOpportunity,
  SubmissionListItem,
} from "./queries";

const num = (v: unknown): number | undefined =>
  typeof v === "number" && Number.isFinite(v) ? v : undefined;
const isDate = (v: unknown): v is string =>
  typeof v === "string" && !Number.isNaN(new Date(v).getTime());

// ---------- KPIs ----------

export interface Kpis {
  awardedCents: number;
  awardedCount: number;
  submittedThisMonth: number;
  pendingReviews: number;
  inProgress: number;
}

const sameMonth = (d: string | null | undefined, now: Date) => {
  if (!d) return false;
  const x = new Date(d);
  return x.getFullYear() === now.getFullYear() && x.getMonth() === now.getMonth();
};

export function buildKpis(
  dashboard: DashboardSummary | undefined,
  applications: ApplicationListItem[] | undefined,
  now: Date = new Date(),
): Kpis {
  const apps = applications ?? [];
  const byStatus = dashboard?.counts?.byStatus;
  const countStatus = (statuses: readonly ApplicationStatus[]) =>
    byStatus
      ? statuses.reduce((n, s) => n + (num(byStatus[s]) ?? 0), 0)
      : apps.filter((a) => statuses.includes(a.status)).length;

  const awardedApps = apps.filter((a) => a.status === "awarded");
  return {
    awardedCents:
      num(dashboard?.awardedCents) ??
      awardedApps.reduce((n, a) => n + (a.awardedAmountCents ?? 0), 0),
    awardedCount: byStatus ? (num(byStatus.awarded) ?? 0) : awardedApps.length,
    submittedThisMonth:
      num(dashboard?.submittedThisMonth) ??
      apps.filter((a) => sameMonth(a.submittedAt, now)).length,
    pendingReviews: num(dashboard?.pendingReviews) ?? countStatus(["in_review"]),
    inProgress: countStatus(IN_PROGRESS_STATUSES),
  };
}

// ---------- needs your attention ----------

export type AttentionKind =
  | "review"
  | "needs_info"
  | "changes_requested"
  | "manual_submission"
  | "followup"
  | "failed";

export interface AttentionItem {
  key: string;
  kind: AttentionKind;
  title: string;
  detail: string;
  applicationId?: string;
  submissionId?: string;
  date?: string | null;
}

const ATTENTION_ORDER: Record<AttentionKind, number> = {
  needs_info: 0,
  review: 1,
  changes_requested: 2,
  failed: 3,
  manual_submission: 4,
  followup: 5,
};

export function buildAttention({
  applications,
  submissions,
  followups,
  now = new Date(),
  followupWindowDays = 7,
}: {
  applications?: ApplicationListItem[];
  submissions?: SubmissionListItem[];
  followups?: FollowupDto[];
  now?: Date;
  followupWindowDays?: number;
}): AttentionItem[] {
  const items: AttentionItem[] = [];
  const appTitle = new Map<string, string>();
  for (const a of applications ?? []) {
    appTitle.set(a.id, a.title);
    const deadline = a.deadline ?? a.opportunity?.closeDate ?? null;
    const base = { applicationId: a.id, title: a.title, date: deadline };
    if (a.status === "in_review") {
      items.push({
        ...base,
        key: `rev-${a.id}`,
        kind: "review",
        detail:
          a.reviewTier === "one_click"
            ? "Ready for one-click approval"
            : a.reviewTier === "full_review"
              ? "Needs a full section-by-section review"
              : "Waiting for a reviewer",
      });
    } else if (a.status === "needs_info") {
      items.push({
        ...base,
        key: `info-${a.id}`,
        kind: "needs_info",
        detail: "The draft has questions only you can answer",
      });
    } else if (a.status === "changes_requested") {
      items.push({
        ...base,
        key: `chg-${a.id}`,
        kind: "changes_requested",
        detail: "A reviewer asked for changes",
      });
    } else if (a.status === "failed") {
      items.push({
        ...base,
        key: `fail-${a.id}`,
        kind: "failed",
        detail: a.lastError ? `Pipeline error: ${a.lastError}` : "The pipeline hit an error",
      });
    }
  }
  for (const s of submissions ?? []) {
    if (s.channel === "manual" && (s.status === "pending" || s.status === "sent")) {
      items.push({
        key: `sub-${s.id}`,
        kind: "manual_submission",
        submissionId: s.id,
        applicationId: s.applicationId,
        title: s.application?.title ?? appTitle.get(s.applicationId) ?? "Application",
        detail: "Submit through the funder's portal, then confirm it here",
        date: s.createdAt,
      });
    }
  }
  for (const f of followups ?? []) {
    if (f.status !== "pending") continue;
    const days = daysUntil(f.dueAt, now);
    if (days > followupWindowDays) continue;
    items.push({
      key: `fup-${f.id}`,
      kind: "followup",
      applicationId: f.applicationId ?? undefined,
      title: f.title,
      detail:
        days < 0
          ? `Overdue by ${-days} day${days === -1 ? "" : "s"}`
          : days === 0
            ? "Due today"
            : `Due in ${days} day${days === 1 ? "" : "s"}`,
      date: f.dueAt,
    });
  }
  return items.sort((a, b) => {
    const k = ATTENTION_ORDER[a.kind] - ATTENTION_ORDER[b.kind];
    if (k !== 0) return k;
    const ad = a.date ? new Date(a.date).getTime() : Number.POSITIVE_INFINITY;
    const bd = b.date ? new Date(b.date).getTime() : Number.POSITIVE_INFINITY;
    return ad - bd;
  });
}

// ---------- upcoming deadlines ----------

export interface DeadlineItem {
  key: string;
  kind: "application" | "opportunity";
  title: string;
  subtitle?: string;
  date: string;
  days: number;
  applicationId?: string;
  opportunityId?: string;
  status?: string;
}

const TERMINAL: readonly string[] = ["submitted", "awarded", "declined", "withdrawn"];

function fromDashboardDeadline(d: DashboardDeadline, now: Date): DeadlineItem | null {
  if (!isDate(d.deadline)) return null;
  return {
    key: `app-${d.applicationId}`,
    kind: "application",
    title: d.title,
    subtitle: d.funderName,
    date: d.deadline,
    // The server's daysLeft rounds up; recompute against the viewer's clock for consistency.
    days: daysUntil(d.deadline, now),
    applicationId: d.applicationId,
    opportunityId: d.opportunityId,
    status: d.status,
  };
}

export function buildUpcomingDeadlines({
  dashboard,
  applications,
  matches,
  now = new Date(),
  windowDays = 30,
  limit = 8,
}: {
  dashboard?: DashboardSummary;
  applications?: ApplicationListItem[];
  matches?: MatchWithOpportunity[];
  now?: Date;
  windowDays?: number;
  limit?: number;
}): DeadlineItem[] {
  const byKey = new Map<string, DeadlineItem>();
  const appOppIds = new Set<string>();
  const add = (d: DeadlineItem) => {
    if (d.days < 0 || d.days > windowDays) return;
    if (!byKey.has(d.key)) byKey.set(d.key, d);
  };

  // Authoritative: open applications due within 30 days (server-computed).
  for (const raw of dashboard?.upcomingDeadlines ?? []) {
    const d = fromDashboardDeadline(raw, now);
    if (!d) continue;
    appOppIds.add(raw.opportunityId);
    add(d);
  }
  // Fallback while /dashboard is loading or failed: the applications list.
  for (const a of applications ?? []) {
    appOppIds.add(a.opportunityId);
    if (TERMINAL.includes(a.status) || a.status === "failed") continue;
    const date = a.deadline ?? a.opportunity?.closeDate;
    if (!date) continue;
    add({
      key: `app-${a.id}`,
      kind: "application",
      title: a.title,
      subtitle: a.opportunity?.funderName,
      date,
      days: daysUntil(date, now),
      applicationId: a.id,
      opportunityId: a.opportunityId,
      status: a.status,
    });
  }
  for (const m of matches ?? []) {
    const o = m.opportunity;
    if (!o?.closeDate || appOppIds.has(o.id)) continue;
    if (m.status === "dismissed" || m.status === "applied") continue;
    if (m.status !== "shortlisted" && m.fitScore < 60) continue;
    add({
      key: `opp-${o.id}`,
      kind: "opportunity",
      title: o.title,
      subtitle: o.funderName,
      date: o.closeDate,
      days: daysUntil(o.closeDate, now),
      opportunityId: o.id,
      status: m.status === "shortlisted" ? "shortlisted" : "match",
    });
  }
  return [...byKey.values()].sort((a, b) => a.days - b.days).slice(0, limit);
}

// ---------- top matches ----------

export function topMatches(matches: MatchWithOpportunity[] | undefined, n = 5, now = new Date()) {
  return (matches ?? [])
    .filter(
      (m) =>
        (m.status === "new" || m.status === "shortlisted") &&
        m.eligibility !== "ineligible" &&
        m.opportunity &&
        m.opportunity.status !== "closed" &&
        m.opportunity.status !== "archived" &&
        (!m.opportunity.closeDate || daysUntil(m.opportunity.closeDate, now) >= 0),
    )
    .sort((a, b) => b.expectedValueCents - a.expectedValueCents || b.fitScore - a.fitScore)
    .slice(0, n);
}

// ---------- recent activity ----------

export interface ActivityItem {
  id: string;
  label: string;
  detail?: string;
  createdAt: string;
  actor: "user" | "system" | "autopilot";
  targetType?: string;
  targetId?: string;
}

const ACTION_LABELS: Record<string, string> = {
  "application.created": "Application draft started",
  "application.drafted": "Draft ready",
  "application.verified": "Draft fact-checked",
  "application.routed": "Sent for review",
  "application.section_edited": "Section edited",
  "application.section_regenerated": "Section regenerated",
  "application.flag_resolved": "Question resolved",
  "application.feedback_added": "Reviewer feedback added",
  "application.review_approved": "Application approved",
  "application.review_changes_requested": "Changes requested",
  "application.review_rejected": "Application rejected",
  "application.submitted": "Application submitted",
  "application.awarded": "Grant awarded",
  "application.declined": "Application declined",
  "application.withdrawn": "Application withdrawn",
  "document.uploaded": "Document uploaded",
  "document.reprocessed": "Document reprocessed",
  "document.deleted": "Document deleted",
  "fact.created": "Fact added",
  "fact.updated": "Fact edited",
  "fact.confirmed": "Fact confirmed",
  "fact.rejected": "Fact rejected",
  "fact.bulk_confirmed": "Facts confirmed",
  "project.created": "Project created",
  "project.updated": "Project updated",
  "project.deleted": "Project deleted",
  "project.fields_from_interview": "Project details captured from an interview",
  "interview.started": "Interview started",
  "interview.completed": "Interview completed",
  "interview.transcript_uploaded": "Interview transcript uploaded",
  "interview.gap_fill_created": "Follow-up questions prepared",
  "match.status_changed": "Grant match updated",
  "opportunity.imported": "Grant imported",
  "opportunity.reimported": "Grant re-imported",
  "submission.package_prepared": "Submission package prepared",
  "submission.confirmed": "Submission confirmed",
  "submission.failed": "Submission failed",
  "website.crawl_requested": "Website import requested",
  "website.crawled": "Website imported",
};

const ACTORS = new Set<ActivityItem["actor"]>(["user", "system", "autopilot"]);

export function normalizeActivity(raw: DashboardActivity[] | undefined, limit = 8): ActivityItem[] {
  const out: ActivityItem[] = [];
  for (const r of raw ?? []) {
    if (!r.action || !isDate(r.createdAt)) continue;
    const actor = ACTORS.has(r.actorType as ActivityItem["actor"])
      ? (r.actorType as ActivityItem["actor"])
      : "user";
    out.push({
      id: r.id,
      label: ACTION_LABELS[r.action] ?? humanize(r.action),
      createdAt: new Date(r.createdAt).toISOString(),
      actor,
      targetType: r.targetType ?? undefined,
      targetId: r.targetId ?? undefined,
    });
  }
  return out
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, limit);
}
