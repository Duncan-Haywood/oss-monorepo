// GET /api/orgs/:orgId/home: the org's personalized "grant plan". Every query below filters by the
// caller's orgId (opportunities, a shared catalog, are reached only through this org's own matches
// and applications, and never another org's private rows). All reads are bounded: grouped counts,
// LIMITs, and IN lists chunked by D1_IN_CHUNK. Nothing is aggregated across tenants.
import type { HomePlanDto } from "@shared/api/home";
import type { ApplicationStatus, MemberRole } from "@shared/enums";
import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
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
  documents,
  facts,
  funders,
  opportunities,
  opportunityMatches,
  organization,
  orgProfiles,
  orgSettings,
  submissions,
} from "../../db/schema";
import { chunk, D1_IN_CHUNK } from "../../lib/chunk";
import { notFound } from "../../lib/errors";
import { ORG_TYPE_LABELS } from "../orgs";
import { TERMINAL_STATUSES } from "../submission";
import {
  buildAutomationSummary,
  buildCalendar,
  CALENDAR_WINDOW_DAYS,
  type CalendarMatch,
  coverageFromCounts,
  DAY_MS,
  type FactCountRow,
  firstName,
  type GapFlag,
  MIN_FIT_FOR_PLAN,
  NEW_MATCH_DAYS,
  type PlanApp,
  rankActions,
} from "./plan";

export * from "./plan";

/** Upper bounds for each list read (an org with more simply sees the soonest / largest). */
const LIMITS = {
  openApps: 200,
  calendarMatches: 200,
  newMatches: 50,
  pendingManual: 20,
  proposedDocs: 3,
  flagsPerChunk: 500,
} as const;

export interface HomePlanInput {
  orgId: string;
  role: MemberRole;
  /** The signed-in user's display name (from the session), for the greeting only. */
  userName: string | null;
}

/** Opportunities this org may see: the public catalog plus its own private imports. */
const visibleTo = (orgId: string) =>
  or(isNull(opportunities.privateToOrgId), eq(opportunities.privateToOrgId, orgId));
const OPEN_OPP_STATUSES = ["posted", "forecasted"] as const;
const CLOSED_APP_STATUSES: ApplicationStatus[] = [...TERMINAL_STATUSES, "failed"];

export async function getHomePlan(ctx: AppContext, input: HomePlanInput): Promise<HomePlanDto> {
  const { orgId, role } = input;
  const db = ctx.db;
  const now = ctx.now();
  const horizon = new Date(now.getTime() + CALENDAR_WINDOW_DAYS * DAY_MS);
  const newSince = new Date(now.getTime() - NEW_MATCH_DAYS * DAY_MS);
  const deadlineExpr = sql<
    number | null
  >`coalesce(${applications.deadline}, ${opportunities.closeDate})`;
  // Funder type falls back to the source, like matching's funderTypeOf().
  const isFederal = or(
    eq(funders.type, "federal"),
    and(isNull(funders.type), inArray(opportunities.source, ["grants_gov", "simpler_grants"])),
  );
  const openOpp = and(
    visibleTo(orgId),
    inArray(opportunities.status, [...OPEN_OPP_STATUSES]),
    or(isNull(opportunities.closeDate), gte(opportunities.closeDate, now)),
  );

  const [
    org,
    profile,
    settings,
    factCounts,
    proposedByDoc,
    proposedOther,
    docCount,
    appCount,
    openApps,
    pendingManual,
    calendarMatches,
    newMatches,
    federal,
    pipeline,
    outcomes,
  ] = await Promise.all([
    db
      .select({ name: organization.name })
      .from(organization)
      .where(eq(organization.id, orgId))
      .get(),
    db
      .select({
        focusAreas: orgProfiles.focusAreas,
        serviceAreas: orgProfiles.serviceAreas,
        orgType: orgProfiles.orgType,
        uei: orgProfiles.uei,
        city: orgProfiles.city,
        state: orgProfiles.state,
      })
      .from(orgProfiles)
      .where(eq(orgProfiles.orgId, orgId))
      .get(),
    db
      .select({
        autopilotEnabled: orgSettings.autopilotEnabled,
        automationLevel: orgSettings.automationLevel,
        requireMatchApproval: orgSettings.requireMatchApproval,
        requireFactConfirmation: orgSettings.requireFactConfirmation,
        requireDraftReview: orgSettings.requireDraftReview,
        requireSubmissionApproval: orgSettings.requireSubmissionApproval,
        requireFollowupApproval: orgSettings.requireFollowupApproval,
        twoPersonRuleAboveCents: orgSettings.twoPersonRuleAboveCents,
        autoDraftTopN: orgSettings.autoDraftTopN,
        autoSubmitMaxCents: orgSettings.autoSubmitMaxCents,
      })
      .from(orgSettings)
      .where(eq(orgSettings.orgId, orgId))
      .get(),
    db
      .select({
        category: facts.category,
        status: facts.status,
        hasProject: sql<number>`(${facts.projectId} is not null)`,
        n: count(),
      })
      .from(facts)
      .where(and(eq(facts.orgId, orgId), inArray(facts.status, ["proposed", "confirmed"])))
      .groupBy(facts.category, facts.status, sql`(${facts.projectId} is not null)`)
      .all(),
    db
      .select({ documentId: documents.id, title: documents.title, n: count() })
      .from(facts)
      .innerJoin(
        documents,
        and(eq(documents.id, facts.sourceDocumentId), eq(documents.orgId, orgId)),
      )
      .where(and(eq(facts.orgId, orgId), eq(facts.status, "proposed")))
      .groupBy(documents.id, documents.title)
      .orderBy(desc(count()), asc(documents.title))
      .limit(LIMITS.proposedDocs)
      .all(),
    db
      .select({ n: count() })
      .from(facts)
      .where(
        and(eq(facts.orgId, orgId), eq(facts.status, "proposed"), isNull(facts.sourceDocumentId)),
      )
      .get(),
    db.select({ n: count() }).from(documents).where(eq(documents.orgId, orgId)).get(),
    db.select({ n: count() }).from(applications).where(eq(applications.orgId, orgId)).get(),
    db
      .select({
        id: applications.id,
        title: applications.title,
        status: applications.status,
        reviewTier: applications.reviewTier,
        deadline: applications.deadline,
        closeDate: opportunities.closeDate,
        opportunityId: applications.opportunityId,
        funderName: opportunities.funderName,
      })
      .from(applications)
      .innerJoin(opportunities, eq(opportunities.id, applications.opportunityId))
      .where(
        and(
          eq(applications.orgId, orgId),
          visibleTo(orgId),
          notInArray(applications.status, CLOSED_APP_STATUSES),
        ),
      )
      .orderBy(sql`${deadlineExpr} is null`, asc(deadlineExpr))
      .limit(LIMITS.openApps)
      .all(),
    db
      .select({
        submissionId: submissions.id,
        applicationId: applications.id,
        title: applications.title,
        deadline: applications.deadline,
        closeDate: opportunities.closeDate,
        funderName: opportunities.funderName,
      })
      .from(submissions)
      .innerJoin(
        applications,
        and(eq(applications.id, submissions.applicationId), eq(applications.orgId, orgId)),
      )
      .innerJoin(opportunities, eq(opportunities.id, applications.opportunityId))
      .where(
        and(
          eq(submissions.orgId, orgId),
          eq(submissions.channel, "manual"),
          eq(submissions.status, "pending"),
        ),
      )
      .orderBy(desc(submissions.createdAt))
      .limit(LIMITS.pendingManual)
      .all(),
    db
      .select({
        id: opportunityMatches.id,
        opportunityId: opportunities.id,
        title: opportunities.title,
        funderName: opportunities.funderName,
        status: opportunityMatches.status,
        closeDate: opportunities.closeDate,
      })
      .from(opportunityMatches)
      .innerJoin(opportunities, eq(opportunities.id, opportunityMatches.opportunityId))
      .where(
        and(
          eq(opportunityMatches.orgId, orgId),
          inArray(opportunityMatches.status, ["new", "shortlisted"]),
          ne(opportunityMatches.eligibility, "ineligible"),
          or(
            eq(opportunityMatches.status, "shortlisted"),
            gte(opportunityMatches.fitScore, MIN_FIT_FOR_PLAN),
          ),
          openOpp,
          isNotNull(opportunities.closeDate),
          lte(opportunities.closeDate, horizon),
        ),
      )
      .orderBy(asc(opportunities.closeDate))
      .limit(LIMITS.calendarMatches)
      .all(),
    db
      .select({
        title: opportunities.title,
        summary: sql<string>`substr(${opportunities.summary}, 1, 600)`,
        keywords: opportunities.keywords,
        categories: opportunities.categories,
      })
      .from(opportunityMatches)
      .innerJoin(opportunities, eq(opportunities.id, opportunityMatches.opportunityId))
      .where(
        and(
          eq(opportunityMatches.orgId, orgId),
          eq(opportunityMatches.status, "new"),
          ne(opportunityMatches.eligibility, "ineligible"),
          gte(opportunityMatches.fitScore, MIN_FIT_FOR_PLAN),
          gte(opportunityMatches.createdAt, newSince),
          openOpp,
        ),
      )
      .orderBy(desc(opportunityMatches.expectedValueCents))
      .limit(LIMITS.newMatches)
      .all(),
    db
      .select({ n: count() })
      .from(opportunityMatches)
      .innerJoin(opportunities, eq(opportunities.id, opportunityMatches.opportunityId))
      .leftJoin(funders, eq(funders.id, opportunities.funderId))
      .where(
        and(
          eq(opportunityMatches.orgId, orgId),
          inArray(opportunityMatches.status, ["new", "shortlisted", "drafting"]),
          ne(opportunityMatches.eligibility, "ineligible"),
          openOpp,
          isFederal,
        ),
      )
      .get(),
    db
      .select({
        status: opportunityMatches.status,
        n: count(),
        ev: sql<number | null>`sum(${opportunityMatches.expectedValueCents})`,
      })
      .from(opportunityMatches)
      .innerJoin(opportunities, eq(opportunities.id, opportunityMatches.opportunityId))
      .where(
        and(
          eq(opportunityMatches.orgId, orgId),
          inArray(opportunityMatches.status, ["shortlisted", "drafting"]),
          visibleTo(orgId),
        ),
      )
      .groupBy(opportunityMatches.status)
      .all(),
    db
      .select({
        status: applications.status,
        n: count(),
        awarded: sql<number | null>`sum(${applications.awardedAmountCents})`,
      })
      .from(applications)
      .where(
        and(eq(applications.orgId, orgId), inArray(applications.status, ["awarded", "declined"])),
      )
      .groupBy(applications.status)
      .all(),
  ]);
  if (!org) throw notFound("Organization");

  // Open missing-info questions on open drafts: the "gap flags" an interview can answer.
  const gapFlags: GapFlag[] = [];
  const questionsByApp = new Map<string, number>();
  const draftIds = openApps.map((a) => a.id);
  const flagRows = (
    await Promise.all(
      chunk(draftIds, D1_IN_CHUNK).map((ids) =>
        db
          .select({
            applicationId: applicationFlags.applicationId,
            sectionKey: applicationFlags.sectionKey,
            message: applicationFlags.message,
            suggestedQuestion: applicationFlags.suggestedQuestion,
          })
          .from(applicationFlags)
          .where(
            and(
              eq(applicationFlags.orgId, orgId),
              inArray(applicationFlags.applicationId, ids),
              eq(applicationFlags.kind, "missing_info"),
              eq(applicationFlags.status, "open"),
            ),
          )
          .limit(LIMITS.flagsPerChunk)
          .all(),
      ),
    )
  ).flat();
  for (const f of flagRows) {
    gapFlags.push({
      applicationId: f.applicationId,
      text: [f.sectionKey, f.message, f.suggestedQuestion].filter(Boolean).join(" "),
    });
    questionsByApp.set(f.applicationId, (questionsByApp.get(f.applicationId) ?? 0) + 1);
  }

  const planApps: PlanApp[] = openApps.map((a) => ({
    id: a.id,
    title: a.title,
    status: a.status,
    reviewTier: a.reviewTier,
    funderName: a.funderName,
    deadline: a.deadline ?? a.closeDate,
    openQuestions: questionsByApp.get(a.id) ?? 0,
  }));
  const appOpportunityIds = new Set(openApps.map((a) => a.opportunityId));
  const matchesForCalendar: CalendarMatch[] = calendarMatches;
  const countRows: FactCountRow[] = factCounts.map((r) => ({
    category: r.category,
    status: r.status,
    hasProject: Number(r.hasProject) === 1,
    n: Number(r.n),
  }));
  const coverage = coverageFromCounts(countRows);
  const factCount = countRows.reduce((n, r) => n + r.n, 0);
  const proposedFacts = countRows
    .filter((r) => r.status === "proposed")
    .reduce((n, r) => n + r.n, 0);
  const documentCount = Number(docCount?.n ?? 0);
  const applicationCount = Number(appCount?.n ?? 0);
  const focusAreas = profile?.focusAreas ?? [];

  const nextBestActions = rankActions({
    orgId,
    orgName: org.name,
    role,
    now,
    focusAreas,
    hasUei: !!profile?.uei?.trim(),
    documentCount,
    factCount,
    coverage,
    gapFlags,
    proposedByDocument: proposedByDoc.map((d) => ({ ...d, n: Number(d.n) })),
    proposedOther: Number(proposedOther?.n ?? 0),
    openApps: planApps,
    pendingManual: pendingManual.map((p) => ({ ...p, deadline: p.deadline ?? p.closeDate })),
    shortlistedDue: matchesForCalendar.filter(
      (m) => m.status === "shortlisted" && !appOpportunityIds.has(m.opportunityId),
    ),
    newMatchTexts: newMatches.map((m) =>
      [m.title, m.summary, ...(m.keywords ?? []), ...(m.categories ?? [])].join(" "),
    ),
    federalMatches: Number(federal?.n ?? 0),
  });

  const ev = (st: string) => pipeline.find((r) => r.status === st);
  const outcome = (st: string) => outcomes.find((r) => r.status === st);
  const awardedCount = Number(outcome("awarded")?.n ?? 0);
  const declinedCount = Number(outcome("declined")?.n ?? 0);
  const decided = awardedCount + declinedCount;
  const countStatus = (st: ApplicationStatus) => planApps.filter((a) => a.status === st).length;

  return {
    generatedAt: now.toISOString(),
    firstRun: documentCount === 0 && factCount === 0 && applicationCount === 0,
    greeting: {
      firstName: firstName(input.userName),
      orgName: org.name,
      role,
      focusAreas,
      serviceAreas: profile?.serviceAreas ?? [],
      orgTypeLabel: profile ? (ORG_TYPE_LABELS[profile.orgType] ?? "Organization") : "Organization",
      location: [profile?.city, profile?.state].filter((v) => v?.trim()).join(", ") || null,
    },
    nextBestActions,
    calendar: buildCalendar(orgId, planApps, matchesForCalendar, appOpportunityIds, now),
    pipelineValue: {
      expectedValueCents: Number(ev("shortlisted")?.ev ?? 0) + Number(ev("drafting")?.ev ?? 0),
      shortlistedCount: Number(ev("shortlisted")?.n ?? 0),
      draftingCount: Number(ev("drafting")?.n ?? 0),
      awardedCents: Number(outcome("awarded")?.awarded ?? 0),
      awardedCount,
      declinedCount,
      winRate: decided > 0 ? awardedCount / decided : null,
    },
    automationSummary: buildAutomationSummary(
      orgId,
      settings ?? { autopilotEnabled: false, autoSubmitMaxCents: 0 },
      {
        reviews: countStatus("in_review"),
        questions: countStatus("needs_info"),
        changesRequested: countStatus("changes_requested"),
        manualSubmissions: pendingManual.length,
        proposedFacts,
      },
    ),
  };
}
