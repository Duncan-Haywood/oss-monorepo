// Submittal log per job (src/shared/submittals.ts, docs/SUBMITTALS.md): add, change, resubmit and
// delete, and the log as CSV. Every member reads; editors and up write (the route gates). On every
// plan: a log is part of running the job, not a paid add-on. Every query filters by org.

import type {
  createSubmittalSchema,
  importSubmittalsSchema,
  resubmitSubmittalSchema,
  updateSubmittalSchema,
} from "@shared/api/schemas";
import type { SubmittalDto, SubmittalLogDto } from "@shared/api/types";
import { SUBMITTAL_FILE_KIND } from "@shared/attachments";
import { ROLE_RANK } from "@shared/enums";
import {
  type CompanySubmittalInput,
  MAX_SUBMITTALS_PER_JOB,
  nextSubmittalNumber,
  RESUBMIT_ACTIONS,
  SUBMITTAL_ACTION_LABELS,
  SUBMITTAL_NOTE,
  SUBMITTAL_STATE_LABELS,
  SUBMITTAL_TYPE_LABELS,
  type SubmittalFacts,
  type SubmittalToChase,
  submittalProblem,
  submittalsToChase,
  summarizeSubmittals,
} from "@shared/submittals";
import { and, asc, eq, ne } from "drizzle-orm";
import type { z } from "zod";
import type { AppContext } from "../../context";
import { organization, projects, submittalFiles, submittals } from "../../db/schema";
import { badRequest, conflict, notFound } from "../../lib/errors";
import { newId } from "../../lib/ids";
import type { Tenant } from "../../types";
import { csvCell } from "../export/csv";
import { getProjectRow, type ProjectRow } from "./bundle";

type Row = typeof submittals.$inferSelect;
type CreateInput = z.infer<typeof createSubmittalSchema>;
type UpdateInput = z.infer<typeof updateSubmittalSchema>;
type ResubmitInput = z.infer<typeof resubmitSubmittalSchema>;
type ImportInput = z.infer<typeof importSubmittalsSchema>;

const ROWS_PER_INSERT = 4;

const blank = <T>(v: T | null | undefined): T | null => (v === undefined || v === "" ? null : v);

const dto = (r: Row): SubmittalDto => ({
  id: r.id,
  number: r.number,
  revision: r.revision,
  specSection: r.specSection,
  title: r.title,
  type: r.type,
  gcReference: r.gcReference,
  submittedOn: r.submittedOn,
  requiredBy: r.requiredBy,
  returnedOn: r.returnedOn,
  action: r.action,
  neededOnSite: r.neededOnSite,
  leadTimeDays: r.leadTimeDays,
  reviewDays: r.reviewDays,
  notes: r.notes,
  createdAt: r.createdAt.toISOString(),
  updatedAt: r.updatedAt.toISOString(),
});

async function project(ctx: AppContext, orgId: string, projectId: string) {
  const p = await ctx.db
    .select({ id: projects.id, name: projects.name, gcName: projects.gcName })
    .from(projects)
    .where(and(eq(projects.orgId, orgId), eq(projects.id, projectId)))
    .get();
  if (!p) throw notFound("Project");
  return p;
}

async function rows(ctx: AppContext, orgId: string, projectId: string) {
  return ctx.db
    .select()
    .from(submittals)
    .where(and(eq(submittals.orgId, orgId), eq(submittals.projectId, projectId)))
    .orderBy(asc(submittals.number), asc(submittals.revision))
    .all();
}

async function getRow(ctx: AppContext, orgId: string, projectId: string, id: string) {
  const r = await ctx.db
    .select()
    .from(submittals)
    .where(
      and(eq(submittals.orgId, orgId), eq(submittals.projectId, projectId), eq(submittals.id, id)),
    )
    .get();
  if (!r) throw notFound("Submittal");
  return r;
}

function check(facts: SubmittalFacts) {
  const problem = submittalProblem(facts);
  if (problem) throw badRequest(problem);
}

export async function submittalLog(
  ctx: AppContext,
  tenant: Tenant,
  projectId: string,
): Promise<SubmittalLogDto> {
  const p = await project(ctx, tenant.orgId, projectId);
  const items = await rows(ctx, tenant.orgId, projectId);
  return {
    projectName: p.name,
    gcName: p.gcName,
    items: items.map(dto),
    nextNumber: nextSubmittalNumber(items),
    canEdit: ROLE_RANK[tenant.role] >= ROLE_RANK.editor,
  };
}

export async function createSubmittal(
  ctx: AppContext,
  tenant: Tenant,
  projectId: string,
  input: CreateInput,
): Promise<SubmittalDto> {
  await project(ctx, tenant.orgId, projectId);
  const existing = await rows(ctx, tenant.orgId, projectId);
  if (existing.length >= MAX_SUBMITTALS_PER_JOB) {
    throw badRequest(`A job's log holds up to ${MAX_SUBMITTALS_PER_JOB} submittals`);
  }
  const number = input.number ?? nextSubmittalNumber(existing);
  if (existing.some((r) => r.number === number)) {
    throw conflict(`Submittal #${number} is already on this job; use Resubmit for a new revision`);
  }
  const values = {
    id: newId("smt"),
    orgId: tenant.orgId,
    projectId,
    number,
    revision: 0,
    specSection: blank(input.specSection),
    title: input.title,
    type: input.type,
    gcReference: blank(input.gcReference),
    submittedOn: blank(input.submittedOn),
    requiredBy: blank(input.requiredBy),
    returnedOn: blank(input.returnedOn),
    action: blank(input.action),
    neededOnSite: blank(input.neededOnSite),
    leadTimeDays: blank(input.leadTimeDays),
    reviewDays: blank(input.reviewDays),
    notes: blank(input.notes),
    createdBy: tenant.userId,
  };
  check(values);
  const [row] = await ctx.db.insert(submittals).values(values).returning();
  if (!row) throw new Error("submittal insert returned nothing");
  return dto(row);
}

/**
 * Rows from a register or the spec sections (src/shared/submittal-import.ts), added as new
 * submittals numbered from the job's next number in the order given, all or none. The log's limit
 * counts the rows already there.
 */
export async function importSubmittals(
  ctx: AppContext,
  tenant: Tenant,
  projectId: string,
  input: ImportInput,
): Promise<{ added: number; firstNumber: number; lastNumber: number }> {
  await project(ctx, tenant.orgId, projectId);
  const existing = await rows(ctx, tenant.orgId, projectId);
  if (existing.length + input.items.length > MAX_SUBMITTALS_PER_JOB) {
    throw badRequest(
      `A job's log holds up to ${MAX_SUBMITTALS_PER_JOB} submittals; it has ${existing.length}, so pick at most ${Math.max(0, MAX_SUBMITTALS_PER_JOB - existing.length)}`,
    );
  }
  const first = nextSubmittalNumber(existing);
  const values = input.items.map((it, i) => ({
    id: newId("smt"),
    orgId: tenant.orgId,
    projectId,
    number: first + i,
    revision: 0,
    specSection: blank(it.specSection),
    title: it.title,
    type: it.type,
    gcReference: blank(it.gcReference),
    submittedOn: null,
    requiredBy: blank(it.requiredBy),
    returnedOn: null,
    action: null,
    neededOnSite: blank(it.neededOnSite),
    leadTimeDays: blank(it.leadTimeDays),
    reviewDays: blank(it.reviewDays),
    notes: blank(it.notes),
    createdBy: tenant.userId,
  }));
  for (const v of values) check(v);
  // D1 binds at most 100 parameters to a statement (up to 20 columns a row, so 4 rows each); one batch is
  // one transaction, so the rows land together or not at all.
  const statements = [];
  for (let i = 0; i < values.length; i += ROWS_PER_INSERT)
    statements.push(ctx.db.insert(submittals).values(values.slice(i, i + ROWS_PER_INSERT)));
  const [head, ...tail] = statements;
  if (head) await ctx.db.batch([head, ...tail]);
  return { added: values.length, firstNumber: first, lastNumber: first + values.length - 1 };
}

export async function updateSubmittal(
  ctx: AppContext,
  tenant: Tenant,
  projectId: string,
  id: string,
  input: UpdateInput,
): Promise<SubmittalDto> {
  const cur = await getRow(ctx, tenant.orgId, projectId, id);
  // undefined leaves a field as it is; null or "" clears it.
  const pick = <K extends keyof UpdateInput & keyof Row>(k: K) =>
    input[k] === undefined ? cur[k] : blank(input[k]);
  const next = {
    specSection: pick("specSection"),
    title: input.title ?? cur.title,
    type: input.type ?? cur.type,
    gcReference: pick("gcReference"),
    submittedOn: pick("submittedOn"),
    requiredBy: pick("requiredBy"),
    returnedOn: pick("returnedOn"),
    action: pick("action"),
    neededOnSite: pick("neededOnSite"),
    leadTimeDays: pick("leadTimeDays"),
    reviewDays: pick("reviewDays"),
    notes: pick("notes"),
  };
  check({ ...cur, ...next });
  const [row] = await ctx.db
    .update(submittals)
    .set(next)
    .where(and(eq(submittals.orgId, tenant.orgId), eq(submittals.id, id)))
    .returning();
  if (!row) throw notFound("Submittal");
  return dto(row);
}

/**
 * The next revision of a submittal the GC sent back to revise or rejected: same number, title, spec
 * section and schedule facts; the sent date as given (or not yet), nothing returned. Only from the
 * newest revision.
 */
export async function resubmitSubmittal(
  ctx: AppContext,
  tenant: Tenant,
  projectId: string,
  id: string,
  input: ResubmitInput,
): Promise<SubmittalDto> {
  const cur = await getRow(ctx, tenant.orgId, projectId, id);
  if (!cur.action || !RESUBMIT_ACTIONS.includes(cur.action)) {
    throw badRequest(
      "Only a submittal returned to revise and resubmit, or rejected, is resubmitted",
    );
  }
  const all = await rows(ctx, tenant.orgId, projectId);
  if (all.some((r) => r.number === cur.number && r.revision > cur.revision)) {
    throw conflict(`Submittal #${cur.number} already has a later revision`);
  }
  if (all.length >= MAX_SUBMITTALS_PER_JOB) {
    throw badRequest(`A job's log holds up to ${MAX_SUBMITTALS_PER_JOB} submittals`);
  }
  const submittedOn = blank(input.submittedOn);
  if (submittedOn && cur.returnedOn && submittedOn < cur.returnedOn) {
    throw badRequest("The resubmittal's sent date is before the previous revision came back");
  }
  const [row] = await ctx.db
    .insert(submittals)
    .values({
      id: newId("smt"),
      orgId: tenant.orgId,
      projectId,
      number: cur.number,
      revision: cur.revision + 1,
      specSection: cur.specSection,
      title: cur.title,
      type: cur.type,
      gcReference: cur.gcReference,
      submittedOn,
      requiredBy: null,
      returnedOn: null,
      action: null,
      neededOnSite: cur.neededOnSite,
      leadTimeDays: cur.leadTimeDays,
      reviewDays: cur.reviewDays,
      notes: null,
      createdBy: tenant.userId,
    })
    .returning();
  if (!row) throw new Error("submittal insert returned nothing");
  return dto(row);
}

export async function deleteSubmittal(
  ctx: AppContext,
  orgId: string,
  projectId: string,
  id: string,
) {
  await getRow(ctx, orgId, projectId, id);
  await ctx.db.delete(submittals).where(and(eq(submittals.orgId, orgId), eq(submittals.id, id)));
}

/** The log as CSV, every revision, with the status worked on `today`. */
export async function submittalLogCsv(
  ctx: AppContext,
  orgId: string,
  projectId: string,
  today: string,
): Promise<{ csv: string; projectName: string }> {
  const p = await project(ctx, orgId, projectId);
  const items = await rows(ctx, orgId, projectId);
  const { status } = summarizeSubmittals(items, today);
  const header = [
    "Number",
    "Revision",
    "Spec section",
    "Title",
    "Type",
    "GC reference",
    "Sent",
    "Required back",
    "Returned",
    "GC action",
    "Status",
    "Days with GC",
    "Days overdue",
    "Needed on site",
    "Lead time (days)",
    "Review (days)",
    "Submit by",
    "Delivery at risk",
    "Notes",
  ];
  const lines = [header.map(csvCell).join(",")];
  for (const r of items) {
    const st = status.get(r.id);
    const cells: (string | number | null)[] = [
      r.number,
      r.revision,
      r.specSection,
      r.title,
      SUBMITTAL_TYPE_LABELS[r.type],
      r.gcReference,
      r.submittedOn,
      r.requiredBy,
      r.returnedOn,
      r.action ? SUBMITTAL_ACTION_LABELS[r.action] : null,
      st ? SUBMITTAL_STATE_LABELS[st.state] : null,
      st?.daysWithGc ?? null,
      st?.overdue ? st.daysOverdue : null,
      r.neededOnSite,
      r.leadTimeDays,
      r.reviewDays,
      st?.submitBy ?? null,
      st?.deliveryAtRisk === null || st?.deliveryAtRisk === undefined
        ? null
        : st.deliveryAtRisk
          ? "Yes"
          : "No",
      r.notes,
    ];
    lines.push(cells.map(csvCell).join(","));
  }
  lines.push("");
  lines.push(csvCell(`As of ${today}. ${SUBMITTAL_NOTE}`));
  return { csv: `${lines.join("\r\n")}\r\n`, projectName: p.name };
}

/** What the transmittal cover sheet prints: the job, the company sending it, the submittal, the
 * revision it replaces (with what the GC said about it), if any, and the files attached to it that
 * go to the reviewer (every one but the stamped copy returned), oldest first. */
export interface SubmittalTransmittal {
  contractor: { name: string };
  project: ProjectRow;
  submittal: SubmittalDto;
  previous: SubmittalDto | null;
  enclosures: { fileName: string; kind: string }[];
}

export async function loadSubmittalTransmittal(
  ctx: AppContext,
  orgId: string,
  projectId: string,
  id: string,
): Promise<SubmittalTransmittal> {
  const [project, row, org, files] = await Promise.all([
    getProjectRow(ctx, orgId, projectId),
    getRow(ctx, orgId, projectId, id),
    ctx.db
      .select({ name: organization.name })
      .from(organization)
      .where(eq(organization.id, orgId))
      .get(),
    ctx.db
      .select({ fileName: submittalFiles.fileName, category: submittalFiles.category })
      .from(submittalFiles)
      .where(
        and(
          eq(submittalFiles.orgId, orgId),
          eq(submittalFiles.projectId, projectId),
          eq(submittalFiles.submittalId, id),
          ne(submittalFiles.category, "signed"),
        ),
      )
      .orderBy(asc(submittalFiles.createdAt), asc(submittalFiles.id))
      .all(),
  ]);
  if (!org) throw notFound("Organization");
  const prev =
    row.revision > 0
      ? await ctx.db
          .select()
          .from(submittals)
          .where(
            and(
              eq(submittals.orgId, orgId),
              eq(submittals.projectId, projectId),
              eq(submittals.number, row.number),
              eq(submittals.revision, row.revision - 1),
            ),
          )
          .get()
      : undefined;
  return {
    contractor: { name: org.name },
    project,
    submittal: dto(row),
    previous: prev ? dto(prev) : null,
    enclosures: files.map((f) => ({ fileName: f.fileName, kind: SUBMITTAL_FILE_KIND[f.category] })),
  };
}

/**
 * Every submittal revision on the company's active jobs, with each job's name, for the list to
 * chase (weekly email, projects page). All revisions are read so only the newest of each number
 * counts. Closed jobs are left out (nothing waits on their material), and so is the sample job
 * unless asked for: its submittals are invented.
 */
export async function companySubmittalInputs(
  ctx: AppContext,
  orgId: string,
  opts: { excludeSample?: boolean } = {},
): Promise<CompanySubmittalInput[]> {
  const conds = [
    eq(submittals.orgId, orgId),
    eq(projects.orgId, orgId),
    eq(projects.status, "active"),
  ];
  if (opts.excludeSample) conds.push(eq(projects.isSample, false));
  return ctx.db
    .select({
      id: submittals.id,
      projectId: submittals.projectId,
      projectName: projects.name,
      projectNumber: projects.number,
      gcName: projects.gcName,
      number: submittals.number,
      revision: submittals.revision,
      specSection: submittals.specSection,
      title: submittals.title,
      type: submittals.type,
      submittedOn: submittals.submittedOn,
      requiredBy: submittals.requiredBy,
      returnedOn: submittals.returnedOn,
      action: submittals.action,
      neededOnSite: submittals.neededOnSite,
      leadTimeDays: submittals.leadTimeDays,
      reviewDays: submittals.reviewDays,
    })
    .from(submittals)
    .innerJoin(projects, eq(projects.id, submittals.projectId))
    .where(and(...conds))
    .all();
}

/** Submittals to chase across the company's active jobs on `today` (the sample job included: it is on the page). */
export async function listSubmittalsToChase(
  ctx: AppContext,
  orgId: string,
  today: string,
): Promise<SubmittalToChase[]> {
  return submittalsToChase(await companySubmittalInputs(ctx, orgId), today);
}
