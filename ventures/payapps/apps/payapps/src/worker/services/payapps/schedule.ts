// The schedule on a job: add, change and delete activities, move one and everything waiting on it
// when the GC's schedule slips, and the schedule with each activity's status for today and the
// three-week lookahead. Every query filters by org_id and the job. The rules (status, workdays,
// sequence checks, the shift, the window) are pure in @shared/schedule.
import type {
  ImportScheduleBody,
  ScheduleActivityBody,
  ScheduleActivityUpdateBody,
} from "@shared/api/schemas";
import type {
  ScheduleActivityDto,
  ScheduleDto,
  ScheduleImportDto,
  ScheduleShiftDto,
} from "@shared/api/types";
import {
  activityLabel,
  activityProblem,
  activityStatus,
  earliestStart,
  type HolidayCalendar,
  holidayCalendar,
  inLookahead,
  lookaheadWindow,
  MAX_SCHEDULE_ACTIVITIES,
  nextActivityNumber,
  planShift,
  predecessorLoop,
  type ScheduleActivityFacts,
  sequenceProblem,
  summarizeSchedule,
  workdaysBetween,
} from "@shared/schedule";
import { and, asc, eq } from "drizzle-orm";
import type { AppContext } from "../../context";
import { organization, scheduleActivities } from "../../db/schema";
import { badRequest, conflict, notFound } from "../../lib/errors";
import { newId } from "../../lib/ids";
import { getProjectRow, type ProjectRow } from "./bundle";
import { listHolidays, loadHolidayCalendar } from "./holidays";

type ActivityRow = typeof scheduleActivities.$inferSelect;

const today = (ctx: AppContext) => ctx.now().toISOString().slice(0, 10);
const blank = (v: string | null | undefined) => (v?.trim() ? v.trim() : null);

function toDto(
  r: ActivityRow,
  day: string,
  byNumber: Map<number, ScheduleActivityFacts>,
  window: ScheduleDto["lookahead"],
  holidays: HolidayCalendar,
): ScheduleActivityDto {
  return {
    id: r.id,
    number: r.number,
    name: r.name,
    trade: r.trade,
    startOn: r.startOn,
    finishOn: r.finishOn,
    percentComplete: r.percentComplete,
    predecessorNumber: r.predecessorNumber,
    lagDays: r.lagDays,
    notes: r.notes,
    sourceCode: r.sourceCode,
    status: activityStatus(r, day),
    workdays: workdaysBetween(r.startOn, r.finishOn, holidays),
    earliestStart: earliestStart(r, byNumber, holidays),
    sequenceProblem: sequenceProblem(r, byNumber, holidays),
    inLookahead: inLookahead(r, window),
  };
}

async function rows(ctx: AppContext, orgId: string, projectId: string) {
  return ctx.db
    .select()
    .from(scheduleActivities)
    .where(and(eq(scheduleActivities.orgId, orgId), eq(scheduleActivities.projectId, projectId)))
    .orderBy(asc(scheduleActivities.startOn), asc(scheduleActivities.number))
    .all();
}

async function scheduleOf(
  ctx: AppContext,
  orgId: string,
  list: ActivityRow[],
  day: string,
  weeks: number,
): Promise<ScheduleDto> {
  const { holidays } = await listHolidays(ctx, orgId);
  const cal = holidayCalendar(holidays);
  const byNumber = new Map<number, ScheduleActivityFacts>(list.map((r) => [r.number, r]));
  const window = lookaheadWindow(day, weeks, cal);
  return {
    activities: list.map((r) => toDto(r, day, byNumber, window, cal)),
    summary: summarizeSchedule(list, day, cal),
    lookahead: window,
    nextNumber: nextActivityNumber(list.map((r) => r.number)),
    today: day,
    holidays,
  };
}

export async function getSchedule(
  ctx: AppContext,
  orgId: string,
  projectId: string,
  weeks = 3,
): Promise<ScheduleDto> {
  await getProjectRow(ctx, orgId, projectId);
  return scheduleOf(ctx, orgId, await rows(ctx, orgId, projectId), today(ctx), weeks);
}

async function getRow(ctx: AppContext, orgId: string, projectId: string, activityId: string) {
  const row = await ctx.db
    .select()
    .from(scheduleActivities)
    .where(
      and(
        eq(scheduleActivities.id, activityId),
        eq(scheduleActivities.orgId, orgId),
        eq(scheduleActivities.projectId, projectId),
      ),
    )
    .get();
  if (!row) throw notFound("Schedule activity");
  return row;
}

/** Refuses an activity whose own fields are wrong or whose predecessor chain loops back to it. */
function check(next: ScheduleActivityFacts, others: ActivityRow[], predecessorChanged = true) {
  const problem = activityProblem(next);
  if (problem) throw badRequest(problem);
  if (next.predecessorNumber !== null) {
    const byNumber = new Map<number, ScheduleActivityFacts>(
      others.filter((r) => r.number !== next.number).map((r) => [r.number, r]),
    );
    // A predecessor deleted since stays named (and flagged) until someone changes it.
    if (predecessorChanged && !byNumber.has(next.predecessorNumber)) {
      throw badRequest(`${activityLabel(next.predecessorNumber)} is not on this job's schedule`);
    }
    byNumber.set(next.number, next);
    const loop = predecessorLoop(next.number, byNumber);
    if (loop) {
      throw badRequest(
        `That makes a loop: ${[...loop, next.number].map(activityLabel).join(" waits for ")}`,
      );
    }
  }
}

function isUniqueViolation(err: unknown) {
  return err instanceof Error && /UNIQUE constraint failed/i.test(`${err.message} ${err.cause}`);
}

export async function createActivity(
  ctx: AppContext,
  orgId: string,
  projectId: string,
  input: ScheduleActivityBody,
): Promise<ScheduleActivityDto> {
  await getProjectRow(ctx, orgId, projectId);
  const existing = await rows(ctx, orgId, projectId);
  if (existing.length >= MAX_SCHEDULE_ACTIVITIES) {
    throw badRequest(`A job's schedule holds up to ${MAX_SCHEDULE_ACTIVITIES} activities`);
  }
  const number = input.number ?? nextActivityNumber(existing.map((r) => r.number));
  if (existing.some((r) => r.number === number)) {
    throw conflict(`${activityLabel(number)} already exists`);
  }
  const v = {
    number,
    name: input.name,
    trade: blank(input.trade),
    startOn: input.startOn,
    finishOn: input.finishOn,
    percentComplete: input.percentComplete ?? 0,
    predecessorNumber: input.predecessorNumber ?? null,
    lagDays: input.lagDays ?? 0,
    notes: blank(input.notes),
  };
  check(v, existing);
  const id = newId("sca");
  try {
    await ctx.db.insert(scheduleActivities).values({ id, orgId, projectId, ...v });
  } catch (err) {
    if (isUniqueViolation(err)) throw conflict(`${activityLabel(number)} already exists`);
    throw err;
  }
  return activityDto(ctx, orgId, projectId, id);
}

async function activityDto(ctx: AppContext, orgId: string, projectId: string, id: string) {
  const s = await scheduleOf(ctx, orgId, await rows(ctx, orgId, projectId), today(ctx), 3);
  const dto = s.activities.find((a) => a.id === id);
  if (!dto) throw notFound("Schedule activity");
  return dto;
}

export async function updateActivity(
  ctx: AppContext,
  orgId: string,
  projectId: string,
  activityId: string,
  input: ScheduleActivityUpdateBody,
): Promise<ScheduleActivityDto> {
  const row = await getRow(ctx, orgId, projectId, activityId);
  const patch: Partial<typeof scheduleActivities.$inferInsert> = {};
  if (input.name !== undefined) patch.name = input.name;
  if (input.trade !== undefined) patch.trade = blank(input.trade);
  if (input.notes !== undefined) patch.notes = blank(input.notes);
  if (input.startOn !== undefined) patch.startOn = input.startOn;
  if (input.finishOn !== undefined) patch.finishOn = input.finishOn;
  if (input.percentComplete !== undefined) patch.percentComplete = input.percentComplete;
  if (input.lagDays !== undefined) patch.lagDays = input.lagDays;
  if (input.predecessorNumber !== undefined) patch.predecessorNumber = input.predecessorNumber;
  check(
    { ...row, ...patch } as ActivityRow,
    await rows(ctx, orgId, projectId),
    input.predecessorNumber !== undefined && input.predecessorNumber !== row.predecessorNumber,
  );
  if (Object.keys(patch).length > 0) {
    await ctx.db
      .update(scheduleActivities)
      .set(patch)
      .where(
        and(
          eq(scheduleActivities.id, activityId),
          eq(scheduleActivities.orgId, orgId),
          eq(scheduleActivities.projectId, projectId),
        ),
      );
  }
  return activityDto(ctx, orgId, projectId, activityId);
}

/**
 * Deletes an activity. What waited on it keeps its dates and shows that it waits for one no longer
 * on the schedule, so nothing moves without the person seeing it.
 */
export async function deleteActivity(
  ctx: AppContext,
  orgId: string,
  projectId: string,
  activityId: string,
) {
  await getRow(ctx, orgId, projectId, activityId);
  await ctx.db
    .delete(scheduleActivities)
    .where(
      and(
        eq(scheduleActivities.id, activityId),
        eq(scheduleActivities.orgId, orgId),
        eq(scheduleActivities.projectId, projectId),
      ),
    );
}

/** Moves the activity and every activity waiting on it (not the finished ones) by `workdays`. */
export async function shiftActivity(
  ctx: AppContext,
  orgId: string,
  projectId: string,
  activityId: string,
  workdays: number,
): Promise<ScheduleShiftDto> {
  const row = await getRow(ctx, orgId, projectId, activityId);
  const list = await rows(ctx, orgId, projectId);
  const plan = planShift(row.number, workdays, list, await loadHolidayCalendar(ctx, orgId));
  const idOf = new Map(list.map((r) => [r.number, r.id]));
  const updates = plan.moved.map((m) =>
    ctx.db
      .update(scheduleActivities)
      .set({ startOn: m.startOn, finishOn: m.finishOn })
      .where(
        and(
          eq(scheduleActivities.id, idOf.get(m.number) as string),
          eq(scheduleActivities.orgId, orgId),
          eq(scheduleActivities.projectId, projectId),
        ),
      ),
  );
  const [first, ...rest] = updates;
  // One batch: either every activity moves or none does.
  if (first) await ctx.db.batch([first, ...rest]);
  return {
    schedule: await getSchedule(ctx, orgId, projectId),
    moved: plan.moved.map((m) => m.number),
    skippedDone: plan.skippedDone,
  };
}

/** D1 binds at most 100 parameters to a statement: 15 columns a row, so 6 rows an insert. */
const ROWS_PER_INSERT = 6;

/**
 * Adds or updates activities read from the GC's P6 export. One matched by its P6 activity ID takes
 * the export's name, dates, percent and predecessor (the GC's update is the source; its trade and
 * notes stay as the contractor left them unless a trade is given); the rest are added with the
 * next numbers. All of it in one batch, after the same checks a typed activity gets.
 */
export async function importActivities(
  ctx: AppContext,
  orgId: string,
  projectId: string,
  input: ImportScheduleBody,
): Promise<ScheduleImportDto> {
  await getProjectRow(ctx, orgId, projectId);
  const existing = await rows(ctx, orgId, projectId);
  const codes = new Set<string>();
  for (const it of input.items) {
    if (codes.has(it.sourceCode)) throw badRequest(`P6 activity ${it.sourceCode} is listed twice`);
    codes.add(it.sourceCode);
  }
  const bySource = new Map<string, ActivityRow>();
  for (const r of existing) if (r.sourceCode) bySource.set(r.sourceCode, r);
  const adding = input.items.filter((it) => !bySource.has(it.sourceCode)).length;
  if (existing.length + adding > MAX_SCHEDULE_ACTIVITIES) {
    throw badRequest(
      `A job's schedule holds up to ${MAX_SCHEDULE_ACTIVITIES} activities: it has ${existing.length} and the import adds ${adding}`,
    );
  }
  let next = nextActivityNumber(existing.map((r) => r.number));
  const numberOf = new Map<string, number>();
  for (const [code, r] of bySource) numberOf.set(code, r.number);
  for (const it of input.items)
    if (!numberOf.has(it.sourceCode)) numberOf.set(it.sourceCode, next++);

  const trade = blank(input.trade);
  const byNumber = new Map<number, ActivityRow>(existing.map((r) => [r.number, r]));
  const inserts: (typeof scheduleActivities.$inferInsert)[] = [];
  const updates: { id: string; patch: Partial<typeof scheduleActivities.$inferInsert> }[] = [];
  for (const it of input.items) {
    const number = numberOf.get(it.sourceCode) as number;
    const predecessorNumber = it.predecessorCode
      ? (numberOf.get(it.predecessorCode) ?? null)
      : null;
    const fields = {
      name: it.name,
      startOn: it.startOn,
      finishOn: it.finishOn,
      percentComplete: it.percentComplete,
      predecessorNumber: predecessorNumber === number ? null : predecessorNumber,
      lagDays: predecessorNumber === null ? 0 : it.lagDays,
      ...(trade ? { trade } : {}),
    };
    const problem = activityProblem({ number, ...fields });
    if (problem) throw badRequest(`P6 activity ${it.sourceCode}: ${problem}`);
    const old = bySource.get(it.sourceCode);
    if (old) {
      const changed = (Object.keys(fields) as (keyof typeof fields)[]).some(
        (k) => old[k] !== fields[k],
      );
      if (changed) updates.push({ id: old.id, patch: fields });
      byNumber.set(number, { ...old, ...fields });
    } else {
      const row = {
        id: newId("sca"),
        orgId,
        projectId,
        number,
        trade: null,
        ...fields,
        notes: blank(it.notes),
        sourceCode: it.sourceCode,
      };
      inserts.push(row);
      byNumber.set(number, row as ActivityRow);
    }
  }
  // P6 refuses a loop, but a typed activity can wait on an imported one: check the whole job.
  for (const n of byNumber.keys()) {
    const loop = predecessorLoop(n, byNumber);
    if (loop) {
      throw badRequest(
        `The import makes a loop: ${[...loop, n].map(activityLabel).join(" waits for ")}`,
      );
    }
  }
  const statements = [
    ...updates.map((u) =>
      ctx.db
        .update(scheduleActivities)
        .set(u.patch)
        .where(
          and(
            eq(scheduleActivities.id, u.id),
            eq(scheduleActivities.orgId, orgId),
            eq(scheduleActivities.projectId, projectId),
          ),
        ),
    ),
  ];
  const insertStatements = [];
  for (let i = 0; i < inserts.length; i += ROWS_PER_INSERT) {
    insertStatements.push(
      ctx.db.insert(scheduleActivities).values(inserts.slice(i, i + ROWS_PER_INSERT)),
    );
  }
  const [head, ...tail] = [...insertStatements, ...statements];
  if (head) {
    try {
      await ctx.db.batch([head, ...tail]);
    } catch (err) {
      if (isUniqueViolation(err)) throw conflict("The schedule changed while importing; try again");
      throw err;
    }
  }
  return {
    schedule: await getSchedule(ctx, orgId, projectId),
    added: inserts.length,
    updated: updates.length,
  };
}

export interface ScheduleDocument {
  contractor: { name: string };
  project: Pick<
    ProjectRow,
    "name" | "number" | "location" | "gcName" | "gcPmName" | "gcPmEmail" | "isSample"
  >;
  schedule: ScheduleDto;
}

/** What the lookahead PDF and the schedule CSV print: the job's parties and its schedule as entered. */
export async function loadScheduleDocument(
  ctx: AppContext,
  orgId: string,
  projectId: string,
  weeks = 3,
): Promise<ScheduleDocument> {
  const [project, schedule, org] = await Promise.all([
    getProjectRow(ctx, orgId, projectId),
    getSchedule(ctx, orgId, projectId, weeks),
    ctx.db
      .select({ name: organization.name })
      .from(organization)
      .where(eq(organization.id, orgId))
      .get(),
  ]);
  if (!org) throw notFound("Organization");
  return { contractor: { name: org.name }, project, schedule };
}
