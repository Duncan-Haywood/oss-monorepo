// Report drafting (`reports.draft`), editing, verification, submission and export. A report may
// report as achieved only outcome / metric facts dated in its period; promised goals come from the
// application's final (submitted) version; unknown metrics become gaps and a check-in interview.
import {
  AWARD_REPORT_KINDS,
  type AwardReportDetail,
  type ReportContent,
  type ReportFlag,
} from "@shared/api/awards";
import {
  type ApplicationContent,
  type GroundingReport,
  OpportunityRequirements,
  Paragraph,
} from "@shared/content";
import { and, desc, eq, inArray, ne } from "drizzle-orm";
import { z } from "zod";
import type { AppContext } from "../../context";
import {
  applications,
  applicationVersions,
  followups,
  interviews,
  organization,
  submissions,
} from "../../db/schema";
import { awardReports } from "../../db/schema/awards";
import { badRequest, conflict } from "../../lib/errors";
import type { ExportInput } from "../export";
import { deriveOrgNames, type FactRow as GroundingFact, verifyDraft } from "../grounding";
import { createAgendaInterview } from "../interview";
import { type FactRow, getFactsByIds, getFactsForDrafting } from "../knowledge";
import { getOrgProfile } from "../orgs";
import { audit } from "../privacy/audit";
import {
  buildReportContext,
  buildReportPrompt,
  REPORT_DRAFT_PURPOSE,
  REPORT_PROMPT_VERSION,
  REPORT_SECTIONS,
  REPORT_SYSTEM_PROMPT,
  ReportDraftOutput,
  type ReportGoal,
} from "./prompts";
import {
  gapQuestionFor,
  partitionReportFacts,
  postProcessReport,
  promisedGoals,
  reportCitedFactIds,
  reportGaps,
  verificationContent,
} from "./report-logic";
import { formatPeriod, parseIsoDate, REPORT_KIND_LABEL } from "./schedule";
import {
  type Actor,
  type AwardReportRow,
  type AwardRow,
  IsoDate,
  loadAward,
  loadReport,
  scheduleReportReminders,
} from "./service";

const MAX_CHECKIN_QUESTIONS = 8;
const EMPTY_REQUIREMENTS = OpportunityRequirements.parse({});

export const UpdateReportInput = z.object({
  kind: z.enum(AWARD_REPORT_KINDS).optional(),
  periodStart: IsoDate.optional(),
  periodEnd: IsoDate.optional(),
  dueDate: IsoDate.optional(),
  /** submitted only via POST .../submit */
  status: z.enum(["upcoming", "drafting", "in_review"]).optional(),
  /** Edit one section's text (the client rebuilds claims, as for applications). */
  section: z
    .object({ key: z.string().min(1).max(100), paragraphs: z.array(Paragraph).max(50) })
    .optional(),
});

export const SubmitReportInput = z.object({
  /** Funder portal confirmation number, email subject, etc. */
  externalRef: z.string().trim().max(500).optional(),
});

// ------------------------------------------------------------------------------------ inputs

/** The application's final version: the latest live submission's version, else the current one. */
async function finalApplicationContent(
  ctx: AppContext,
  orgId: string,
  applicationId: string | null,
): Promise<ApplicationContent | null> {
  if (!applicationId) return null;
  const app = await ctx.db
    .select({ currentVersionId: applications.currentVersionId })
    .from(applications)
    .where(and(eq(applications.id, applicationId), eq(applications.orgId, orgId)))
    .get();
  if (!app) return null;
  const sub = await ctx.db
    .select({ versionId: submissions.versionId })
    .from(submissions)
    .where(
      and(
        eq(submissions.orgId, orgId),
        eq(submissions.applicationId, applicationId),
        ne(submissions.status, "failed"),
      ),
    )
    .orderBy(desc(submissions.createdAt))
    .get();
  const versionId = sub?.versionId ?? app.currentVersionId;
  if (!versionId) return null;
  const v = await ctx.db
    .select({ content: applicationVersions.content })
    .from(applicationVersions)
    .where(
      and(
        eq(applicationVersions.id, versionId),
        eq(applicationVersions.orgId, orgId),
        eq(applicationVersions.applicationId, applicationId),
      ),
    )
    .get();
  return v?.content ?? null;
}

interface ReportFacts {
  period: FactRow[];
  background: FactRow[];
}

async function gatherFacts(
  ctx: AppContext,
  award: AwardRow,
  report: AwardReportRow,
): Promise<ReportFacts> {
  const all = await getFactsForDrafting(ctx, award.orgId, {
    projectId: award.projectId ?? undefined,
    includeProposed: true,
  });
  return partitionReportFacts(all, {
    start: report.periodStart,
    end: report.periodEnd,
    checkinInterviewIds: report.checkinInterviewIds,
  });
}

const toGrounding = (f: FactRow): GroundingFact => ({
  id: f.id,
  statement: f.statement,
  status: f.status,
  value: f.value,
  sourceQuote: f.sourceQuote,
  sensitivity: f.sensitivity,
  asOf: f.asOf,
  category: f.category,
});

async function orgName(ctx: AppContext, orgId: string): Promise<string> {
  const org = await ctx.db
    .select({ name: organization.name })
    .from(organization)
    .where(eq(organization.id, orgId))
    .get();
  return org?.name ?? "the organization";
}

/** Runs the grounding verifier on a report's sections and comparisons. */
export async function verifyReport(
  ctx: AppContext,
  input: { award: AwardRow; content: ReportContent; facts: ReportFacts; orgName: string },
): Promise<{ report: GroundingReport; flags: ReportFlag[] }> {
  const all = [...input.facts.period, ...input.facts.background].map(toGrounding);
  const { report, flags } = await verifyDraft(ctx, {
    orgId: input.award.orgId,
    applicationId: input.award.applicationId ?? input.award.id,
    content: verificationContent(input.content),
    facts: all,
    requirements: EMPTY_REQUIREMENTS,
    autopilot: false,
    allowedNames: [...deriveOrgNames(all), input.orgName, input.award.funderName],
  });
  return { report, flags };
}

// ------------------------------------------------------------------------------------ check-in

/** Opens (or keeps) a report check-in interview for the report's missing metrics. */
async function openCheckin(
  ctx: AppContext,
  award: AwardRow,
  report: AwardReportRow,
  questions: string[],
  userId: string,
): Promise<string[]> {
  const ids = report.checkinInterviewIds;
  if (questions.length === 0) return ids;
  const latestId = ids[ids.length - 1];
  if (latestId) {
    const latest = await ctx.db
      .select({ status: interviews.status })
      .from(interviews)
      .where(and(eq(interviews.id, latestId), eq(interviews.orgId, award.orgId)))
      .get();
    if (latest?.status === "active") return ids;
  }
  try {
    const { interviewId } = await createAgendaInterview(ctx, {
      orgId: award.orgId,
      kind: "follow_up",
      title: `Report check-in: ${REPORT_KIND_LABEL[report.kind]} for ${award.funderName}`,
      items: questions.slice(0, MAX_CHECKIN_QUESTIONS).map((question, i) => ({
        key: `report_metric_${i + 1}`,
        label: `Result ${i + 1}`,
        question,
      })),
      focusProjectId: award.projectId,
      focusApplicationId: award.applicationId,
      userId,
    });
    return [...ids, interviewId];
  } catch (e) {
    // e.g. AI interview consent revoked: the gaps stay on the report.
    ctx.logger.warn("award_report.checkin_failed", { reportId: report.id, error: String(e) });
    return ids;
  }
}

// ------------------------------------------------------------------------------------ draft

export async function draftReport(
  ctx: AppContext,
  input: { orgId: string; awardId: string; reportId: string } & Actor,
): Promise<AwardReportRow> {
  const award = await loadAward(ctx, input.orgId, input.awardId);
  const report = await loadReport(ctx, input.orgId, input.awardId, input.reportId);
  if (report.status === "submitted") throw conflict("This report was already submitted");
  const where = and(eq(awardReports.id, report.id), eq(awardReports.orgId, award.orgId));
  await ctx.db.update(awardReports).set({ status: "drafting" }).where(where);
  try {
    const [facts, appContent, name] = await Promise.all([
      gatherFacts(ctx, award, report),
      finalApplicationContent(ctx, award.orgId, award.applicationId),
      orgName(ctx, award.orgId),
    ]);
    const goals: ReportGoal[] = promisedGoals(appContent);
    const promptInput = {
      orgName: name,
      funderName: award.funderName,
      awardTitle: award.title,
      amountCents: award.amountCents,
      grantNumber: award.grantNumber,
      grantStart: award.startDate,
      grantEnd: award.endDate,
      kind: report.kind,
      periodStart: report.periodStart,
      periodEnd: report.periodEnd,
      dueAt: report.dueAt,
      goals,
      periodFacts: facts.period,
      backgroundFacts: facts.background,
    };
    const { data } = await ctx.llm.generateStructured({
      purpose: REPORT_DRAFT_PURPOSE,
      orgId: award.orgId,
      applicationId: award.applicationId,
      system: REPORT_SYSTEM_PROMPT,
      context: buildReportContext(promptInput),
      prompt: buildReportPrompt(promptInput),
      schema: ReportDraftOutput,
      effort: "high",
      maxTokens: 16_000,
    });
    const period = { start: report.periodStart, end: report.periodEnd };
    const content = postProcessReport({
      raw: data,
      sections: REPORT_SECTIONS[report.kind],
      goals,
      periodFacts: facts.period.map(toGrounding),
      backgroundFacts: facts.background.map(toGrounding),
      period,
      asOfYear: ctx.now().getUTCFullYear(),
    });
    const verified = await verifyReport(ctx, { award, content, facts, orgName: name });
    // Unknown promised metrics first, then the sections' other open questions.
    const goalQuestions = content.comparisons
      .filter((c) => c.status === "unknown")
      .map((c) => goals.find((g) => g.id === c.goalId))
      .filter((g): g is ReportGoal => !!g)
      .map((g) => gapQuestionFor(g, period));
    const questions = [
      ...new Set([...goalQuestions, ...reportGaps(content).map((g) => g.question)]),
    ];
    const checkinInterviewIds = await openCheckin(ctx, award, report, questions, input.userId);
    const updated = await ctx.db
      .update(awardReports)
      .set({
        versionContent: content,
        versionNumber: report.versionNumber + 1,
        groundingReport: verified.report,
        flags: verified.flags,
        status: "in_review",
        checkinInterviewIds,
      })
      .where(where)
      .returning()
      .get();
    await audit(ctx, {
      orgId: award.orgId,
      actorType: "user",
      actorId: input.userId,
      action: "award_report.drafted",
      targetType: "award_report",
      targetId: report.id,
      metadata: {
        awardId: award.id,
        versionNumber: updated.versionNumber,
        promptVersion: REPORT_PROMPT_VERSION,
        periodFacts: facts.period.length,
        gaps: verified.report.gaps,
        passed: verified.report.passed,
      },
      requestId: input.requestId,
    });
    return updated;
  } catch (e) {
    await ctx.db.update(awardReports).set({ status: report.status }).where(where);
    throw e;
  }
}

// ------------------------------------------------------------------------------------ edit

export async function updateReport(
  ctx: AppContext,
  input: {
    orgId: string;
    awardId: string;
    reportId: string;
    patch: z.infer<typeof UpdateReportInput>;
  } & Actor,
): Promise<AwardReportRow> {
  const award = await loadAward(ctx, input.orgId, input.awardId);
  const report = await loadReport(ctx, input.orgId, input.awardId, input.reportId);
  const { patch } = input;
  if (report.status === "submitted" && (patch.section || patch.status)) {
    throw conflict("This report was already submitted");
  }
  const set: Partial<typeof awardReports.$inferInsert> = {};
  if (patch.kind) set.kind = patch.kind;
  if (patch.periodStart) set.periodStart = patch.periodStart;
  if (patch.periodEnd) set.periodEnd = patch.periodEnd;
  if (patch.dueDate) {
    const due = parseIsoDate(patch.dueDate);
    if (!due) throw badRequest("Invalid due date");
    set.dueAt = due;
  }
  if (patch.status) set.status = patch.status;
  const start = set.periodStart ?? report.periodStart;
  const end = set.periodEnd ?? report.periodEnd;
  if (end < start) throw badRequest("The period ends before it starts");

  if (patch.section) {
    const content = report.versionContent;
    const target = content?.sections.find((s) => s.key === patch.section?.key);
    if (!content || !target) throw badRequest("Unknown section");
    const next: ReportContent = {
      ...content,
      sections: content.sections.map((s) =>
        s.key === target.key ? { ...s, paragraphs: patch.section?.paragraphs ?? [] } : s,
      ),
    };
    const merged = { ...report, periodStart: start, periodEnd: end };
    const [facts, name] = await Promise.all([
      gatherFacts(ctx, award, merged),
      orgName(ctx, award.orgId),
    ]);
    const verified = await verifyReport(ctx, { award, content: next, facts, orgName: name });
    set.versionContent = next;
    set.versionNumber = report.versionNumber + 1;
    set.groundingReport = verified.report;
    set.flags = verified.flags;
    if (!patch.status && report.status === "upcoming") set.status = "in_review";
  }
  if (Object.keys(set).length === 0) return report;
  const updated = await ctx.db
    .update(awardReports)
    .set(set)
    .where(and(eq(awardReports.id, report.id), eq(awardReports.orgId, award.orgId)))
    .returning()
    .get();
  if (set.dueAt || set.kind) await scheduleReportReminders(ctx, award, updated);
  await audit(ctx, {
    orgId: award.orgId,
    actorType: "user",
    actorId: input.userId,
    action: patch.section ? "award_report.edited" : "award_report.updated",
    targetType: "award_report",
    targetId: report.id,
    metadata: { awardId: award.id, fields: Object.keys(set), sectionKey: patch.section?.key },
    requestId: input.requestId,
  });
  return updated;
}

export async function submitReport(
  ctx: AppContext,
  input: { orgId: string; awardId: string; reportId: string; externalRef?: string } & Actor,
): Promise<AwardReportRow> {
  const award = await loadAward(ctx, input.orgId, input.awardId);
  const report = await loadReport(ctx, input.orgId, input.awardId, input.reportId);
  if (report.status === "submitted") throw conflict("This report was already submitted");
  const updated = await ctx.db
    .update(awardReports)
    .set({
      status: "submitted",
      submittedAt: ctx.now(),
      submittedRef: input.externalRef?.trim() || null,
      submittedBy: input.userId,
    })
    .where(and(eq(awardReports.id, report.id), eq(awardReports.orgId, award.orgId)))
    .returning()
    .get();
  await scheduleReportReminders(ctx, award, updated); // skips the pending reminders
  await audit(ctx, {
    orgId: award.orgId,
    actorType: "user",
    actorId: input.userId,
    action: "award_report.submitted",
    targetType: "award_report",
    targetId: report.id,
    metadata: {
      awardId: award.id,
      kind: report.kind,
      externalRef: updated.submittedRef,
      versionNumber: report.versionNumber,
      groundingPassed: report.groundingReport?.passed ?? null,
    },
    requestId: input.requestId,
  });
  return updated;
}

// ------------------------------------------------------------------------------------ read

export async function getReportDetail(
  ctx: AppContext,
  orgId: string,
  awardId: string,
  reportId: string,
): Promise<AwardReportDetail> {
  const award = await loadAward(ctx, orgId, awardId);
  const report = await loadReport(ctx, orgId, awardId, reportId);
  const cited = reportCitedFactIds(report.versionContent);
  const citedFacts = cited.length ? await getFactsByIds(ctx, orgId, cited) : [];
  const latestId = report.checkinInterviewIds[report.checkinInterviewIds.length - 1];
  const checkin = latestId
    ? ((await ctx.db
        .select({ id: interviews.id, status: interviews.status, title: interviews.title })
        .from(interviews)
        .where(and(eq(interviews.id, latestId), eq(interviews.orgId, orgId)))
        .get()) ?? null)
    : null;
  // JSON serialization turns Dates into ISO strings, which is the DTO shape.
  return JSON.parse(
    JSON.stringify({
      ...report,
      award,
      citedFacts,
      gaps: reportGaps(report.versionContent),
      checkinInterview: checkin,
    }),
  ) as AwardReportDetail;
}

/** Pending report_due follow-ups for these reports (used by tests and the award detail). */
export async function pendingReportFollowups(ctx: AppContext, orgId: string, reportIds: string[]) {
  if (reportIds.length === 0) return [];
  const keys = reportIds.flatMap((id) => [30, 14, 3].map((d) => `report_due:${id}:${d}d`));
  return ctx.db
    .select()
    .from(followups)
    .where(and(eq(followups.orgId, orgId), inArray(followups.dedupeKey, keys)))
    .all();
}

// ------------------------------------------------------------------------------------ export

/** The report as the export module's input (it renders it like an application, relabelled). */
export async function loadReportExportInput(
  ctx: AppContext,
  orgId: string,
  awardId: string,
  reportId: string,
): Promise<ExportInput> {
  const award = await loadAward(ctx, orgId, awardId);
  const report = await loadReport(ctx, orgId, awardId, reportId);
  if (!report.versionContent) throw conflict("This report has no draft to export yet");
  const cited = reportCitedFactIds(report.versionContent);
  const facts = cited.length ? await getFactsByIds(ctx, orgId, cited) : [];
  const profile = await getOrgProfile(ctx, orgId);
  const label = REPORT_KIND_LABEL[report.kind];
  return {
    generatedAt: ctx.now(),
    org: { legalName: profile.legalName, dba: profile.dba, ein: profile.ein, uei: profile.uei },
    application: {
      id: report.id,
      title: `${label}: ${award.title}`,
      requestedAmountCents: award.amountCents,
      deadline: report.dueAt,
    },
    opportunity: {
      title: `${award.title} (${formatPeriod(report.periodStart, report.periodEnd)})`,
      funderName: award.funderName,
      opportunityNumber: award.grantNumber,
      closeDate: null,
    },
    requirements: null,
    version: {
      id: report.id,
      versionNumber: Math.max(1, report.versionNumber),
      content: verificationContent(report.versionContent),
      executiveSummary: "",
      keyPoints: [],
    },
    facts: facts.map((f) => ({ id: f.id, statement: f.statement, sourceQuote: f.sourceQuote })),
    labels: {
      subtitle: `${label} to ${award.funderName}`,
      opportunity: "Grant",
      deadline: "Report due",
      amount: "Amount awarded",
    },
  };
}
