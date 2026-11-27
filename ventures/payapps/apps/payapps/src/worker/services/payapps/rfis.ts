// RFIs on a job: create, change, delete, and the log with each RFI's status for today. Every query
// filters by org_id and the job; a linked change order must be on the same job. The rules (status,
// overdue, dates in order, the next number) are pure in @shared/rfi.
import type { RfiInputBody, RfiUpdateBody } from "@shared/api/schemas";
import type { RfiDto, RfiLogDto } from "@shared/api/types";
import {
  type CompanyRfiInput,
  daysOutstanding,
  daysOverdue,
  needsChangeOrder,
  nextRfiNumber,
  type OverdueRfi,
  overdueRfis,
  type RfiFacts,
  rfiDateProblem,
  rfiStatus,
  summarizeRfis,
} from "@shared/rfi";
import { and, asc, eq, isNotNull, isNull } from "drizzle-orm";
import type { AppContext } from "../../context";
import { changeOrders, organization, projects, rfis } from "../../db/schema";
import { badRequest, conflict, notFound } from "../../lib/errors";
import { newId } from "../../lib/ids";
import { getProjectRow, type ProjectRow } from "./bundle";
import { rfiFileCounts, rfiFileKind, rfiFileRows, sentWithRfi } from "./rfi-files";

type RfiRow = typeof rfis.$inferSelect;

const today = (ctx: AppContext) => ctx.now().toISOString().slice(0, 10);

/** Blank strings stored as null, so a cleared field reads as "not entered". */
const blank = (v: string | null | undefined) => (v?.trim() ? v.trim() : null);

function toDto(
  r: RfiRow,
  coNumbers: Map<string, string>,
  day: string,
  fileCounts: Map<string, number>,
): RfiDto {
  return {
    id: r.id,
    number: r.number,
    subject: r.subject,
    question: r.question,
    suggestion: r.suggestion,
    reference: r.reference,
    sentOn: r.sentOn,
    responseDueOn: r.responseDueOn,
    answeredOn: r.answeredOn,
    answer: r.answer,
    answeredBy: r.answeredBy,
    costImpact: r.costImpact,
    timeImpact: r.timeImpact,
    changeOrderId: r.changeOrderId,
    changeOrderNumber: r.changeOrderId ? (coNumbers.get(r.changeOrderId) ?? null) : null,
    status: rfiStatus(r, day),
    daysOutstanding: daysOutstanding(r, day),
    daysOverdue: daysOverdue(r, day),
    needsChangeOrder: needsChangeOrder(r),
    fileCount: fileCounts.get(r.id) ?? 0,
  };
}

async function rows(ctx: AppContext, orgId: string, projectId: string) {
  return ctx.db
    .select()
    .from(rfis)
    .where(and(eq(rfis.orgId, orgId), eq(rfis.projectId, projectId)))
    .orderBy(asc(rfis.number))
    .all();
}

async function oneDto(ctx: AppContext, orgId: string, projectId: string, row: RfiRow) {
  const [coNumbers, counts] = await Promise.all([
    changeOrderNumbers(ctx, orgId, projectId),
    rfiFileCounts(ctx, orgId, projectId),
  ]);
  return toDto(row, coNumbers, today(ctx), counts);
}

async function changeOrderNumbers(ctx: AppContext, orgId: string, projectId: string) {
  const cos = await ctx.db
    .select({ id: changeOrders.id, number: changeOrders.number })
    .from(changeOrders)
    .where(and(eq(changeOrders.orgId, orgId), eq(changeOrders.projectId, projectId)))
    .all();
  return new Map(cos.map((c) => [c.id, c.number]));
}

export async function listRfis(
  ctx: AppContext,
  orgId: string,
  projectId: string,
): Promise<RfiLogDto> {
  await getProjectRow(ctx, orgId, projectId);
  const [list, coNumbers, counts] = await Promise.all([
    rows(ctx, orgId, projectId),
    changeOrderNumbers(ctx, orgId, projectId),
    rfiFileCounts(ctx, orgId, projectId),
  ]);
  const day = today(ctx);
  return {
    items: list.map((r) => toDto(r, coNumbers, day, counts)),
    summary: summarizeRfis(list, day),
    nextNumber: nextRfiNumber(list.map((r) => r.number)),
    today: day,
  };
}

async function getRow(ctx: AppContext, orgId: string, projectId: string, rfiId: string) {
  const row = await ctx.db
    .select()
    .from(rfis)
    .where(and(eq(rfis.id, rfiId), eq(rfis.orgId, orgId), eq(rfis.projectId, projectId)))
    .get();
  if (!row) throw notFound("RFI");
  return row;
}

function checkFacts(
  facts: Pick<RfiFacts, "sentOn" | "responseDueOn" | "answeredOn">,
  ctx: AppContext,
) {
  const problem = rfiDateProblem(facts, today(ctx));
  if (problem) throw badRequest(problem);
}

function isUniqueViolation(err: unknown) {
  return err instanceof Error && /UNIQUE constraint failed/i.test(`${err.message} ${err.cause}`);
}

export async function createRfi(
  ctx: AppContext,
  orgId: string,
  projectId: string,
  input: RfiInputBody,
): Promise<RfiDto> {
  await getProjectRow(ctx, orgId, projectId);
  const existing = await rows(ctx, orgId, projectId);
  const number = input.number ?? nextRfiNumber(existing.map((r) => r.number));
  if (existing.some((r) => r.number === number)) throw conflict(`RFI ${number} already exists`);
  const values = {
    subject: input.subject,
    question: input.question,
    suggestion: blank(input.suggestion),
    reference: blank(input.reference),
    sentOn: input.sentOn ?? null,
    responseDueOn: input.responseDueOn ?? null,
    answeredOn: input.answeredOn ?? null,
    answer: blank(input.answer),
    answeredBy: blank(input.answeredBy),
    costImpact: input.costImpact ?? null,
    timeImpact: input.timeImpact ?? null,
    changeOrderId: input.changeOrderId ?? null,
  };
  checkFacts(values, ctx);
  if (values.changeOrderId) await checkChangeOrder(ctx, orgId, projectId, values.changeOrderId);
  const id = newId("rfi");
  try {
    await ctx.db.insert(rfis).values({ id, orgId, projectId, number, ...values });
  } catch (err) {
    // Two people adding the next RFI at once: the unique index keeps the numbers apart.
    if (isUniqueViolation(err)) throw conflict(`RFI ${number} already exists`);
    throw err;
  }
  const row = await getRow(ctx, orgId, projectId, id);
  return oneDto(ctx, orgId, projectId, row);
}

async function checkChangeOrder(
  ctx: AppContext,
  orgId: string,
  projectId: string,
  changeOrderId: string,
) {
  const co = await ctx.db
    .select({ id: changeOrders.id })
    .from(changeOrders)
    .where(
      and(
        eq(changeOrders.id, changeOrderId),
        eq(changeOrders.orgId, orgId),
        eq(changeOrders.projectId, projectId),
      ),
    )
    .get();
  if (!co) throw badRequest("That change order is not on this job");
}

export async function updateRfi(
  ctx: AppContext,
  orgId: string,
  projectId: string,
  rfiId: string,
  input: RfiUpdateBody,
): Promise<RfiDto> {
  const row = await getRow(ctx, orgId, projectId, rfiId);
  const patch: Partial<typeof rfis.$inferInsert> = {};
  if (input.subject !== undefined) patch.subject = input.subject;
  if (input.question !== undefined) patch.question = input.question;
  for (const key of ["suggestion", "reference", "answer", "answeredBy"] as const) {
    if (input[key] !== undefined) patch[key] = blank(input[key]);
  }
  for (const key of [
    "sentOn",
    "responseDueOn",
    "answeredOn",
    "costImpact",
    "timeImpact",
    "changeOrderId",
  ] as const) {
    if (input[key] !== undefined) (patch as Record<string, unknown>)[key] = input[key] ?? null;
  }
  const next = { ...row, ...patch } as RfiRow;
  checkFacts(next, ctx);
  if (patch.changeOrderId) await checkChangeOrder(ctx, orgId, projectId, patch.changeOrderId);
  if (Object.keys(patch).length > 0) {
    await ctx.db
      .update(rfis)
      .set(patch)
      .where(and(eq(rfis.id, rfiId), eq(rfis.orgId, orgId), eq(rfis.projectId, projectId)));
  }
  const saved = await getRow(ctx, orgId, projectId, rfiId);
  return oneDto(ctx, orgId, projectId, saved);
}

/** One RFI as the log shows it (the routes read it before a change, for the job history). */
export async function getRfi(
  ctx: AppContext,
  orgId: string,
  projectId: string,
  rfiId: string,
): Promise<RfiDto> {
  const row = await getRow(ctx, orgId, projectId, rfiId);
  return oneDto(ctx, orgId, projectId, row);
}

export async function deleteRfi(ctx: AppContext, orgId: string, projectId: string, rfiId: string) {
  await getRow(ctx, orgId, projectId, rfiId);
  await ctx.db
    .delete(rfis)
    .where(and(eq(rfis.id, rfiId), eq(rfis.orgId, orgId), eq(rfis.projectId, projectId)));
}

export interface RfiDocument {
  contractor: { name: string };
  project: Pick<
    ProjectRow,
    | "name"
    | "number"
    | "location"
    | "gcName"
    | "gcAddress"
    | "gcPmName"
    | "gcPmEmail"
    | "ownerName"
    | "architectName"
    | "isSample"
  >;
  rfi: RfiDto;
  /** Files that go with the RFI (not the response that came back), oldest first. */
  attached: { fileName: string; kind: string }[];
  today: string;
}

/** What the RFI PDF prints: the job's parties and the one RFI as entered. */
export async function loadRfiDocument(
  ctx: AppContext,
  orgId: string,
  projectId: string,
  rfiId: string,
): Promise<RfiDocument> {
  const [project, row, org, coNumbers, files] = await Promise.all([
    getProjectRow(ctx, orgId, projectId),
    getRow(ctx, orgId, projectId, rfiId),
    ctx.db
      .select({ name: organization.name })
      .from(organization)
      .where(eq(organization.id, orgId))
      .get(),
    changeOrderNumbers(ctx, orgId, projectId),
    rfiFileRows(ctx, orgId, projectId, rfiId),
  ]);
  if (!org) throw notFound("Organization");
  const day = today(ctx);
  return {
    contractor: { name: org.name },
    project,
    rfi: toDto(row, coNumbers, day, new Map([[row.id, files.length]])),
    attached: files
      .filter((f) => sentWithRfi(f.category))
      .map((f) => ({ fileName: f.fileName, kind: rfiFileKind(f.category) })),
    today: day,
  };
}

/** The job's RFI log as rows of a spreadsheet, plus the job for the file name. */
export async function loadRfiLog(ctx: AppContext, orgId: string, projectId: string) {
  const [project, log] = await Promise.all([
    getProjectRow(ctx, orgId, projectId),
    listRfis(ctx, orgId, projectId),
  ]);
  return { project, log };
}

/**
 * The company's sent, unanswered RFIs on its active jobs, with each job's name, for the overdue list
 * (weekly email, projects page). Closed jobs are left out (the work is finished, nothing waits on the
 * answer), and so is the sample job unless asked for: its RFIs are invented.
 */
export async function companyRfiInputs(
  ctx: AppContext,
  orgId: string,
  opts: { excludeSample?: boolean } = {},
): Promise<CompanyRfiInput[]> {
  const conds = [
    eq(rfis.orgId, orgId),
    eq(projects.orgId, orgId),
    eq(projects.status, "active"),
    isNotNull(rfis.sentOn),
    isNull(rfis.answeredOn),
  ];
  if (opts.excludeSample) conds.push(eq(projects.isSample, false));
  return ctx.db
    .select({
      id: rfis.id,
      projectId: rfis.projectId,
      projectName: projects.name,
      projectNumber: projects.number,
      gcName: projects.gcName,
      number: rfis.number,
      subject: rfis.subject,
      sentOn: rfis.sentOn,
      responseDueOn: rfis.responseDueOn,
      answeredOn: rfis.answeredOn,
    })
    .from(rfis)
    .innerJoin(projects, eq(projects.id, rfis.projectId))
    .where(and(...conds))
    .all();
}

/** Overdue RFIs across the company's active jobs (the sample job included: it is on the page). */
export async function listOverdueRfis(ctx: AppContext, orgId: string): Promise<OverdueRfi[]> {
  return overdueRfis(await companyRfiInputs(ctx, orgId), today(ctx));
}
