// Job costing per job and the org's WIP schedule (the math is src/shared/job-cost.ts). Billing comes
// from the latest application not in draft, so a draft being typed never moves the WIP figures;
// costs dated after that application's period end are listed apart. Budgets and costs are readable
// on every plan; changing them needs Crew and up (assertJobCosting). Every query filters by org.

import type {
  jobCostBudgetsSchema,
  jobCostCommitmentSchema,
  jobCostEntriesSchema,
  jobCostTypeBudgetsSchema,
  updateJobCostCommitmentSchema,
  updateJobCostEntrySchema,
} from "@shared/api/schemas";
import type {
  JobCostCommitmentDto,
  JobCostDto,
  JobCostEntryDto,
  WipReportDto,
  WipRowDto,
} from "@shared/api/types";
import { type CostTypeSplit, computeCostTypes, isSplit, splitSum } from "@shared/cost-type-budget";
import {
  COMMITMENT_KIND_LABELS,
  COST_CATEGORIES,
  COST_CATEGORY_LABELS,
  computeJobCost,
  type JobCostReport,
  MAX_COMMITMENTS_PER_JOB,
  MAX_COST_ENTRIES_PER_JOB,
} from "@shared/job-cost";
import { centsToDecimal } from "@shared/money";
import { changeOrderAdjustments } from "@shared/payapp-math";
import { and, asc, count, eq, inArray } from "drizzle-orm";
import type { z } from "zod";
import type { AppContext } from "../../context";
import {
  jobCostBudgets,
  jobCostCommitments,
  jobCostEntries,
  jobCostTypeBudgets,
  projects,
} from "../../db/schema";
import { badRequest, notFound } from "../../lib/errors";
import { newId } from "../../lib/ids";
import type { Tenant } from "../../types";
import { orgPlan } from "../billing";
import { csvCell } from "../export/csv";
import { loadBundle, type ProjectBundle, toChangeOrderInput } from "./bundle";
import { isoDay } from "./cash";

type EntryRow = typeof jobCostEntries.$inferSelect;
type CommitmentRow = typeof jobCostCommitments.$inferSelect;

const blank = (v: string | null | undefined) => (v ? v : null);

const entryDto = (r: EntryRow): JobCostEntryDto => ({
  id: r.id,
  sovLineId: r.sovLineId,
  incurredOn: r.incurredOn,
  category: r.category,
  amountCents: r.amountCents,
  vendor: r.vendor,
  description: r.description,
  reference: r.reference,
  commitmentId: r.commitmentId,
  fromQuickBooks: r.qboSource !== null,
  createdAt: r.createdAt.toISOString(),
});

function commitmentDtos(rows: CommitmentRow[], report: JobCostReport): JobCostCommitmentDto[] {
  const status = new Map(report.commitments.map((c) => [c.id, c]));
  return rows.map((r) => {
    const st = status.get(r.id);
    return {
      id: r.id,
      sovLineId: r.sovLineId,
      kind: r.kind,
      category: r.category,
      vendor: r.vendor,
      reference: r.reference,
      description: r.description,
      committedOn: r.committedOn,
      amountCents: r.amountCents,
      invoicedCents: st?.invoicedCents ?? 0,
      openCents: st?.openCents ?? 0,
      overInvoicedCents: st?.overInvoicedCents ?? 0,
      afterAsOf: st?.afterAsOf ?? false,
      fromQuickBooks: r.qboSource !== null,
      createdAt: r.createdAt.toISOString(),
    };
  });
}

/** The latest application not in draft, with its computed figures. */
function billedApplication(b: ProjectBundle) {
  for (let i = b.payApps.length - 1; i >= 0; i--) {
    const app = b.payApps[i];
    if (app && app.status !== "draft") return { app, computed: b.computed[i] };
  }
  return null;
}

async function loadInputs(ctx: AppContext, orgId: string, b: ProjectBundle) {
  const projectId = b.project.id;
  const [budgets, entries, commitments] = await Promise.all([
    ctx.db
      .select()
      .from(jobCostBudgets)
      .where(and(eq(jobCostBudgets.orgId, orgId), eq(jobCostBudgets.projectId, projectId))),
    ctx.db
      .select()
      .from(jobCostEntries)
      .where(and(eq(jobCostEntries.orgId, orgId), eq(jobCostEntries.projectId, projectId)))
      .orderBy(asc(jobCostEntries.incurredOn), asc(jobCostEntries.createdAt)),
    ctx.db
      .select()
      .from(jobCostCommitments)
      .where(and(eq(jobCostCommitments.orgId, orgId), eq(jobCostCommitments.projectId, projectId)))
      .orderBy(asc(jobCostCommitments.committedOn), asc(jobCostCommitments.createdAt)),
  ]);
  return { budgets: new Map(budgets.map((r) => [r.sovLineId, r])), entries, commitments };
}

/** Each line's saved budget by cost type. */
async function loadSplits(ctx: AppContext, orgId: string, projectId: string) {
  const rows = await ctx.db
    .select()
    .from(jobCostTypeBudgets)
    .where(and(eq(jobCostTypeBudgets.orgId, orgId), eq(jobCostTypeBudgets.projectId, projectId)));
  const out: Record<string, CostTypeSplit> = {};
  for (const r of rows) {
    const split = out[r.sovLineId] ?? {};
    split[r.category] = r.budgetCents;
    out[r.sovLineId] = split;
  }
  return out;
}

type BudgetRow = typeof jobCostBudgets.$inferSelect;

function reportOf(
  ctx: AppContext,
  b: ProjectBundle,
  budgets: Map<string, BudgetRow>,
  entries: EntryRow[],
  commitments: CommitmentRow[],
): { report: JobCostReport; billedThrough: JobCostDto["billedThrough"] } {
  const billed = billedApplication(b);
  const byLine = new Map(billed?.computed?.lines.map((l) => [l.sovLineId, l]) ?? []);
  // Before the first sent application: the contract as of today (approved change orders counted).
  const asOf = billed ? billed.app.periodTo : isoDay(ctx.now());
  const adjustments = billed
    ? null
    : changeOrderAdjustments(b.changeOrders.map(toChangeOrderInput), asOf);
  const report = computeJobCost({
    asOf: billed ? billed.app.periodTo : null,
    lines: b.sov.map((l) => {
      const c = byLine.get(l.id);
      return {
        sovLineId: l.id,
        itemNumber: l.itemNumber,
        description: l.description,
        scheduledValueCents: c
          ? c.scheduledValueCents
          : l.originalCents + (adjustments?.get(l.id) ?? 0),
        billedToDateCents: c ? c.completedAndStoredCents : 0,
        budgetCents: budgets.get(l.id)?.budgetCents ?? null,
        costToCompleteCents: budgets.get(l.id)?.costToCompleteCents ?? null,
        costToCompleteOn: budgets.get(l.id)?.costToCompleteOn ?? null,
      };
    }),
    entries: entries.map((e) => ({
      sovLineId: e.sovLineId,
      incurredOn: e.incurredOn,
      amountCents: e.amountCents,
      category: e.category,
      commitmentId: e.commitmentId,
    })),
    commitments: commitments.map((c) => ({
      id: c.id,
      sovLineId: c.sovLineId,
      committedOn: c.committedOn,
      amountCents: c.amountCents,
    })),
  });
  return {
    report,
    billedThrough: billed
      ? { payAppId: billed.app.id, number: billed.app.number, periodTo: billed.app.periodTo }
      : null,
  };
}

export async function getJobCost(
  ctx: AppContext,
  orgId: string,
  projectId: string,
): Promise<JobCostDto> {
  const [b, { plan }] = await Promise.all([loadBundle(ctx, orgId, projectId), orgPlan(ctx, orgId)]);
  const [{ budgets, entries, commitments }, splits] = await Promise.all([
    loadInputs(ctx, orgId, b),
    loadSplits(ctx, orgId, projectId),
  ]);
  const { report, billedThrough } = reportOf(ctx, b, budgets, entries, commitments);
  const costTypes = computeCostTypes({
    asOf: report.asOf,
    lines: report.lines.map((l) => ({
      sovLineId: l.sovLineId,
      itemNumber: l.itemNumber,
      description: l.description,
      budgetCents: l.budgetCents,
      split: splits[l.sovLineId] ?? null,
    })),
    entries: entries.map((e) => ({
      sovLineId: e.sovLineId,
      incurredOn: e.incurredOn,
      amountCents: e.amountCents,
      category: e.category,
    })),
  });
  return {
    projectId,
    projectName: b.project.name,
    billedThrough,
    report,
    entries: entries.map(entryDto),
    commitments: commitmentDtos(commitments, report),
    canEdit: plan.jobCosting,
    costTypes,
    costTypeSplits: splits,
  };
}

async function projectLineIds(ctx: AppContext, orgId: string, projectId: string) {
  const b = await loadBundle(ctx, orgId, projectId);
  return new Set(b.sov.map((l) => l.id));
}

function checkLine(lines: Set<string>, sovLineId: string | null | undefined) {
  if (sovLineId && !lines.has(sovLineId)) {
    throw badRequest("That schedule-of-values line is not on this job");
  }
}

/** D1 runs a batch as one transaction; keep each batch to a modest number of statements. */
const BATCH = 50;

export async function setBudgets(
  ctx: AppContext,
  tenant: Tenant,
  projectId: string,
  input: z.infer<typeof jobCostBudgetsSchema>,
) {
  const { orgId, userId } = tenant;
  const lines = await projectLineIds(ctx, orgId, projectId);
  const seen = new Set<string>();
  for (const l of input.lines) {
    checkLine(lines, l.sovLineId);
    if (seen.has(l.sovLineId)) throw badRequest("A line is listed twice");
    seen.add(l.sovLineId);
    if (l.budgetCents === null && l.costToCompleteCents != null) {
      throw badRequest("A cost to complete needs a budget on the line; enter the bid budget first");
    }
  }
  const existing = new Map(
    (
      await ctx.db
        .select()
        .from(jobCostBudgets)
        .where(and(eq(jobCostBudgets.orgId, orgId), eq(jobCostBudgets.projectId, projectId)))
    ).map((r) => [r.sovLineId, r]),
  );
  const today = isoDay(ctx.now());
  // A cleared budget takes its split by cost type with it: nothing is left to split.
  const cleared = input.lines.filter((l) => l.budgetCents === null).map((l) => l.sovLineId);
  // biome-ignore lint/suspicious/noExplicitAny: drizzle's batch item type is not exported
  const statements: any[] = input.lines.map((l) => {
    if (l.budgetCents === null) {
      return ctx.db
        .delete(jobCostBudgets)
        .where(and(eq(jobCostBudgets.orgId, orgId), eq(jobCostBudgets.sovLineId, l.sovLineId)));
    }
    const before = existing.get(l.sovLineId);
    // Left out keeps the cost to complete; a changed figure is dated today, an unchanged one keeps
    // its date so saving the budgets again does not move what the costs since it are counted against.
    const ctc =
      l.costToCompleteCents === undefined
        ? (before?.costToCompleteCents ?? null)
        : l.costToCompleteCents;
    const ctcOn =
      ctc === null
        ? null
        : before && before.costToCompleteCents === ctc && before.costToCompleteOn
          ? before.costToCompleteOn
          : today;
    return ctx.db
      .insert(jobCostBudgets)
      .values({
        id: newId("jcb"),
        orgId,
        projectId,
        sovLineId: l.sovLineId,
        budgetCents: l.budgetCents,
        costToCompleteCents: ctc,
        costToCompleteOn: ctcOn,
        updatedBy: userId,
      })
      .onConflictDoUpdate({
        target: jobCostBudgets.sovLineId,
        set: {
          budgetCents: l.budgetCents,
          costToCompleteCents: ctc,
          costToCompleteOn: ctcOn,
          updatedBy: userId,
          updatedAt: ctx.now(),
        },
      });
  });
  for (let i = 0; i < cleared.length; i += 90) {
    statements.push(
      ctx.db
        .delete(jobCostTypeBudgets)
        .where(
          and(
            eq(jobCostTypeBudgets.orgId, orgId),
            eq(jobCostTypeBudgets.projectId, projectId),
            inArray(jobCostTypeBudgets.sovLineId, cleared.slice(i, i + 90)),
          ),
        ),
    );
  }
  await runBatches(ctx, statements);
}

/**
 * Saves lines' budgets by cost type. A split replaces the line's saved one and sets the line's
 * budget to its sum (the cost to complete is kept, as a budget change keeps it); null clears the
 * split and leaves the line's budget as it is.
 */
export async function setCostTypeBudgets(
  ctx: AppContext,
  tenant: Tenant,
  projectId: string,
  input: z.infer<typeof jobCostTypeBudgetsSchema>,
) {
  const { orgId, userId } = tenant;
  const lines = await projectLineIds(ctx, orgId, projectId);
  const seen = new Set<string>();
  for (const l of input.lines) {
    checkLine(lines, l.sovLineId);
    if (seen.has(l.sovLineId)) throw badRequest("A line is listed twice");
    seen.add(l.sovLineId);
  }
  // biome-ignore lint/suspicious/noExplicitAny: drizzle's batch item type is not exported
  const statements: any[] = [];
  for (const l of input.lines) {
    statements.push(
      ctx.db
        .delete(jobCostTypeBudgets)
        .where(
          and(
            eq(jobCostTypeBudgets.orgId, orgId),
            eq(jobCostTypeBudgets.projectId, projectId),
            eq(jobCostTypeBudgets.sovLineId, l.sovLineId),
          ),
        ),
    );
    if (!isSplit(l.split)) continue;
    const split = l.split;
    const rows = COST_CATEGORIES.filter((c) => split[c] !== undefined).map((c) => ({
      id: newId("jct"),
      orgId,
      projectId,
      sovLineId: l.sovLineId,
      category: c,
      budgetCents: split[c] ?? 0,
      updatedBy: userId,
    }));
    statements.push(ctx.db.insert(jobCostTypeBudgets).values(rows));
    const sum = splitSum(split);
    statements.push(
      ctx.db
        .insert(jobCostBudgets)
        .values({
          id: newId("jcb"),
          orgId,
          projectId,
          sovLineId: l.sovLineId,
          budgetCents: sum,
          updatedBy: userId,
        })
        .onConflictDoUpdate({
          target: jobCostBudgets.sovLineId,
          set: { budgetCents: sum, updatedBy: userId, updatedAt: ctx.now() },
        }),
    );
  }
  await runBatches(ctx, statements);
}

// biome-ignore lint/suspicious/noExplicitAny: drizzle's batch item type is not exported
export async function runBatches(ctx: AppContext, statements: any[]) {
  for (let i = 0; i < statements.length; i += BATCH) {
    const chunk = statements.slice(i, i + BATCH);
    // biome-ignore lint/suspicious/noExplicitAny: see above
    await ctx.db.batch(chunk as [any, ...any[]]);
  }
}

export async function addEntries(
  ctx: AppContext,
  tenant: Tenant,
  projectId: string,
  input: z.infer<typeof jobCostEntriesSchema>,
): Promise<{ added: number; skipped: number }> {
  const { orgId, userId } = tenant;
  const lines = await projectLineIds(ctx, orgId, projectId);
  for (const e of input.entries) checkLine(lines, e.sovLineId);
  let entries = input.entries;
  if (input.skipExistingReferences) {
    const refs = await ctx.db
      .select({ reference: jobCostEntries.reference })
      .from(jobCostEntries)
      .where(and(eq(jobCostEntries.orgId, orgId), eq(jobCostEntries.projectId, projectId)))
      .all();
    const seen = new Set(refs.map((r) => r.reference).filter((r): r is string => !!r));
    entries = entries.filter((e) => {
      const ref = blank(e.reference);
      if (ref === null) return true;
      if (seen.has(ref)) return false;
      seen.add(ref); // two entries with one reference in a request: the first is kept
      return true;
    });
  }
  const skipped = input.entries.length - entries.length;
  if (entries.length === 0) return { added: 0, skipped };
  const wanted = [...new Set(entries.map((e) => e.commitmentId).filter((v) => !!v))];
  if (wanted.length > 0) {
    const ids = await projectCommitmentIds(ctx, orgId, projectId);
    for (const id of wanted) checkCommitment(ids, id);
  }
  const existing = await ctx.db
    .select({ n: count() })
    .from(jobCostEntries)
    .where(and(eq(jobCostEntries.orgId, orgId), eq(jobCostEntries.projectId, projectId)))
    .get();
  if ((existing?.n ?? 0) + entries.length > MAX_COST_ENTRIES_PER_JOB) {
    throw badRequest(
      `A job keeps up to ${MAX_COST_ENTRIES_PER_JOB.toLocaleString("en-US")} cost lines; enter weekly or monthly totals instead of single receipts.`,
    );
  }
  const rows = entries.map((e) => ({
    id: newId("jce"),
    orgId,
    projectId,
    sovLineId: e.sovLineId,
    incurredOn: e.incurredOn,
    category: e.category,
    amountCents: e.amountCents,
    vendor: blank(e.vendor),
    description: blank(e.description),
    reference: blank(e.reference),
    commitmentId: e.commitmentId ?? null,
    createdBy: userId,
  }));
  await runBatches(
    ctx,
    rows.map((r) => ctx.db.insert(jobCostEntries).values(r)),
  );
  return { added: rows.length, skipped };
}

async function getEntry(ctx: AppContext, orgId: string, projectId: string, entryId: string) {
  const row = await ctx.db
    .select()
    .from(jobCostEntries)
    .where(
      and(
        eq(jobCostEntries.id, entryId),
        eq(jobCostEntries.orgId, orgId),
        eq(jobCostEntries.projectId, projectId),
      ),
    )
    .get();
  if (!row) throw notFound("Cost");
  return row;
}

export async function updateEntry(
  ctx: AppContext,
  orgId: string,
  projectId: string,
  entryId: string,
  patch: z.infer<typeof updateJobCostEntrySchema>,
): Promise<JobCostEntryDto> {
  await getEntry(ctx, orgId, projectId, entryId);
  if (patch.sovLineId) checkLine(await projectLineIds(ctx, orgId, projectId), patch.sovLineId);
  if (patch.commitmentId) {
    checkCommitment(await projectCommitmentIds(ctx, orgId, projectId), patch.commitmentId);
  }
  const set: Partial<typeof jobCostEntries.$inferInsert> = {};
  if (patch.sovLineId !== undefined) set.sovLineId = patch.sovLineId;
  if (patch.incurredOn !== undefined) set.incurredOn = patch.incurredOn;
  if (patch.category !== undefined) set.category = patch.category;
  if (patch.amountCents !== undefined) set.amountCents = patch.amountCents;
  if (patch.vendor !== undefined) set.vendor = blank(patch.vendor);
  if (patch.description !== undefined) set.description = blank(patch.description);
  if (patch.reference !== undefined) set.reference = blank(patch.reference);
  if (patch.commitmentId !== undefined) set.commitmentId = patch.commitmentId ?? null;
  if (Object.keys(set).length > 0) {
    await ctx.db
      .update(jobCostEntries)
      .set(set)
      .where(and(eq(jobCostEntries.id, entryId), eq(jobCostEntries.orgId, orgId)));
  }
  return entryDto(await getEntry(ctx, orgId, projectId, entryId));
}

export async function deleteEntry(
  ctx: AppContext,
  orgId: string,
  projectId: string,
  entryId: string,
) {
  await getEntry(ctx, orgId, projectId, entryId);
  await ctx.db
    .delete(jobCostEntries)
    .where(and(eq(jobCostEntries.id, entryId), eq(jobCostEntries.orgId, orgId)));
}

async function projectCommitmentIds(ctx: AppContext, orgId: string, projectId: string) {
  const rows = await ctx.db
    .select({ id: jobCostCommitments.id })
    .from(jobCostCommitments)
    .where(and(eq(jobCostCommitments.orgId, orgId), eq(jobCostCommitments.projectId, projectId)));
  return new Set(rows.map((r) => r.id));
}

function checkCommitment(ids: Set<string>, commitmentId: string | null | undefined) {
  if (commitmentId && !ids.has(commitmentId)) {
    throw badRequest("That purchase order or subcontract is not on this job");
  }
}

async function getCommitment(
  ctx: AppContext,
  orgId: string,
  projectId: string,
  commitmentId: string,
) {
  const row = await ctx.db
    .select()
    .from(jobCostCommitments)
    .where(
      and(
        eq(jobCostCommitments.id, commitmentId),
        eq(jobCostCommitments.orgId, orgId),
        eq(jobCostCommitments.projectId, projectId),
      ),
    )
    .get();
  if (!row) throw notFound("Commitment");
  return row;
}

export async function addCommitment(
  ctx: AppContext,
  tenant: Tenant,
  projectId: string,
  input: z.infer<typeof jobCostCommitmentSchema>,
): Promise<{ id: string }> {
  const { orgId, userId } = tenant;
  checkLine(await projectLineIds(ctx, orgId, projectId), input.sovLineId);
  const existing = await ctx.db
    .select({ n: count() })
    .from(jobCostCommitments)
    .where(and(eq(jobCostCommitments.orgId, orgId), eq(jobCostCommitments.projectId, projectId)))
    .get();
  if ((existing?.n ?? 0) >= MAX_COMMITMENTS_PER_JOB) {
    throw badRequest(
      `A job keeps up to ${MAX_COMMITMENTS_PER_JOB.toLocaleString("en-US")} purchase orders and subcontracts.`,
    );
  }
  const id = newId("jcc");
  await ctx.db.insert(jobCostCommitments).values({
    id,
    orgId,
    projectId,
    sovLineId: input.sovLineId,
    kind: input.kind,
    category: input.category,
    vendor: input.vendor,
    reference: blank(input.reference),
    description: blank(input.description),
    committedOn: input.committedOn,
    amountCents: input.amountCents,
    createdBy: userId,
  });
  return { id };
}

export async function updateCommitment(
  ctx: AppContext,
  orgId: string,
  projectId: string,
  commitmentId: string,
  patch: z.infer<typeof updateJobCostCommitmentSchema>,
) {
  await getCommitment(ctx, orgId, projectId, commitmentId);
  if (patch.sovLineId) checkLine(await projectLineIds(ctx, orgId, projectId), patch.sovLineId);
  const set: Partial<typeof jobCostCommitments.$inferInsert> = {};
  if (patch.sovLineId !== undefined) set.sovLineId = patch.sovLineId;
  if (patch.kind !== undefined) set.kind = patch.kind;
  if (patch.category !== undefined) set.category = patch.category;
  if (patch.vendor !== undefined) set.vendor = patch.vendor;
  if (patch.reference !== undefined) set.reference = blank(patch.reference);
  if (patch.description !== undefined) set.description = blank(patch.description);
  if (patch.committedOn !== undefined) set.committedOn = patch.committedOn;
  if (patch.amountCents !== undefined) set.amountCents = patch.amountCents;
  if (Object.keys(set).length > 0) {
    set.updatedAt = ctx.now();
    await ctx.db
      .update(jobCostCommitments)
      .set(set)
      .where(and(eq(jobCostCommitments.id, commitmentId), eq(jobCostCommitments.orgId, orgId)));
  }
}

/** Deletes a commitment; the costs entered against it stay, against none. */
export async function deleteCommitment(
  ctx: AppContext,
  orgId: string,
  projectId: string,
  commitmentId: string,
) {
  await getCommitment(ctx, orgId, projectId, commitmentId);
  await ctx.db.batch([
    ctx.db
      .update(jobCostEntries)
      .set({ commitmentId: null })
      .where(and(eq(jobCostEntries.orgId, orgId), eq(jobCostEntries.commitmentId, commitmentId))),
    ctx.db
      .delete(jobCostCommitments)
      .where(and(eq(jobCostCommitments.id, commitmentId), eq(jobCostCommitments.orgId, orgId))),
  ]);
}

/** Active jobs, sample job left out: one row each, and totals of the jobs whose estimate is complete. */
export async function wipReport(ctx: AppContext, orgId: string): Promise<WipReportDto> {
  const [jobs, { plan }] = await Promise.all([
    ctx.db
      .select({ id: projects.id, isSample: projects.isSample })
      .from(projects)
      .where(and(eq(projects.orgId, orgId), eq(projects.status, "active")))
      .orderBy(asc(projects.name)),
    orgPlan(ctx, orgId),
  ]);
  const rows: WipRowDto[] = [];
  for (const j of jobs) {
    if (j.isSample) continue;
    const b = await loadBundle(ctx, orgId, j.id);
    const { budgets, entries, commitments } = await loadInputs(ctx, orgId, b);
    const { report, billedThrough } = reportOf(ctx, b, budgets, entries, commitments);
    rows.push({
      projectId: j.id,
      projectName: b.project.name,
      projectNumber: b.project.number,
      gcName: b.project.gcName,
      billedThrough: billedThrough
        ? { number: billedThrough.number, periodTo: billedThrough.periodTo }
        : null,
      totals: report.totals,
      missingBudgets: report.missingBudgetLineIds.length,
      overBudgetLines: report.lines.filter((l) => l.overBudget).length,
    });
  }
  const totals = {
    contractCents: 0,
    billedToDateCents: 0,
    costToDateCents: 0,
    earnedRevenueCents: 0,
    overBilledCents: 0,
    underBilledCents: 0,
    projectedGrossProfitCents: 0,
  };
  let incomplete = 0;
  for (const r of rows) {
    const t = r.totals;
    if (t.earnedRevenueCents === null || t.overUnderBilledCents === null) {
      incomplete++;
      continue;
    }
    totals.contractCents += t.contractCents;
    totals.billedToDateCents += t.billedToDateCents;
    totals.costToDateCents += t.costToDateCents;
    totals.earnedRevenueCents += t.earnedRevenueCents;
    if (t.overUnderBilledCents > 0) totals.overBilledCents += t.overUnderBilledCents;
    else totals.underBilledCents += -t.overUnderBilledCents;
    totals.projectedGrossProfitCents += t.projectedGrossProfitCents ?? 0;
  }
  return {
    asOf: isoDay(ctx.now()),
    rows,
    totals,
    incompleteJobs: incomplete,
    canEdit: plan.jobCosting,
  };
}

const row = (cells: (string | number | null)[]) => cells.map(csvCell).join(",");
const amt = (cents: number | null) => (cents === null ? null : Number(centsToDecimal(cents)));
const pct = (bps: number | null) => (bps === null ? null : Number((bps / 100).toFixed(2)));

const NOTE =
  "Working schedule from PayApps (cost-to-cost percent complete; estimate at completion from each line's budget or the project manager's cost to complete, never less than cost to date plus open purchase orders and subcontracts). Not financial statements or accounting advice; review with your accountant.";

export function wipCsv(r: WipReportDto): string {
  const out = [
    row([
      "Job",
      "Job number",
      "GC",
      "Billed through application",
      "Period to",
      "Contract to date",
      "Estimated cost at completion",
      "Cost to date",
      "Cost to complete",
      "Percent complete",
      "Earned revenue",
      "Billed to date",
      "Over (+) / under (-) billed",
      "Gross profit to date",
      "Projected gross profit",
      "Projected margin %",
      "Lines with no budget",
    ]),
  ];
  for (const j of r.rows) {
    const t = j.totals;
    out.push(
      row([
        j.projectName,
        j.projectNumber,
        j.gcName,
        j.billedThrough?.number ?? null,
        j.billedThrough?.periodTo ?? null,
        amt(t.contractCents),
        amt(t.estimateAtCompletionCents),
        amt(t.costToDateCents),
        amt(t.costToCompleteCents),
        pct(t.percentCompleteBps),
        amt(t.earnedRevenueCents),
        amt(t.billedToDateCents),
        amt(t.overUnderBilledCents),
        amt(t.grossProfitToDateCents),
        amt(t.projectedGrossProfitCents),
        pct(t.projectedMarginBps),
        j.missingBudgets,
      ]),
    );
  }
  out.push("", row([NOTE]));
  return `${out.join("\r\n")}\r\n`;
}

export function jobCostCsv(d: JobCostDto): string {
  const { report } = d;
  const out = [
    row([
      "Item",
      "Description",
      "Scheduled value",
      "Billed to date",
      "Budget",
      "Cost to date",
      "Budget remaining",
      "Cost % of budget",
      "Billed %",
      `Cost after ${report.asOf ?? ""}`.trim(),
      "Cost to complete (typed)",
      "Cost to complete as of",
      "Committed",
      "Open commitments",
      "Estimated cost at completion",
      "Estimate vs budget",
    ]),
  ];
  for (const l of report.lines) {
    out.push(
      row([
        l.itemNumber,
        l.description,
        amt(l.scheduledValueCents),
        amt(l.billedToDateCents),
        amt(l.budgetCents),
        amt(l.costToDateCents),
        amt(l.budgetRemainingCents),
        pct(l.costPctOfBudgetBps),
        pct(l.billedPctBps),
        amt(l.costAfterCents),
        amt(l.costToCompleteCents),
        l.costToCompleteOn,
        amt(l.committedCents),
        amt(l.openCommittedCents),
        amt(l.estimateAtCompletionCents),
        amt(l.estimateVsBudgetCents),
      ]),
    );
  }
  const items = new Map(report.lines.map((l) => [l.sovLineId, l.itemNumber]));
  if (d.costTypes.splitLineCount > 0) {
    out.push(
      "",
      row(["Item", "Cost type", "Budget", "Cost to date", "Remaining", "Cost % of budget"]),
    );
    for (const l of d.costTypes.lines) {
      if (!l.split) continue;
      for (const r of l.rows) {
        out.push(
          row([
            l.itemNumber,
            COST_CATEGORY_LABELS[r.category],
            amt(r.budgetCents),
            amt(r.costToDateCents),
            amt(r.remainingCents),
            pct(r.costPctOfBudgetBps),
          ]),
        );
      }
      if (l.unsplitCents !== null) {
        out.push(row([l.itemNumber, "Not split (line budget changed since)", amt(l.unsplitCents)]));
      }
    }
  }
  if (d.commitments.length > 0) {
    out.push(
      "",
      row([
        "Commitment",
        "Number",
        "Vendor",
        "Line",
        "Category",
        "Committed on",
        "Committed",
        "Invoiced to date",
        "Open",
        "Description",
      ]),
    );
    for (const c of d.commitments) {
      out.push(
        row([
          COMMITMENT_KIND_LABELS[c.kind],
          c.reference,
          c.vendor,
          c.sovLineId ? (items.get(c.sovLineId) ?? null) : null,
          COST_CATEGORY_LABELS[c.category],
          c.committedOn,
          amt(c.amountCents),
          amt(c.invoicedCents),
          amt(c.openCents),
          c.description,
        ]),
      );
    }
  }
  const commitmentRef = new Map(
    d.commitments.map((c) => [c.id, c.reference ? `${c.vendor} ${c.reference}` : c.vendor]),
  );
  out.push(
    "",
    row([
      "Date",
      "Category",
      "Line",
      "Amount",
      "Vendor",
      "Description",
      "Reference",
      "Against commitment",
    ]),
  );
  for (const e of d.entries) {
    out.push(
      row([
        e.incurredOn,
        COST_CATEGORY_LABELS[e.category],
        e.sovLineId ? (items.get(e.sovLineId) ?? null) : null,
        amt(e.amountCents),
        e.vendor,
        e.description,
        e.reference,
        e.commitmentId ? (commitmentRef.get(e.commitmentId) ?? null) : null,
      ]),
    );
  }
  out.push("", row([NOTE]));
  return `${out.join("\r\n")}\r\n`;
}
