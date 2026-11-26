// Awards: created when an application's outcome is recorded as awarded (or entered by hand), with
// a default report schedule, report_due follow-ups and the "Awarded $X by <funder>" fact that
// future applications can cite. Every query is scoped by orgId.
import { AWARD_REPORT_KINDS } from "@shared/api/awards";
import { and, asc, desc, eq, inArray, isNull, like } from "drizzle-orm";
import { z } from "zod";
import type { AppContext } from "../../context";
import { applications, facts, followups, opportunities, projects } from "../../db/schema";
import { awardReports, awards } from "../../db/schema/awards";
import { badRequest, conflict, notFound } from "../../lib/errors";
import { newId } from "../../lib/ids";
import { createUserFact } from "../knowledge";
import { audit } from "../privacy/audit";
import {
  awardFactStatement,
  defaultReportSchedule,
  formatPeriod,
  ISO_DATE_RE,
  isoDateOrNull,
  parseIsoDate,
  REPORT_KIND_LABEL,
  REPORT_REMINDER_DAYS,
  reminderDates,
  type ScheduledReport,
} from "./schedule";

export type AwardRow = typeof awards.$inferSelect;
export type AwardReportRow = typeof awardReports.$inferSelect;

export const newAwardId = () => `awd_${newId("org").slice(4)}`;
export const newReportId = () => `rpt_${newId("org").slice(4)}`;

export const IsoDate = z
  .string()
  .regex(ISO_DATE_RE, "Use yyyy-mm-dd")
  .refine((s) => parseIsoDate(s) !== null, "Not a real date");

/** Grant terms that can be given when recording the award outcome or edited later. */
export const AwardTermsInput = z.object({
  startDate: IsoDate.nullish(),
  endDate: IsoDate.nullish(),
  grantNumber: z.string().trim().max(200).nullish(),
  termsNotes: z.string().max(10_000).optional(),
});
export type AwardTermsInput = z.infer<typeof AwardTermsInput>;

export const CreateAwardInput = AwardTermsInput.extend({
  /** Award for an application already marked awarded; omit for a grant won outside the app. */
  applicationId: z.string().min(1).max(100).optional(),
  funderName: z.string().trim().min(1).max(300).optional(),
  title: z.string().trim().min(1).max(300).optional(),
  amountCents: z.number().int().nonnegative().nullish(),
  projectId: z.string().min(1).max(100).nullish(),
});

export const UpdateAwardInput = AwardTermsInput.extend({
  title: z.string().trim().min(1).max(300).optional(),
  funderName: z.string().trim().min(1).max(300).optional(),
  amountCents: z.number().int().nonnegative().nullish(),
});

export const CreateReportInput = z.object({
  kind: z.enum(AWARD_REPORT_KINDS),
  periodStart: IsoDate,
  periodEnd: IsoDate,
  dueDate: IsoDate,
});

export interface Actor {
  userId: string;
  requestId?: string;
}

function assertDateOrder(start: string | null | undefined, end: string | null | undefined) {
  if (start && end && end < start) throw badRequest("The end date is before the start date");
}

// ------------------------------------------------------------------------------------ reads

export async function loadAward(ctx: AppContext, orgId: string, id: string): Promise<AwardRow> {
  const row = await ctx.db
    .select()
    .from(awards)
    .where(and(eq(awards.id, id), eq(awards.orgId, orgId)))
    .get();
  if (!row) throw notFound("Award");
  return row;
}

export async function loadReport(
  ctx: AppContext,
  orgId: string,
  awardId: string,
  reportId: string,
): Promise<AwardReportRow> {
  const row = await ctx.db
    .select()
    .from(awardReports)
    .where(
      and(
        eq(awardReports.id, reportId),
        eq(awardReports.awardId, awardId),
        eq(awardReports.orgId, orgId),
      ),
    )
    .get();
  if (!row) throw notFound("Report");
  return row;
}

async function reportsOf(ctx: AppContext, orgId: string, awardIds: string[]) {
  if (awardIds.length === 0) return [];
  return ctx.db
    .select()
    .from(awardReports)
    .where(and(eq(awardReports.orgId, orgId), inArray(awardReports.awardId, awardIds)))
    .orderBy(asc(awardReports.dueAt))
    .all();
}

const nextOpen = (reports: AwardReportRow[]) =>
  reports.find((r) => r.status !== "submitted") ?? null;

export async function listAwards(ctx: AppContext, orgId: string) {
  const rows = await ctx.db
    .select()
    .from(awards)
    .where(eq(awards.orgId, orgId))
    .orderBy(desc(awards.createdAt))
    .limit(200)
    .all();
  const reports = await reportsOf(
    ctx,
    orgId,
    rows.map((a) => a.id),
  );
  return rows.map((a) => {
    const mine = reports.filter((r) => r.awardId === a.id);
    return { ...a, reports: mine, nextReport: nextOpen(mine) };
  });
}

/** report_due follow-ups of these reports (dedupe keys "report_due:{reportId}:{n}d"). */
async function reportFollowups(ctx: AppContext, orgId: string, reportIds: string[]) {
  if (reportIds.length === 0) return [];
  const rows = await ctx.db
    .select()
    .from(followups)
    .where(
      and(
        eq(followups.orgId, orgId),
        eq(followups.kind, "report_due"),
        like(followups.dedupeKey, "report_due:%"),
      ),
    )
    .orderBy(asc(followups.dueAt))
    .limit(500)
    .all();
  const ids = new Set(reportIds);
  return rows.filter((f) => ids.has(f.dedupeKey?.split(":")[1] ?? ""));
}

export async function getAwardDetail(ctx: AppContext, orgId: string, id: string) {
  const award = await loadAward(ctx, orgId, id);
  const reports = await reportsOf(ctx, orgId, [award.id]);
  const application = award.applicationId
    ? ((await ctx.db
        .select({ id: applications.id, title: applications.title, status: applications.status })
        .from(applications)
        .where(and(eq(applications.id, award.applicationId), eq(applications.orgId, orgId)))
        .get()) ?? null)
    : null;
  const fups = await reportFollowups(
    ctx,
    orgId,
    reports.map((r) => r.id),
  );
  return { ...award, reports, application, followups: fups };
}

// ------------------------------------------------------------------------------------ fact

/** Records "Awarded $X by <funder> in <year> for <title>." as a confirmed user_entered fact. */
async function createAwardFact(
  ctx: AppContext,
  award: AwardRow,
  year: number,
  actor: Actor,
): Promise<string> {
  const statement = awardFactStatement({
    amountCents: award.amountCents,
    funderName: award.funderName,
    year,
    title: award.title,
  });
  const existing = await ctx.db
    .select({ id: facts.id })
    .from(facts)
    .where(and(eq(facts.orgId, award.orgId), eq(facts.statement, statement)))
    .get();
  const factId =
    existing?.id ??
    (
      await createUserFact(
        ctx,
        award.orgId,
        {
          category: "financial",
          statement,
          value: {
            number: award.amountCents ? award.amountCents / 100 : null,
            unit: award.amountCents ? "USD" : null,
            year,
            text: null,
          },
          asOf: String(year),
          projectId: null,
          sensitivity: "internal",
        },
        actor,
      )
    ).id;
  await ctx.db
    .update(awards)
    .set({ factId })
    .where(and(eq(awards.id, award.id), eq(awards.orgId, award.orgId)));
  return factId;
}

// ------------------------------------------------------------------------------------ schedule

/**
 * report_due follow-ups 30/14/3 days before the report is due. Idempotent (dedupe keys); a moved
 * due date moves reminders that haven't fired, and reminders now in the past (or of a submitted
 * report) are skipped.
 */
export async function scheduleReportReminders(
  ctx: AppContext,
  award: AwardRow,
  report: AwardReportRow,
): Promise<void> {
  const { orgId } = award;
  const now = ctx.now();
  const label = REPORT_KIND_LABEL[report.kind];
  const dueDay = report.dueAt.toISOString().slice(0, 10);
  const upcoming = new Map(reminderDates(report.dueAt, now).map((r) => [r.days, r.at]));
  for (const days of REPORT_REMINDER_DAYS) {
    const dedupeKey = `report_due:${report.id}:${days}d`;
    const at = upcoming.get(days);
    if (!at || report.status === "submitted") {
      await ctx.db
        .update(followups)
        .set({
          status: "skipped",
          notes: report.status === "submitted" ? "Report submitted" : "Reminder date has passed",
        })
        .where(
          and(
            eq(followups.orgId, orgId),
            eq(followups.dedupeKey, dedupeKey),
            eq(followups.status, "pending"),
            isNull(followups.notifiedAt),
          ),
        );
      continue;
    }
    const title = `${label} for ${award.funderName} is due in ${days} days (${dueDay})`;
    const notes = `"${award.title}": reporting period ${formatPeriod(report.periodStart, report.periodEnd)}.`;
    await ctx.db
      .insert(followups)
      .values({
        id: newId("fup"),
        orgId,
        applicationId: award.applicationId,
        kind: "report_due",
        title,
        notes,
        dueAt: at,
        dedupeKey,
      })
      .onConflictDoNothing();
    await ctx.db
      .update(followups)
      .set({ dueAt: at, title, notes })
      .where(
        and(
          eq(followups.orgId, orgId),
          eq(followups.dedupeKey, dedupeKey),
          eq(followups.status, "pending"),
          isNull(followups.notifiedAt),
        ),
      );
  }
}

async function insertReports(
  ctx: AppContext,
  award: AwardRow,
  schedule: ScheduledReport[],
): Promise<AwardReportRow[]> {
  const out: AwardReportRow[] = [];
  for (const s of schedule) {
    const row = await ctx.db
      .insert(awardReports)
      .values({
        id: newReportId(),
        orgId: award.orgId,
        awardId: award.id,
        kind: s.kind,
        periodStart: s.periodStart,
        periodEnd: s.periodEnd,
        dueAt: s.dueAt,
        status: "upcoming",
      })
      .returning()
      .get();
    await scheduleReportReminders(ctx, award, row);
    out.push(row);
  }
  return out;
}

/** Default schedule (interim at the midpoint, final 30 days after the end) when none exists yet. */
async function ensureDefaultSchedule(ctx: AppContext, award: AwardRow): Promise<void> {
  const existing = await reportsOf(ctx, award.orgId, [award.id]);
  if (existing.length > 0) return;
  await insertReports(ctx, award, defaultReportSchedule(award.startDate, award.endDate));
}

// ------------------------------------------------------------------------------------ create

async function insertAward(
  ctx: AppContext,
  values: Omit<typeof awards.$inferInsert, "id">,
): Promise<{ row: AwardRow; created: boolean }> {
  const id = newAwardId();
  const inserted = await ctx.db
    .insert(awards)
    .values({ ...values, id })
    .onConflictDoNothing()
    .returning()
    .get();
  if (inserted) return { row: inserted, created: true };
  // Lost a race for the same application: return the winner.
  const winner = values.applicationId
    ? await ctx.db
        .select()
        .from(awards)
        .where(and(eq(awards.orgId, values.orgId), eq(awards.applicationId, values.applicationId)))
        .get()
    : undefined;
  if (!winner) throw conflict("Could not create the award");
  return { row: winner, created: false };
}

async function finishCreate(
  ctx: AppContext,
  award: AwardRow,
  year: number,
  actor: Actor,
): Promise<AwardRow> {
  await createAwardFact(ctx, award, year, actor);
  await ensureDefaultSchedule(ctx, award);
  await audit(ctx, {
    orgId: award.orgId,
    actorType: "user",
    actorId: actor.userId,
    action: "award.created",
    targetType: "award",
    targetId: award.id,
    metadata: {
      applicationId: award.applicationId,
      amountCents: award.amountCents,
      hasPeriod: !!(award.startDate && award.endDate),
    },
    requestId: actor.requestId,
  });
  return loadAward(ctx, award.orgId, award.id);
}

/**
 * The award for an application whose outcome is "awarded". Idempotent: an existing award is
 * returned unchanged. Dates come from the given terms, else the project's ISO timeline dates.
 */
export async function createAwardForApplication(
  ctx: AppContext,
  input: { orgId: string; applicationId: string; terms?: AwardTermsInput | null } & Actor,
): Promise<AwardRow> {
  const { orgId } = input;
  const existing = await ctx.db
    .select()
    .from(awards)
    .where(and(eq(awards.orgId, orgId), eq(awards.applicationId, input.applicationId)))
    .get();
  if (existing) return existing;
  const app = await ctx.db
    .select({
      id: applications.id,
      title: applications.title,
      status: applications.status,
      projectId: applications.projectId,
      awardedAmountCents: applications.awardedAmountCents,
      requestedAmountCents: applications.requestedAmountCents,
      funderName: opportunities.funderName,
      projectTitle: projects.title,
      timelineStart: projects.timelineStart,
      timelineEnd: projects.timelineEnd,
    })
    .from(applications)
    .innerJoin(opportunities, eq(opportunities.id, applications.opportunityId))
    .leftJoin(
      projects,
      and(eq(projects.id, applications.projectId), eq(projects.orgId, applications.orgId)),
    )
    .where(and(eq(applications.id, input.applicationId), eq(applications.orgId, orgId)))
    .get();
  if (!app) throw notFound("Application");
  if (app.status !== "awarded") {
    throw conflict("Record the application's outcome as awarded first");
  }
  const t = input.terms ?? {};
  assertDateOrder(t.startDate, t.endDate);
  let startDate = t.startDate ?? null;
  let endDate = t.endDate ?? null;
  if (!startDate && !endDate) {
    startDate = isoDateOrNull(app.timelineStart);
    endDate = isoDateOrNull(app.timelineEnd);
    if (startDate && endDate && endDate < startDate) startDate = endDate = null;
  }
  const { row, created } = await insertAward(ctx, {
    orgId,
    applicationId: app.id,
    projectId: app.projectId,
    title: app.projectTitle ?? app.title,
    funderName: app.funderName,
    amountCents: app.awardedAmountCents ?? app.requestedAmountCents ?? null,
    startDate,
    endDate,
    grantNumber: t.grantNumber ?? null,
    termsNotes: t.termsNotes ?? "",
    createdBy: input.userId,
  });
  if (!created) return row;
  return finishCreate(ctx, row, ctx.now().getUTCFullYear(), input);
}

/**
 * Hook for pipeline.recordOutcome. Never throws: the outcome is already recorded, and a failed
 * award can be created again with POST /awards { applicationId }.
 */
export async function onApplicationAwarded(
  ctx: AppContext,
  input: { orgId: string; applicationId: string; terms?: AwardTermsInput | null } & Actor,
): Promise<AwardRow | null> {
  try {
    return await createAwardForApplication(ctx, input);
  } catch (e) {
    ctx.logger.error("award.create_failed", {
      orgId: input.orgId,
      applicationId: input.applicationId,
      error: String(e),
    });
    return null;
  }
}

export async function createAward(
  ctx: AppContext,
  orgId: string,
  input: z.infer<typeof CreateAwardInput>,
  actor: Actor,
): Promise<AwardRow> {
  if (input.applicationId) {
    return createAwardForApplication(ctx, {
      orgId,
      applicationId: input.applicationId,
      terms: input,
      ...actor,
    });
  }
  if (!input.funderName || !input.title) {
    throw badRequest("funderName and title are required for an award without an application");
  }
  assertDateOrder(input.startDate, input.endDate);
  if (input.projectId) {
    const p = await ctx.db
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.id, input.projectId), eq(projects.orgId, orgId)))
      .get();
    if (!p) throw badRequest("Unknown projectId");
  }
  const { row } = await insertAward(ctx, {
    orgId,
    applicationId: null,
    projectId: input.projectId ?? null,
    title: input.title,
    funderName: input.funderName,
    amountCents: input.amountCents ?? null,
    startDate: input.startDate ?? null,
    endDate: input.endDate ?? null,
    grantNumber: input.grantNumber ?? null,
    termsNotes: input.termsNotes ?? "",
    createdBy: actor.userId,
  });
  const year = parseIsoDate(row.startDate)?.getUTCFullYear() ?? ctx.now().getUTCFullYear();
  return finishCreate(ctx, row, year, actor);
}

// ------------------------------------------------------------------------------------ update

export async function updateAward(
  ctx: AppContext,
  orgId: string,
  id: string,
  input: z.infer<typeof UpdateAwardInput>,
  actor: Actor,
): Promise<AwardRow> {
  const award = await loadAward(ctx, orgId, id);
  const patch: Partial<typeof awards.$inferInsert> = {};
  if (input.title !== undefined) patch.title = input.title;
  if (input.funderName !== undefined) patch.funderName = input.funderName;
  if (input.amountCents !== undefined) patch.amountCents = input.amountCents;
  if (input.startDate !== undefined) patch.startDate = input.startDate;
  if (input.endDate !== undefined) patch.endDate = input.endDate;
  if (input.grantNumber !== undefined) patch.grantNumber = input.grantNumber;
  if (input.termsNotes !== undefined) patch.termsNotes = input.termsNotes;
  if (Object.keys(patch).length === 0) return award;
  const start = patch.startDate !== undefined ? patch.startDate : award.startDate;
  const end = patch.endDate !== undefined ? patch.endDate : award.endDate;
  assertDateOrder(start, end);
  await ctx.db
    .update(awards)
    .set(patch)
    .where(and(eq(awards.id, id), eq(awards.orgId, orgId)));
  const updated = await loadAward(ctx, orgId, id);
  // Dates entered later: schedule the default reports if there are none yet.
  if (updated.startDate && updated.endDate) await ensureDefaultSchedule(ctx, updated);
  // Report reminder titles name the funder.
  if (patch.funderName || patch.title) {
    for (const r of await reportsOf(ctx, orgId, [id]))
      await scheduleReportReminders(ctx, updated, r);
  }
  await audit(ctx, {
    orgId,
    actorType: "user",
    actorId: actor.userId,
    action: "award.updated",
    targetType: "award",
    targetId: id,
    metadata: { fields: Object.keys(patch) },
    requestId: actor.requestId,
  });
  return updated;
}

/** Adds a report to the schedule (e.g. a financial report the funder also requires). */
export async function addReport(
  ctx: AppContext,
  orgId: string,
  awardId: string,
  input: z.infer<typeof CreateReportInput>,
  actor: Actor,
): Promise<AwardReportRow> {
  const award = await loadAward(ctx, orgId, awardId);
  assertDateOrder(input.periodStart, input.periodEnd);
  const due = parseIsoDate(input.dueDate);
  if (!due) throw badRequest("Invalid due date");
  const [row] = await insertReports(ctx, award, [
    { kind: input.kind, periodStart: input.periodStart, periodEnd: input.periodEnd, dueAt: due },
  ]);
  if (!row) throw conflict("Could not add the report");
  await audit(ctx, {
    orgId,
    actorType: "user",
    actorId: actor.userId,
    action: "award_report.added",
    targetType: "award_report",
    targetId: row.id,
    metadata: { awardId, kind: input.kind },
    requestId: actor.requestId,
  });
  return row;
}

/** Removes a report that hasn't been submitted, with its pending reminders. */
export async function deleteReport(
  ctx: AppContext,
  orgId: string,
  awardId: string,
  reportId: string,
  actor: Actor,
): Promise<void> {
  const report = await loadReport(ctx, orgId, awardId, reportId);
  if (report.status === "submitted") throw conflict("A submitted report can't be removed");
  await ctx.db
    .delete(followups)
    .where(
      and(
        eq(followups.orgId, orgId),
        like(followups.dedupeKey, `report_due:${report.id}:%`),
        eq(followups.status, "pending"),
      ),
    );
  await ctx.db
    .delete(awardReports)
    .where(and(eq(awardReports.id, report.id), eq(awardReports.orgId, orgId)));
  await audit(ctx, {
    orgId,
    actorType: "user",
    actorId: actor.userId,
    action: "award_report.deleted",
    targetType: "award_report",
    targetId: report.id,
    metadata: { awardId, kind: report.kind },
    requestId: actor.requestId,
  });
}
