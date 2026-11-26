// The weekly digest: what changed for one org in the last 7 days and what needs a human next.
// Every query filters by orgId (and opportunities by visibleTo). Fact text never leaves this file:
// facts are counted, not listed.
import type { ApplicationStatus, FollowupKind, ReviewTier } from "@shared/enums";
import {
  and,
  asc,
  between,
  desc,
  eq,
  gte,
  isNull,
  lte,
  ne,
  notInArray,
  or,
  sql,
} from "drizzle-orm";
import type { AppContext } from "../../context";
import {
  applicationFlags,
  applications,
  facts,
  followups,
  opportunities,
  opportunityMatches,
  organization,
} from "../../db/schema";
import { visibleTo } from "../discovery";
import { TERMINAL_STATUSES } from "../submission";
import { type CheckInNudge, digestCheckInNudge } from "../updates";

export const DAY = 86_400_000;
export const DIGEST_MIN_FIT = 60;
export const DIGEST_TOP_MATCHES = 5;
export const CLOSING_SOON_DAYS = 21;
const LIST_CAP = 25;
const QUESTIONS_PER_APP = 5;

export interface DigestMatch {
  matchId: string;
  opportunityId: string;
  title: string;
  funderName: string;
  fitScore: number;
  expectedValueCents: number;
  suggestedAskCents: number | null;
  closeDate: string | null;
}

export interface DigestClosing {
  opportunityId: string;
  title: string;
  funderName: string;
  deadline: string;
  daysLeft: number;
  /** Set when the org already has an application in progress for this opportunity. */
  applicationId: string | null;
  applicationStatus: ApplicationStatus | null;
  matchId: string | null;
}

export interface DigestApplication {
  applicationId: string;
  title: string;
  funderName: string;
  deadline: string | null;
}

export interface WeeklyDigest {
  orgId: string;
  orgName: string;
  /** ISO week, e.g. "2026-W47". */
  week: string;
  periodStart: string;
  periodEnd: string;
  newTopMatches: DigestMatch[];
  closingSoon: DigestClosing[];
  pendingReviews: (DigestApplication & { reviewTier: ReviewTier | null })[];
  needsInfo: (DigestApplication & { questions: string[] })[];
  submittedThisWeek: (DigestApplication & { submittedAt: string })[];
  awardedThisWeek: (DigestApplication & {
    awardedAmountCents: number | null;
    outcomeAt: string;
  })[];
  followupsDue: {
    followupId: string;
    kind: FollowupKind;
    title: string;
    dueAt: string;
    overdue: boolean;
    applicationId: string | null;
  }[];
  /** A count only: fact statements are never put in an email. */
  factsAwaitingConfirmation: number;
  /** The monthly "What's new?" check-in (first digest of each month), else null. */
  checkIn: CheckInNudge | null;
}

/** ISO-8601 week of `date` (UTC), e.g. "2026-W47". */
export function isoWeek(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum); // Thursday decides the year
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((d.getTime() - yearStart) / DAY + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export const daysUntil = (deadline: Date, now: Date) =>
  Math.ceil((deadline.getTime() - now.getTime()) / DAY);

/**
 * True when the digest has nothing worth an email. `checkIn` is deliberately not counted: the monthly
 * nudge alone never makes a digest worth sending.
 */
export function digestIsEmpty(d: WeeklyDigest): boolean {
  return (
    d.newTopMatches.length === 0 &&
    d.closingSoon.length === 0 &&
    d.pendingReviews.length === 0 &&
    d.needsInfo.length === 0 &&
    d.submittedThisWeek.length === 0 &&
    d.awardedThisWeek.length === 0 &&
    d.followupsDue.length === 0 &&
    d.factsAwaitingConfirmation === 0
  );
}

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);
/** Opportunity statuses that can still take an application. */
const OPEN_OPPORTUNITY = notInArray(opportunities.status, ["closed", "archived"]);
/** Application statuses that are still being worked on. */
const IN_PROGRESS = notInArray(applications.status, [...TERMINAL_STATUSES, "failed"]);
/** The application's own deadline, falling back to the opportunity close date (as the dashboard). */
const APP_DEADLINE = sql`coalesce(${applications.deadline}, ${opportunities.closeDate})`;

const appWithOpp = {
  applicationId: applications.id,
  title: applications.title,
  funderName: opportunities.funderName,
  deadline: applications.deadline,
  closeDate: opportunities.closeDate,
};

export async function buildWeeklyDigest(
  ctx: AppContext,
  orgId: string,
  now: Date,
): Promise<WeeklyDigest> {
  const weekAgo = new Date(now.getTime() - 7 * DAY);
  const closingHorizon = new Date(now.getTime() + CLOSING_SOON_DAYS * DAY);
  const followupHorizon = new Date(now.getTime() + 7 * DAY);
  const db = ctx.db;

  const [
    org,
    topMatches,
    closingApps,
    closingMatches,
    reviewRows,
    infoApps,
    infoFlags,
    submittedRows,
    awardedRows,
    followupRows,
    factCount,
  ] = await Promise.all([
    db
      .select({ name: organization.name })
      .from(organization)
      .where(eq(organization.id, orgId))
      .get(),
    db
      .select({
        matchId: opportunityMatches.id,
        opportunityId: opportunities.id,
        title: opportunities.title,
        funderName: opportunities.funderName,
        fitScore: opportunityMatches.fitScore,
        expectedValueCents: opportunityMatches.expectedValueCents,
        suggestedAskCents: opportunityMatches.suggestedAskCents,
        closeDate: opportunities.closeDate,
      })
      .from(opportunityMatches)
      .innerJoin(opportunities, eq(opportunities.id, opportunityMatches.opportunityId))
      .where(
        and(
          eq(opportunityMatches.orgId, orgId),
          visibleTo(orgId),
          between(opportunityMatches.scoredAt, weekAgo, now),
          gte(opportunityMatches.fitScore, DIGEST_MIN_FIT),
          ne(opportunityMatches.status, "dismissed"),
          OPEN_OPPORTUNITY,
          or(isNull(opportunities.closeDate), gte(opportunities.closeDate, now)),
        ),
      )
      .orderBy(desc(opportunityMatches.expectedValueCents), desc(opportunityMatches.fitScore))
      .limit(DIGEST_TOP_MATCHES)
      .all(),
    db
      .select({ ...appWithOpp, opportunityId: opportunities.id, status: applications.status })
      .from(applications)
      .innerJoin(opportunities, eq(opportunities.id, applications.opportunityId))
      .where(
        and(
          eq(applications.orgId, orgId),
          IN_PROGRESS,
          sql`${APP_DEADLINE} between ${now.getTime()} and ${closingHorizon.getTime()}`,
        ),
      )
      .limit(LIST_CAP)
      .all(),
    db
      .select({
        matchId: opportunityMatches.id,
        opportunityId: opportunities.id,
        title: opportunities.title,
        funderName: opportunities.funderName,
        closeDate: opportunities.closeDate,
      })
      .from(opportunityMatches)
      .innerJoin(opportunities, eq(opportunities.id, opportunityMatches.opportunityId))
      .where(
        and(
          eq(opportunityMatches.orgId, orgId),
          visibleTo(orgId),
          // "Matched": the team shortlisted it, or a new match that clears the digest fit bar.
          or(
            eq(opportunityMatches.status, "shortlisted"),
            and(
              eq(opportunityMatches.status, "new"),
              gte(opportunityMatches.fitScore, DIGEST_MIN_FIT),
            ),
          ),
          OPEN_OPPORTUNITY,
          between(opportunities.closeDate, now, closingHorizon),
        ),
      )
      .orderBy(asc(opportunities.closeDate))
      .limit(LIST_CAP)
      .all(),
    db
      .select({ ...appWithOpp, reviewTier: applications.reviewTier })
      .from(applications)
      .innerJoin(opportunities, eq(opportunities.id, applications.opportunityId))
      .where(and(eq(applications.orgId, orgId), eq(applications.status, "in_review")))
      .orderBy(sql`${APP_DEADLINE} is null`, asc(APP_DEADLINE))
      .limit(LIST_CAP)
      .all(),
    db
      .select(appWithOpp)
      .from(applications)
      .innerJoin(opportunities, eq(opportunities.id, applications.opportunityId))
      .where(and(eq(applications.orgId, orgId), eq(applications.status, "needs_info")))
      .orderBy(sql`${APP_DEADLINE} is null`, asc(APP_DEADLINE))
      .limit(LIST_CAP)
      .all(),
    // Open missing-info questions on each needs_info application's current version (joined through
    // current_version_id so the bound-parameter count stays fixed).
    db
      .select({
        applicationId: applicationFlags.applicationId,
        question: applicationFlags.suggestedQuestion,
        message: applicationFlags.message,
      })
      .from(applicationFlags)
      .innerJoin(
        applications,
        and(
          eq(applications.currentVersionId, applicationFlags.versionId),
          eq(applications.orgId, orgId),
        ),
      )
      .where(
        and(
          eq(applicationFlags.orgId, orgId),
          eq(applicationFlags.kind, "missing_info"),
          eq(applicationFlags.status, "open"),
          eq(applications.status, "needs_info"),
        ),
      )
      .orderBy(asc(applicationFlags.createdAt))
      .limit(500)
      .all(),
    db
      .select({ ...appWithOpp, submittedAt: applications.submittedAt })
      .from(applications)
      .innerJoin(opportunities, eq(opportunities.id, applications.opportunityId))
      .where(and(eq(applications.orgId, orgId), between(applications.submittedAt, weekAgo, now)))
      .orderBy(desc(applications.submittedAt))
      .limit(LIST_CAP)
      .all(),
    db
      .select({
        ...appWithOpp,
        awardedAmountCents: applications.awardedAmountCents,
        outcomeAt: applications.outcomeAt,
      })
      .from(applications)
      .innerJoin(opportunities, eq(opportunities.id, applications.opportunityId))
      .where(
        and(
          eq(applications.orgId, orgId),
          eq(applications.status, "awarded"),
          between(applications.outcomeAt, weekAgo, now),
        ),
      )
      .orderBy(desc(applications.outcomeAt))
      .limit(LIST_CAP)
      .all(),
    // Deadline reminders are follow-ups too, but closingSoon already covers deadlines.
    db
      .select({
        followupId: followups.id,
        kind: followups.kind,
        title: followups.title,
        dueAt: followups.dueAt,
        applicationId: followups.applicationId,
      })
      .from(followups)
      .where(
        and(
          eq(followups.orgId, orgId),
          eq(followups.status, "pending"),
          ne(followups.kind, "deadline_reminder"),
          lte(followups.dueAt, followupHorizon),
        ),
      )
      .orderBy(asc(followups.dueAt))
      .limit(LIST_CAP)
      .all(),
    db
      .select({ n: sql<number>`count(*)` })
      .from(facts)
      .where(and(eq(facts.orgId, orgId), eq(facts.status, "proposed")))
      .get(),
  ]);

  const app = (r: {
    applicationId: string;
    title: string;
    funderName: string;
    deadline: Date | null;
    closeDate: Date | null;
  }): DigestApplication => ({
    applicationId: r.applicationId,
    title: r.title,
    funderName: r.funderName,
    deadline: iso(r.deadline ?? r.closeDate),
  });

  // closingSoon: in-progress applications first, then matched opportunities without one.
  const closing = new Map<string, DigestClosing>();
  for (const r of closingApps) {
    const deadline = r.deadline ?? r.closeDate;
    if (!deadline || closing.has(r.opportunityId)) continue;
    closing.set(r.opportunityId, {
      opportunityId: r.opportunityId,
      title: r.title,
      funderName: r.funderName,
      deadline: deadline.toISOString(),
      daysLeft: daysUntil(deadline, now),
      applicationId: r.applicationId,
      applicationStatus: r.status,
      matchId: null,
    });
  }
  for (const r of closingMatches) {
    if (!r.closeDate || closing.has(r.opportunityId)) continue;
    closing.set(r.opportunityId, {
      opportunityId: r.opportunityId,
      title: r.title,
      funderName: r.funderName,
      deadline: r.closeDate.toISOString(),
      daysLeft: daysUntil(r.closeDate, now),
      applicationId: null,
      applicationStatus: null,
      matchId: r.matchId,
    });
  }

  const questionsByApp = new Map<string, string[]>();
  for (const f of infoFlags) {
    const q = (f.question ?? f.message).trim();
    if (!q) continue;
    const list = questionsByApp.get(f.applicationId) ?? [];
    if (!list.includes(q) && list.length < QUESTIONS_PER_APP) list.push(q);
    questionsByApp.set(f.applicationId, list);
  }

  return {
    orgId,
    orgName: org?.name ?? "",
    week: isoWeek(now),
    periodStart: weekAgo.toISOString(),
    periodEnd: now.toISOString(),
    newTopMatches: topMatches.map((m) => ({ ...m, closeDate: iso(m.closeDate) })),
    closingSoon: [...closing.values()]
      .sort((a, b) => a.deadline.localeCompare(b.deadline))
      .slice(0, LIST_CAP),
    pendingReviews: reviewRows.map((r) => ({ ...app(r), reviewTier: r.reviewTier })),
    needsInfo: infoApps.map((r) => ({
      ...app(r),
      questions: questionsByApp.get(r.applicationId) ?? [],
    })),
    submittedThisWeek: submittedRows.map((r) => ({
      ...app(r),
      submittedAt: iso(r.submittedAt) ?? "",
    })),
    awardedThisWeek: awardedRows.map((r) => ({
      ...app(r),
      awardedAmountCents: r.awardedAmountCents,
      outcomeAt: iso(r.outcomeAt) ?? "",
    })),
    followupsDue: followupRows.map((f) => ({
      ...f,
      dueAt: f.dueAt.toISOString(),
      overdue: f.dueAt.getTime() < now.getTime(),
    })),
    factsAwaitingConfirmation: Number(factCount?.n ?? 0),
    checkIn: digestCheckInNudge(now),
  };
}
