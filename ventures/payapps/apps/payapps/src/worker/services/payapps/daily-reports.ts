// Daily reports (field logs) per job: create, change, delete, the log with its summary, one report
// for the PDF and the log for the CSV. Every query filters by org_id and the job; the rules (dates,
// temperatures, hours, crew lines, missing weekdays) are pure in @shared/daily-reports. On every
// plan: a field log is part of running the job, like the RFI and submittal logs.
import type { DailyReportInputBody, DailyReportUpdateBody } from "@shared/api/schemas";
import type { DailyReportDto, DailyReportLogDto } from "@shared/api/types";
import {
  addDays,
  type CompanyDailyReportJob,
  crewTotals,
  DAILY_REPORT_ACTIVE_DAYS,
  type DailyReportFacts,
  dailyReportProblem,
  suggestedReportDate,
  summarizeDailyReports,
} from "@shared/daily-reports";
import { ROLE_RANK } from "@shared/enums";
import { activityDelayLabel } from "@shared/schedule-delays";
import { and, asc, desc, eq, gte, inArray, min } from "drizzle-orm";
import type { AppContext } from "../../context";
import { dailyReports, organization, projects, scheduleActivities, user } from "../../db/schema";
import { badRequest, conflict, notFound } from "../../lib/errors";
import { newId } from "../../lib/ids";
import type { Tenant } from "../../types";
import { getProjectRow, type ProjectRow } from "./bundle";
import { dailyReportFileCounts } from "./daily-report-files";
import { loadHolidayCalendar } from "./holidays";

type Row = typeof dailyReports.$inferSelect;

const today = (ctx: AppContext) => ctx.now().toISOString().slice(0, 10);
/** Tomorrow in UTC: a contractor west of UTC files tonight's report after UTC midnight. */
const latest = (ctx: AppContext) => addDays(today(ctx), 1);

/** Blank strings stored as null, so a cleared field reads as "not entered". */
const blank = (v: string | null | undefined) => (v?.trim() ? v.trim() : null);

const TEXT_KEYS = [
  "weather",
  "workPerformed",
  "delays",
  "equipment",
  "deliveries",
  "visitors",
  "safety",
  "notes",
] as const;

/** The job's schedule activities as the report form offers them for "the activity it held up". */
async function jobActivities(ctx: AppContext, orgId: string, projectId: string) {
  const list = await ctx.db
    .select({
      id: scheduleActivities.id,
      number: scheduleActivities.number,
      name: scheduleActivities.name,
    })
    .from(scheduleActivities)
    .where(and(eq(scheduleActivities.orgId, orgId), eq(scheduleActivities.projectId, projectId)))
    .orderBy(asc(scheduleActivities.number))
    .all();
  return list.map((a) => ({ id: a.id, label: activityDelayLabel(a) }));
}

type Labels = Map<string, string>;
const labelsOf = (list: { id: string; label: string }[]): Labels =>
  new Map(list.map((a) => [a.id, a.label]));

/** Refuses an activity that is not on this job's schedule (another job's, or another company's). */
async function checkActivity(
  ctx: AppContext,
  orgId: string,
  projectId: string,
  activityId: string | null | undefined,
) {
  if (!activityId) return;
  const found = await ctx.db
    .select({ id: scheduleActivities.id })
    .from(scheduleActivities)
    .where(
      and(
        eq(scheduleActivities.id, activityId),
        eq(scheduleActivities.orgId, orgId),
        eq(scheduleActivities.projectId, projectId),
      ),
    )
    .get();
  if (!found) throw badRequest("That activity is not on this job's schedule");
}

function toDto(
  r: Row,
  names: Map<string, string>,
  fileCount = 0,
  labels: Labels = new Map(),
): DailyReportDto {
  const totals = crewTotals(r.crew);
  return {
    id: r.id,
    reportDate: r.reportDate,
    weather: r.weather,
    tempHighF: r.tempHighF,
    tempLowF: r.tempLowF,
    delayHours: r.delayHours,
    crew: r.crew,
    workPerformed: r.workPerformed,
    delays: r.delays,
    delayActivityId: r.delayActivityId,
    delayActivityLabel: r.delayActivityId ? (labels.get(r.delayActivityId) ?? null) : null,
    equipment: r.equipment,
    deliveries: r.deliveries,
    visitors: r.visitors,
    safety: r.safety,
    notes: r.notes,
    workers: totals.workers,
    manHours: totals.manHours,
    fileCount,
    createdByName: r.createdBy ? (names.get(r.createdBy) ?? null) : null,
    updatedByName: r.updatedBy ? (names.get(r.updatedBy) ?? null) : null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

async function userNames(ctx: AppContext, list: Row[]) {
  const ids = [
    ...new Set(list.flatMap((r) => [r.createdBy, r.updatedBy]).filter((x): x is string => !!x)),
  ];
  if (ids.length === 0) return new Map<string, string>();
  const found = await ctx.db
    .select({ id: user.id, name: user.name })
    .from(user)
    .where(inArray(user.id, ids))
    .all();
  return new Map(found.map((u) => [u.id, u.name]));
}

async function rows(ctx: AppContext, orgId: string, projectId: string) {
  return ctx.db
    .select()
    .from(dailyReports)
    .where(and(eq(dailyReports.orgId, orgId), eq(dailyReports.projectId, projectId)))
    .orderBy(desc(dailyReports.reportDate))
    .all();
}

async function getRow(ctx: AppContext, orgId: string, projectId: string, id: string) {
  const row = await ctx.db
    .select()
    .from(dailyReports)
    .where(
      and(
        eq(dailyReports.id, id),
        eq(dailyReports.orgId, orgId),
        eq(dailyReports.projectId, projectId),
      ),
    )
    .get();
  if (!row) throw notFound("Daily report");
  return row;
}

async function oneDto(ctx: AppContext, row: Row) {
  const [counts, acts] = await Promise.all([
    dailyReportFileCounts(ctx, row.orgId, row.projectId),
    jobActivities(ctx, row.orgId, row.projectId),
  ]);
  return toDto(row, await userNames(ctx, [row]), counts.get(row.id) ?? 0, labelsOf(acts));
}

/** One report as the API returns it (the route reads it before a change, for the job history). */
export async function getDailyReport(
  ctx: AppContext,
  orgId: string,
  projectId: string,
  reportId: string,
): Promise<DailyReportDto> {
  return oneDto(ctx, await getRow(ctx, orgId, projectId, reportId));
}

function check(
  facts: Pick<DailyReportFacts, "reportDate" | "tempHighF" | "tempLowF" | "delayHours" | "crew">,
  ctx: AppContext,
) {
  const problem = dailyReportProblem(facts, latest(ctx));
  if (problem) throw badRequest(problem);
}

const isUniqueViolation = (err: unknown) =>
  err instanceof Error && /UNIQUE constraint failed/i.test(`${err.message} ${err.cause}`);

const cleanCrew = (crew: DailyReportInputBody["crew"]) =>
  (crew ?? []).map((l) => ({
    company: blank(l.company),
    trade: l.trade.trim(),
    workers: l.workers,
    hoursEach: l.hoursEach,
  }));

export async function dailyReportLog(
  ctx: AppContext,
  tenant: Tenant,
  projectId: string,
): Promise<DailyReportLogDto> {
  const p = await getProjectRow(ctx, tenant.orgId, projectId);
  const [list, counts, acts, holidays] = await Promise.all([
    rows(ctx, tenant.orgId, projectId),
    dailyReportFileCounts(ctx, tenant.orgId, projectId),
    jobActivities(ctx, tenant.orgId, projectId),
    loadHolidayCalendar(ctx, tenant.orgId),
  ]);
  const names = await userNames(ctx, list);
  const labels = labelsOf(acts);
  const day = today(ctx);
  return {
    projectName: p.name,
    gcName: p.gcName,
    items: list.map((r) => toDto(r, names, counts.get(r.id) ?? 0, labels)),
    activities: acts,
    summary: summarizeDailyReports(list, day, holidays),
    suggestedDate: suggestedReportDate(
      list.map((r) => r.reportDate),
      day,
      holidays,
    ),
    latestDate: latest(ctx),
    canEdit: ROLE_RANK[tenant.role] >= ROLE_RANK.editor,
  };
}

const dayTaken = (date: string) =>
  conflict(`There is already a daily report for ${date} on this job: open it to add to it`);

export async function createDailyReport(
  ctx: AppContext,
  tenant: Tenant,
  projectId: string,
  input: DailyReportInputBody,
): Promise<DailyReportDto> {
  await getProjectRow(ctx, tenant.orgId, projectId);
  const values = {
    reportDate: input.reportDate,
    tempHighF: input.tempHighF ?? null,
    tempLowF: input.tempLowF ?? null,
    delayHours: input.delayHours ?? null,
    crew: cleanCrew(input.crew),
    weather: blank(input.weather),
    workPerformed: blank(input.workPerformed),
    delays: blank(input.delays),
    equipment: blank(input.equipment),
    deliveries: blank(input.deliveries),
    visitors: blank(input.visitors),
    safety: blank(input.safety),
    notes: blank(input.notes),
    delayActivityId: input.delayActivityId ?? null,
  };
  check(values, ctx);
  await checkActivity(ctx, tenant.orgId, projectId, values.delayActivityId);
  const id = newId("dly");
  try {
    await ctx.db.insert(dailyReports).values({
      id,
      orgId: tenant.orgId,
      projectId,
      ...values,
      createdBy: tenant.userId,
      updatedBy: tenant.userId,
    });
  } catch (err) {
    if (isUniqueViolation(err)) throw dayTaken(values.reportDate);
    throw err;
  }
  return oneDto(ctx, await getRow(ctx, tenant.orgId, projectId, id));
}

export async function updateDailyReport(
  ctx: AppContext,
  tenant: Tenant,
  projectId: string,
  reportId: string,
  input: DailyReportUpdateBody,
): Promise<DailyReportDto> {
  const row = await getRow(ctx, tenant.orgId, projectId, reportId);
  const patch: Partial<typeof dailyReports.$inferInsert> = {};
  if (input.reportDate !== undefined) patch.reportDate = input.reportDate;
  for (const k of ["tempHighF", "tempLowF", "delayHours"] as const) {
    if (input[k] !== undefined) patch[k] = input[k] ?? null;
  }
  if (input.crew !== undefined) patch.crew = cleanCrew(input.crew);
  for (const k of TEXT_KEYS) if (input[k] !== undefined) patch[k] = blank(input[k]);
  if (input.delayActivityId !== undefined) {
    patch.delayActivityId = input.delayActivityId ?? null;
    await checkActivity(ctx, tenant.orgId, projectId, patch.delayActivityId);
  }
  const next = { ...row, ...patch } as Row;
  check(next, ctx);
  if (Object.keys(patch).length > 0) {
    try {
      await ctx.db
        .update(dailyReports)
        .set({ ...patch, updatedBy: tenant.userId })
        .where(
          and(
            eq(dailyReports.id, reportId),
            eq(dailyReports.orgId, tenant.orgId),
            eq(dailyReports.projectId, projectId),
          ),
        );
    } catch (err) {
      if (isUniqueViolation(err)) throw dayTaken(next.reportDate);
      throw err;
    }
  }
  return oneDto(ctx, await getRow(ctx, tenant.orgId, projectId, reportId));
}

export async function deleteDailyReport(
  ctx: AppContext,
  orgId: string,
  projectId: string,
  reportId: string,
) {
  await getRow(ctx, orgId, projectId, reportId);
  await ctx.db
    .delete(dailyReports)
    .where(
      and(
        eq(dailyReports.id, reportId),
        eq(dailyReports.orgId, orgId),
        eq(dailyReports.projectId, projectId),
      ),
    );
}

export interface DailyReportDocument {
  contractor: { name: string };
  project: Pick<
    ProjectRow,
    "name" | "number" | "location" | "gcName" | "ownerName" | "architectName" | "isSample"
  >;
  reports: DailyReportDto[];
}

async function contractor(ctx: AppContext, orgId: string) {
  const org = await ctx.db
    .select({ name: organization.name })
    .from(organization)
    .where(eq(organization.id, orgId))
    .get();
  if (!org) throw notFound("Organization");
  return org;
}

/**
 * What the PDF prints: the job's parties and the reports asked for, oldest first. One report by id,
 * or every report from `from` to `to` (inclusive) for a week's or a month's reports in one file.
 */
export async function loadDailyReportDocument(
  ctx: AppContext,
  orgId: string,
  projectId: string,
  pick: { reportId: string } | { from: string; to: string },
): Promise<DailyReportDocument> {
  const [project, org] = await Promise.all([
    getProjectRow(ctx, orgId, projectId),
    contractor(ctx, orgId),
  ]);
  let list: Row[];
  if ("reportId" in pick) {
    list = [await getRow(ctx, orgId, projectId, pick.reportId)];
  } else {
    if (pick.from > pick.to) throw badRequest("The range starts after it ends");
    if (pick.to > addDays(pick.from, 92)) throw badRequest("Pick at most three months at a time");
    list = (await rows(ctx, orgId, projectId))
      .filter((r) => r.reportDate >= pick.from && r.reportDate <= pick.to)
      .reverse();
    if (list.length === 0) throw notFound("Daily reports in that range");
  }
  const [names, acts] = await Promise.all([
    userNames(ctx, list),
    jobActivities(ctx, orgId, projectId),
  ]);
  const labels = labelsOf(acts);
  return {
    contractor: org,
    project,
    reports: list.map((r) => toDto(r, names, 0, labels)),
  };
}

/** The job's reports for the CSV, oldest first, plus the job (file name) and the contractor (own crew). */
export async function loadDailyReportLog(ctx: AppContext, orgId: string, projectId: string) {
  const [project, org, list] = await Promise.all([
    getProjectRow(ctx, orgId, projectId),
    contractor(ctx, orgId),
    rows(ctx, orgId, projectId),
  ]);
  list.reverse();
  const [names, acts] = await Promise.all([
    userNames(ctx, list),
    jobActivities(ctx, orgId, projectId),
  ]);
  const labels = labelsOf(acts);
  return {
    project,
    contractorName: org.name,
    reports: list.map((r) => toDto(r, names, 0, labels)),
  };
}

/**
 * Every active job's recent daily log, for the weekly email's "weekdays without a daily report" line
 * (src/shared/daily-reports.ts, dailyReportGaps): the jobs with a report in the last
 * DAILY_REPORT_ACTIVE_DAYS days (one more, for a member east of UTC), each with those dates and its
 * first report ever. Filtered by org_id on both tables.
 */
export async function companyDailyReportJobs(
  ctx: AppContext,
  orgId: string,
  opts: { excludeSample?: boolean } = {},
): Promise<CompanyDailyReportJob[]> {
  const since = addDays(today(ctx), -(DAILY_REPORT_ACTIVE_DAYS + 1));
  const conds = [
    eq(dailyReports.orgId, orgId),
    eq(projects.orgId, orgId),
    eq(projects.status, "active"),
    gte(dailyReports.reportDate, since),
  ];
  if (opts.excludeSample) conds.push(eq(projects.isSample, false));
  const recent = await ctx.db
    .select({
      projectId: dailyReports.projectId,
      projectName: projects.name,
      projectNumber: projects.number,
      gcName: projects.gcName,
      reportDate: dailyReports.reportDate,
    })
    .from(dailyReports)
    .innerJoin(projects, eq(projects.id, dailyReports.projectId))
    .where(and(...conds))
    .all();
  if (recent.length === 0) return [];
  const ids = [...new Set(recent.map((r) => r.projectId))];
  const firsts = await ctx.db
    .select({ projectId: dailyReports.projectId, first: min(dailyReports.reportDate) })
    .from(dailyReports)
    .where(and(eq(dailyReports.orgId, orgId), inArray(dailyReports.projectId, ids)))
    .groupBy(dailyReports.projectId)
    .all();
  const firstOf = new Map(firsts.map((f) => [f.projectId, f.first]));
  const jobs = new Map<string, CompanyDailyReportJob>();
  for (const r of recent) {
    let j = jobs.get(r.projectId);
    if (!j) {
      j = {
        projectId: r.projectId,
        projectName: r.projectName,
        projectNumber: r.projectNumber,
        gcName: r.gcName,
        firstReportDate: firstOf.get(r.projectId) ?? r.reportDate,
        reportDates: [],
      };
      jobs.set(r.projectId, j);
    }
    j.reportDates.push(r.reportDate);
  }
  return [...jobs.values()];
}
