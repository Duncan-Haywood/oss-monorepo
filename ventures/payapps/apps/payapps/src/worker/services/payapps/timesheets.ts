// Crew timesheets (src/shared/timesheets.ts holds the arithmetic; docs/TIMESHEETS.md). The company's
// own workers, their hours per day on a job and line for one workweek, and the week's labor posted to
// each job's costs. Every query filters by orgId. Posting goes through job costing's own addEntries
// with a reference per week and line, so a week posted twice adds nothing.
import type {
  crewMemberSchema,
  timesheetSettingsSchema,
  updateCrewMemberSchema,
  workerWeekSchema,
} from "@shared/api/schemas";
import type {
  CrewDto,
  CrewMemberDto,
  TimesheetJobDto,
  TimesheetLaborDto,
  TimesheetPostDto,
  TimesheetWeekDto,
} from "@shared/api/types";
import {
  computeWeek,
  DEFAULT_WEEK_START_DAY,
  isWeekStart,
  laborCosts,
  laborDescription,
  laborReference,
  MAX_CREW_MEMBERS,
  MAX_DAY_HUNDREDTHS,
  TIMESHEET_NOTE,
  type TimeRow,
  WEEK_DAY_NAMES,
  weekDates,
  weekEnding,
} from "@shared/timesheets";
import { and, asc, eq, gte, inArray, lte } from "drizzle-orm";
import type { z } from "zod";
import type { AppContext } from "../../context";
import {
  crewMembers,
  jobCostEntries,
  projects,
  sovLines,
  timeEntries,
  timesheetSettings,
} from "../../db/schema";
import { badRequest, conflict, notFound } from "../../lib/errors";
import { newId } from "../../lib/ids";
import type { Tenant } from "../../types";
import { addEntries } from "./job-cost";

type MemberRow = typeof crewMembers.$inferSelect;

const nameKey = (name: string) => name.trim().replace(/\s+/g, " ").toLowerCase();
const clean = (s: string | null | undefined) => {
  const t = (s ?? "").trim().replace(/\s+/g, " ");
  return t === "" ? null : t;
};

async function membersWithHours(ctx: AppContext, orgId: string): Promise<Set<string>> {
  const rows = await ctx.db
    .selectDistinct({ id: timeEntries.workerId })
    .from(timeEntries)
    .where(eq(timeEntries.orgId, orgId))
    .all();
  return new Set(rows.map((r) => r.id));
}

const memberDto = (r: MemberRow, withHours: Set<string>): CrewMemberDto => ({
  id: r.id,
  name: r.name,
  trade: r.trade,
  rateCents: r.rateCents,
  active: r.active,
  hasHours: withHours.has(r.id),
});

export async function getWeekStartDay(ctx: AppContext, orgId: string): Promise<number> {
  const row = await ctx.db
    .select({ d: timesheetSettings.weekStartDay })
    .from(timesheetSettings)
    .where(eq(timesheetSettings.orgId, orgId))
    .get();
  return row?.d ?? DEFAULT_WEEK_START_DAY;
}

async function memberRows(ctx: AppContext, orgId: string) {
  return ctx.db
    .select()
    .from(crewMembers)
    .where(eq(crewMembers.orgId, orgId))
    .orderBy(asc(crewMembers.nameKey))
    .all();
}

export async function getCrew(ctx: AppContext, orgId: string): Promise<CrewDto> {
  const [rows, withHours, weekStartDay] = await Promise.all([
    memberRows(ctx, orgId),
    membersWithHours(ctx, orgId),
    getWeekStartDay(ctx, orgId),
  ]);
  return {
    members: rows.map((r) => memberDto(r, withHours)),
    weekStartDay,
    weekStartLocked: withHours.size > 0,
    limit: MAX_CREW_MEMBERS,
  };
}

async function getMember(ctx: AppContext, orgId: string, workerId: string) {
  const row = await ctx.db
    .select()
    .from(crewMembers)
    .where(and(eq(crewMembers.id, workerId), eq(crewMembers.orgId, orgId)))
    .get();
  if (!row) throw notFound("Worker");
  return row;
}

async function nameTaken(ctx: AppContext, orgId: string, key: string, except?: string) {
  const row = await ctx.db
    .select({ id: crewMembers.id })
    .from(crewMembers)
    .where(and(eq(crewMembers.orgId, orgId), eq(crewMembers.nameKey, key)))
    .get();
  return row !== undefined && row.id !== except;
}

const sameName = "A worker with that name is on the crew list already";

export async function addMember(
  ctx: AppContext,
  orgId: string,
  body: z.infer<typeof crewMemberSchema>,
): Promise<CrewDto> {
  const name = clean(body.name) ?? "";
  const key = nameKey(name);
  const rows = await memberRows(ctx, orgId);
  if (rows.length >= MAX_CREW_MEMBERS)
    throw conflict(`The crew list holds ${MAX_CREW_MEMBERS} workers; delete or reuse some first`);
  if (rows.some((r) => r.nameKey === key)) throw conflict(sameName);
  await ctx.db.insert(crewMembers).values({
    id: newId("crw"),
    orgId,
    name,
    nameKey: key,
    trade: clean(body.trade),
    rateCents: body.rateCents ?? null,
  });
  return getCrew(ctx, orgId);
}

export async function updateMember(
  ctx: AppContext,
  orgId: string,
  workerId: string,
  body: z.infer<typeof updateCrewMemberSchema>,
): Promise<CrewDto> {
  const row = await getMember(ctx, orgId, workerId);
  const name = body.name === undefined ? row.name : (clean(body.name) ?? row.name);
  const key = nameKey(name);
  if (key !== row.nameKey && (await nameTaken(ctx, orgId, key, workerId))) throw conflict(sameName);
  await ctx.db
    .update(crewMembers)
    .set({
      name,
      nameKey: key,
      trade: body.trade === undefined ? row.trade : clean(body.trade),
      rateCents: body.rateCents === undefined ? row.rateCents : body.rateCents,
      active: body.active ?? row.active,
    })
    .where(and(eq(crewMembers.id, workerId), eq(crewMembers.orgId, orgId)));
  return getCrew(ctx, orgId);
}

/** Only a worker with no hours is deleted; one with hours is deactivated, so past weeks stay whole. */
export async function deleteMember(ctx: AppContext, orgId: string, workerId: string) {
  await getMember(ctx, orgId, workerId);
  const has = await ctx.db
    .select({ id: timeEntries.id })
    .from(timeEntries)
    .where(and(eq(timeEntries.orgId, orgId), eq(timeEntries.workerId, workerId)))
    .get();
  if (has)
    throw conflict(
      "This worker has hours on a timesheet; mark them inactive instead, so past weeks keep their hours",
    );
  await ctx.db
    .delete(crewMembers)
    .where(and(eq(crewMembers.id, workerId), eq(crewMembers.orgId, orgId)));
  return getCrew(ctx, orgId);
}

/**
 * The workweek's first day. Fixed once hours are entered: moving it would split weeks already
 * totalled for overtime and posted to job costs under their week-ending dates.
 */
export async function setSettings(
  ctx: AppContext,
  orgId: string,
  body: z.infer<typeof timesheetSettingsSchema>,
): Promise<CrewDto> {
  const current = await getWeekStartDay(ctx, orgId);
  if (body.weekStartDay !== current && (await membersWithHours(ctx, orgId)).size > 0)
    throw conflict(
      `The workweek starts on ${WEEK_DAY_NAMES[current]} and hours are entered against it; it can change only before the first hours are entered`,
    );
  await ctx.db
    .insert(timesheetSettings)
    .values({ orgId, weekStartDay: body.weekStartDay })
    .onConflictDoUpdate({
      target: timesheetSettings.orgId,
      set: { weekStartDay: body.weekStartDay, updatedAt: ctx.now() },
    });
  return getCrew(ctx, orgId);
}

async function checkWeek(ctx: AppContext, orgId: string, weekStart: string) {
  const day = await getWeekStartDay(ctx, orgId);
  if (!isWeekStart(weekStart, day))
    throw badRequest(`A workweek here starts on a ${WEEK_DAY_NAMES[day]}; ${weekStart} is not one`);
  return day;
}

async function jobsFor(ctx: AppContext, orgId: string, include: Set<string>) {
  const rows = await ctx.db
    .select({
      id: projects.id,
      name: projects.name,
      number: projects.number,
      status: projects.status,
      isSample: projects.isSample,
    })
    .from(projects)
    .where(eq(projects.orgId, orgId))
    .orderBy(asc(projects.name))
    .all();
  // Active jobs, plus a closed one this week already has hours on.
  const picked = rows.filter((r) => !r.isSample && (r.status === "active" || include.has(r.id)));
  const ids = picked.map((r) => r.id);
  const lines =
    ids.length === 0
      ? []
      : await ctx.db
          .select({
            id: sovLines.id,
            projectId: sovLines.projectId,
            itemNumber: sovLines.itemNumber,
            description: sovLines.description,
          })
          .from(sovLines)
          .where(and(eq(sovLines.orgId, orgId), inArray(sovLines.projectId, ids)))
          .orderBy(asc(sovLines.sortOrder))
          .all();
  return picked.map(
    (p): TimesheetJobDto => ({
      id: p.id,
      name: p.name,
      number: p.number,
      status: p.status,
      lines: lines
        .filter((l) => l.projectId === p.id)
        .map((l) => ({ id: l.id, itemNumber: l.itemNumber, description: l.description })),
    }),
  );
}

async function weekRows(ctx: AppContext, orgId: string, weekStart: string): Promise<TimeRow[]> {
  const days = weekDates(weekStart);
  const entries = await ctx.db
    .select()
    .from(timeEntries)
    .where(
      and(
        eq(timeEntries.orgId, orgId),
        gte(timeEntries.workDate, days[0] as string),
        lte(timeEntries.workDate, days[6] as string),
      ),
    )
    .orderBy(asc(timeEntries.workerId), asc(timeEntries.rowIndex), asc(timeEntries.workDate))
    .all();
  const by = new Map<string, TimeRow & { idx: number }>();
  for (const e of entries) {
    // One row per worker and row position; a line deleted since keeps its hours on "no line".
    const key = `${e.workerId}\u0000${e.rowIndex}`;
    const row = by.get(key) ?? {
      workerId: e.workerId,
      projectId: e.projectId,
      sovLineId: e.sovLineId,
      hours: [0, 0, 0, 0, 0, 0, 0],
      idx: e.rowIndex,
    };
    const d = days.indexOf(e.workDate);
    if (d >= 0) row.hours[d] = (row.hours[d] ?? 0) + e.hoursHundredths;
    by.set(key, row);
  }
  return [...by.values()].sort((a, b) => a.idx - b.idx).map(({ idx: _i, ...r }) => r);
}

export async function getWeek(
  ctx: AppContext,
  orgId: string,
  weekStart: string,
): Promise<TimesheetWeekDto> {
  const weekStartDay = await checkWeek(ctx, orgId, weekStart);
  const [members, withHours, rows] = await Promise.all([
    memberRows(ctx, orgId),
    membersWithHours(ctx, orgId),
    weekRows(ctx, orgId, weekStart),
  ]);
  const jobs = await jobsFor(ctx, orgId, new Set(rows.map((r) => r.projectId)));
  const week = computeWeek(
    members.map((m) => ({ id: m.id, name: m.name, trade: m.trade, rateCents: m.rateCents })),
    rows,
  );
  const labor = await laborWithPosted(ctx, orgId, weekStart, jobs, laborCosts(week, 0));
  return {
    weekStart,
    weekEnding: weekEnding(weekStart),
    days: weekDates(weekStart),
    weekStartDay,
    crew: members.map((m) => memberDto(m, withHours)),
    jobs,
    rows: week.rows,
    workers: week.workers,
    totals: week.totals,
    unrated: week.unrated,
    problems: week.problems,
    labor,
    note: TIMESHEET_NOTE,
  };
}

async function laborWithPosted(
  ctx: AppContext,
  orgId: string,
  weekStart: string,
  jobs: TimesheetJobDto[],
  costs: ReturnType<typeof laborCosts>,
): Promise<TimesheetLaborDto[]> {
  const items = laborItems(weekStart, jobs, costs);
  const refs = [...new Set(items.map((i) => i.reference))];
  const posted =
    refs.length === 0
      ? []
      : await ctx.db
          .select({
            projectId: jobCostEntries.projectId,
            reference: jobCostEntries.reference,
            amountCents: jobCostEntries.amountCents,
          })
          .from(jobCostEntries)
          .where(and(eq(jobCostEntries.orgId, orgId), inArray(jobCostEntries.reference, refs)))
          .all();
  return items.map((i) => {
    const hits = posted.filter((p) => p.projectId === i.projectId && p.reference === i.reference);
    return {
      ...i,
      postedCents: hits.length === 0 ? null : hits.reduce((a, p) => a + p.amountCents, 0),
    };
  });
}

function laborItems(
  weekStart: string,
  jobs: TimesheetJobDto[],
  costs: ReturnType<typeof laborCosts>,
) {
  return costs.map((c) => {
    const job = jobs.find((j) => j.id === c.projectId);
    const line = job?.lines.find((l) => l.id === c.sovLineId) ?? null;
    return {
      projectId: c.projectId,
      projectName: job?.name ?? "",
      sovLineId: c.sovLineId,
      itemNumber: line?.itemNumber ?? null,
      hours: c.hours,
      overtime: c.overtime,
      workers: c.workers,
      wagesCents: c.wagesCents,
      reference: laborReference(weekStart, line?.itemNumber ?? null),
    };
  });
}

/** Replaces one worker's rows for the week; rows with no hours are dropped. */
export async function putWorkerWeek(
  ctx: AppContext,
  tenant: Tenant,
  weekStart: string,
  workerId: string,
  body: z.infer<typeof workerWeekSchema>,
): Promise<TimesheetWeekDto> {
  const { orgId, userId } = tenant;
  await checkWeek(ctx, orgId, weekStart);
  const member = await getMember(ctx, orgId, workerId);
  const rows = body.rows.filter((r) => r.hours.some((h) => h > 0));
  const days = weekDates(weekStart);
  const byDay = days.map((_, d) => rows.reduce((a, r) => a + (r.hours[d] ?? 0), 0));
  const over = byDay.findIndex((h) => h > MAX_DAY_HUNDREDTHS);
  if (over >= 0) throw badRequest(`${member.name} has more than 24 hours on ${days[over]}`);
  if (rows.length > 0 && !member.active)
    throw badRequest(`${member.name} is inactive; make them active to enter hours`);

  // Every job and line must be this company's, and the line on that job.
  const projectIds = [...new Set(rows.map((r) => r.projectId))];
  if (projectIds.length > 0) {
    const found = await ctx.db
      .select({ id: projects.id, isSample: projects.isSample })
      .from(projects)
      .where(and(eq(projects.orgId, orgId), inArray(projects.id, projectIds)))
      .all();
    if (found.length !== projectIds.length)
      throw badRequest("A job on the timesheet is not one of this company's");
    if (found.some((p) => p.isSample)) throw badRequest("The sample job takes no timesheet hours");
    const lineIds = [...new Set(rows.map((r) => r.sovLineId).filter((v): v is string => !!v))];
    if (lineIds.length > 0) {
      const lines = await ctx.db
        .select({ id: sovLines.id, projectId: sovLines.projectId })
        .from(sovLines)
        .where(and(eq(sovLines.orgId, orgId), inArray(sovLines.id, lineIds)))
        .all();
      for (const r of rows) {
        if (r.sovLineId && !lines.some((l) => l.id === r.sovLineId && l.projectId === r.projectId))
          throw badRequest("A schedule-of-values line on the timesheet is not on its job");
      }
    }
  }

  const now = ctx.now();
  const inserts = rows.flatMap((r, rowIndex) =>
    r.hours.flatMap((h, d) =>
      h > 0
        ? [
            {
              id: newId("tme"),
              orgId,
              workerId,
              projectId: r.projectId,
              sovLineId: r.sovLineId ?? null,
              workDate: days[d] as string,
              hoursHundredths: h,
              rowIndex,
              createdBy: userId,
              updatedBy: userId,
              createdAt: now,
              updatedAt: now,
            },
          ]
        : [],
    ),
  );
  const statements = [
    ctx.db
      .delete(timeEntries)
      .where(
        and(
          eq(timeEntries.orgId, orgId),
          eq(timeEntries.workerId, workerId),
          gte(timeEntries.workDate, days[0] as string),
          lte(timeEntries.workDate, days[6] as string),
        ),
      ),
    // D1 binds at most 100 parameters a statement; a row binds 12.
    ...chunk(inserts, 8).map((values) => ctx.db.insert(timeEntries).values(values)),
  ];
  // One batch is one transaction: the week is replaced whole or not at all.
  // biome-ignore lint/suspicious/noExplicitAny: drizzle's batch tuple type is not exported
  await ctx.db.batch(statements as any);
  return getWeek(ctx, orgId, weekStart);
}

function chunk<T>(xs: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
  return out;
}

/**
 * The week's labor onto each job's costs: one labor cost per job and line, dated the week's last day,
 * wages plus the burden percent given. Lines already posted for the week are skipped by reference,
 * so a week is posted once; a week changed after posting shows the posted and current amounts apart.
 */
export async function postWeek(
  ctx: AppContext,
  tenant: Tenant,
  weekStart: string,
  burdenBps: number,
): Promise<TimesheetPostDto> {
  const { orgId } = tenant;
  await checkWeek(ctx, orgId, weekStart);
  const [members, rows] = await Promise.all([
    memberRows(ctx, orgId),
    weekRows(ctx, orgId, weekStart),
  ]);
  const week = computeWeek(
    members.map((m) => ({ id: m.id, name: m.name, trade: m.trade, rateCents: m.rateCents })),
    rows,
  );
  if (week.unrated.length > 0)
    throw badRequest(
      `Enter a pay rate for ${week.unrated.join(", ")} first: their hours would post at no cost`,
    );
  const costs = laborCosts(week, burdenBps);
  if (costs.length === 0) throw badRequest("This week has no hours to post");
  const jobs = await jobsFor(ctx, orgId, new Set(rows.map((r) => r.projectId)));
  const items = laborItems(weekStart, jobs, costs);
  const result: TimesheetPostDto["jobs"] = [];
  for (const projectId of [...new Set(costs.map((c) => c.projectId))]) {
    const entries = costs
      .map((c, i) => ({ c, item: items[i] }))
      .filter(({ c }) => c.projectId === projectId && c.amountCents !== 0)
      .map(({ c, item }) => ({
        sovLineId: c.sovLineId,
        incurredOn: weekEnding(weekStart),
        category: "labor" as const,
        amountCents: c.amountCents,
        vendor: "Timesheets",
        description: laborDescription(c, burdenBps),
        reference: item?.reference ?? null,
      }));
    if (entries.length === 0) continue;
    const r = await addEntries(ctx, tenant, projectId, { entries, skipExistingReferences: true });
    result.push({
      projectId,
      projectName: jobs.find((j) => j.id === projectId)?.name ?? "",
      added: r.added,
      skipped: r.skipped,
    });
  }
  return {
    added: result.reduce((a, j) => a + j.added, 0),
    skipped: result.reduce((a, j) => a + j.skipped, 0),
    jobs: result,
    week: await getWeek(ctx, orgId, weekStart),
  };
}
