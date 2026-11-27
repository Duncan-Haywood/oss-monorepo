// The punch list on a job: add items (one at a time or pasted as a list), change, delete, and the
// list with each item's status for today. Every query filters by org_id and the job. The rules
// (status, overdue, dates in order, the next number) are pure in @shared/punch-list.
import type { PunchItemInputBody, PunchItemUpdateBody } from "@shared/api/schemas";
import type { PunchItemDto, PunchListDto } from "@shared/api/types";
import {
  nextPunchNumber,
  type PunchItemFacts,
  punchDateProblem,
  punchDaysOverdue,
  punchStatus,
  summarizePunchList,
} from "@shared/punch-list";
import { and, asc, eq } from "drizzle-orm";
import type { AppContext } from "../../context";
import { organization, punchItems } from "../../db/schema";
import { badRequest, conflict, notFound } from "../../lib/errors";
import { newId } from "../../lib/ids";
import { getProjectRow, type ProjectRow } from "./bundle";

type PunchRow = typeof punchItems.$inferSelect;

/** The most items one job's list holds: a large walk-through runs to a few hundred. */
export const MAX_PUNCH_ITEMS = 2000;

const today = (ctx: AppContext) => ctx.now().toISOString().slice(0, 10);

/** Blank strings stored as null, so a cleared field reads as "not entered". */
const blank = (v: string | null | undefined) => (v?.trim() ? v.trim() : null);

function toDto(r: PunchRow, day: string): PunchItemDto {
  return {
    id: r.id,
    number: r.number,
    description: r.description,
    location: r.location,
    source: r.source,
    listedOn: r.listedOn,
    dueOn: r.dueOn,
    completedOn: r.completedOn,
    completedBy: r.completedBy,
    acceptedOn: r.acceptedOn,
    acceptedBy: r.acceptedBy,
    disputeNote: r.disputeNote,
    status: punchStatus(r, day),
    daysOverdue: punchDaysOverdue(r, day),
  };
}

async function rows(ctx: AppContext, orgId: string, projectId: string) {
  return ctx.db
    .select()
    .from(punchItems)
    .where(and(eq(punchItems.orgId, orgId), eq(punchItems.projectId, projectId)))
    .orderBy(asc(punchItems.number))
    .all();
}

export async function listPunchItems(
  ctx: AppContext,
  orgId: string,
  projectId: string,
): Promise<PunchListDto> {
  await getProjectRow(ctx, orgId, projectId);
  const list = await rows(ctx, orgId, projectId);
  const day = today(ctx);
  return {
    items: list.map((r) => toDto(r, day)),
    summary: summarizePunchList(list, day),
    nextNumber: nextPunchNumber(list.map((r) => r.number)),
    today: day,
  };
}

async function getRow(ctx: AppContext, orgId: string, projectId: string, itemId: string) {
  const row = await ctx.db
    .select()
    .from(punchItems)
    .where(
      and(
        eq(punchItems.id, itemId),
        eq(punchItems.orgId, orgId),
        eq(punchItems.projectId, projectId),
      ),
    )
    .get();
  if (!row) throw notFound("Punch list item");
  return row;
}

function checkFacts(
  facts: Pick<PunchItemFacts, "listedOn" | "dueOn" | "completedOn" | "acceptedOn">,
  ctx: AppContext,
  label?: string,
) {
  const problem = punchDateProblem(facts, today(ctx));
  if (problem) throw badRequest(label ? `${label}: ${problem}` : problem);
}

function isUniqueViolation(err: unknown) {
  return err instanceof Error && /UNIQUE constraint failed/i.test(`${err.message} ${err.cause}`);
}

type Fields = Omit<PunchItemInputBody, "number">;

function values(input: Fields) {
  return {
    description: input.description,
    location: blank(input.location),
    source: input.source ?? null,
    listedOn: input.listedOn ?? null,
    dueOn: input.dueOn ?? null,
    completedOn: input.completedOn ?? null,
    completedBy: blank(input.completedBy),
    acceptedOn: input.acceptedOn ?? null,
    acceptedBy: blank(input.acceptedBy),
    disputeNote: blank(input.disputeNote),
  };
}

export async function createPunchItem(
  ctx: AppContext,
  orgId: string,
  projectId: string,
  input: PunchItemInputBody,
): Promise<PunchItemDto> {
  await getProjectRow(ctx, orgId, projectId);
  const existing = await rows(ctx, orgId, projectId);
  if (existing.length >= MAX_PUNCH_ITEMS) {
    throw badRequest(`A job's punch list holds up to ${MAX_PUNCH_ITEMS} items`);
  }
  const number = input.number ?? nextPunchNumber(existing.map((r) => r.number));
  if (existing.some((r) => r.number === number)) {
    throw conflict(`Punch item ${number} already exists`);
  }
  const v = values(input);
  checkFacts(v, ctx);
  const id = newId("pch");
  try {
    await ctx.db.insert(punchItems).values({ id, orgId, projectId, number, ...v });
  } catch (err) {
    // Two people adding the next item at once: the unique index keeps the numbers apart.
    if (isUniqueViolation(err)) throw conflict(`Punch item ${number} already exists`);
    throw err;
  }
  return toDto(await getRow(ctx, orgId, projectId, id), today(ctx));
}

/**
 * Several items at once (a list pasted from the GC's email or walk-through notes), numbered in
 * order after the highest used. All or nothing: a date problem on any line refuses the lot.
 */
export async function createPunchItems(
  ctx: AppContext,
  orgId: string,
  projectId: string,
  items: Fields[],
): Promise<PunchListDto> {
  await getProjectRow(ctx, orgId, projectId);
  const existing = await rows(ctx, orgId, projectId);
  if (existing.length + items.length > MAX_PUNCH_ITEMS) {
    throw badRequest(`A job's punch list holds up to ${MAX_PUNCH_ITEMS} items`);
  }
  let number = nextPunchNumber(existing.map((r) => r.number));
  const inserts = items.map((input, i) => {
    const v = values(input);
    checkFacts(v, ctx, `Line ${i + 1}`);
    return { id: newId("pch"), orgId, projectId, number: number++, ...v };
  });
  try {
    const [first, ...rest] = inserts.map((r) => ctx.db.insert(punchItems).values(r));
    if (first) await ctx.db.batch([first, ...rest]);
  } catch (err) {
    if (isUniqueViolation(err)) throw conflict("Someone added items at the same time; try again");
    throw err;
  }
  return listPunchItems(ctx, orgId, projectId);
}

export async function updatePunchItem(
  ctx: AppContext,
  orgId: string,
  projectId: string,
  itemId: string,
  input: PunchItemUpdateBody,
): Promise<PunchItemDto> {
  const row = await getRow(ctx, orgId, projectId, itemId);
  const patch: Partial<typeof punchItems.$inferInsert> = {};
  if (input.description !== undefined) patch.description = input.description;
  for (const key of ["location", "completedBy", "acceptedBy", "disputeNote"] as const) {
    if (input[key] !== undefined) patch[key] = blank(input[key]);
  }
  for (const key of ["source", "listedOn", "dueOn", "completedOn", "acceptedOn"] as const) {
    if (input[key] !== undefined) (patch as Record<string, unknown>)[key] = input[key] ?? null;
  }
  checkFacts({ ...row, ...patch } as PunchRow, ctx);
  if (Object.keys(patch).length > 0) {
    await ctx.db
      .update(punchItems)
      .set(patch)
      .where(
        and(
          eq(punchItems.id, itemId),
          eq(punchItems.orgId, orgId),
          eq(punchItems.projectId, projectId),
        ),
      );
  }
  return toDto(await getRow(ctx, orgId, projectId, itemId), today(ctx));
}

export async function deletePunchItem(
  ctx: AppContext,
  orgId: string,
  projectId: string,
  itemId: string,
) {
  await getRow(ctx, orgId, projectId, itemId);
  await ctx.db
    .delete(punchItems)
    .where(
      and(
        eq(punchItems.id, itemId),
        eq(punchItems.orgId, orgId),
        eq(punchItems.projectId, projectId),
      ),
    );
}

export interface PunchListDocument {
  contractor: { name: string };
  project: Pick<
    ProjectRow,
    | "name"
    | "number"
    | "location"
    | "gcName"
    | "gcPmName"
    | "gcPmEmail"
    | "ownerName"
    | "architectName"
    | "isSample"
  >;
  list: PunchListDto;
  /** "open" prints only the items still to fix or waiting on a back-check. */
  scope: "all" | "open";
}

/** What the punch list PDF and CSV print: the job's parties and its items as entered. */
export async function loadPunchListDocument(
  ctx: AppContext,
  orgId: string,
  projectId: string,
  scope: PunchListDocument["scope"] = "all",
): Promise<PunchListDocument> {
  const [project, list, org] = await Promise.all([
    getProjectRow(ctx, orgId, projectId),
    listPunchItems(ctx, orgId, projectId),
    ctx.db
      .select({ name: organization.name })
      .from(organization)
      .where(eq(organization.id, orgId))
      .get(),
  ]);
  if (!org) throw notFound("Organization");
  return { contractor: { name: org.name }, project, list, scope };
}
