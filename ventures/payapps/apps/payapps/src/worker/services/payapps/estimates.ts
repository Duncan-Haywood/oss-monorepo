// Estimates (bids) and the job a won one becomes. The math is src/shared/estimate.ts; this file loads,
// saves and converts. Every query filters by orgId. Winning creates the job through the same
// createProject/addSovLines/setBudgets paths a person would use, so plan limits (active jobs, job
// costing) and the SOV checks apply unchanged.
import type {
  EstimateInputBody,
  EstimateLinesBody,
  EstimateUpdateBody,
  WinEstimateBody,
} from "@shared/api/schemas";
import type {
  EstimateDetailDto,
  EstimateLineDto,
  EstimateListDto,
  EstimateSummaryDto,
  ProjectDto,
} from "@shared/api/types";
import {
  type Alternates,
  alternatesFor,
  bidItemKey,
  computeEstimate,
  type EstimateLineInput,
  type EstimateRates,
  estimateLabel,
  jobFromEstimate,
  lineProblems,
  winProblems,
} from "@shared/estimate";
import { and, asc, desc, eq, inArray, max, ne } from "drizzle-orm";
import type { AppContext } from "../../context";
import { estimateAlternates, estimateLines, estimates, organization } from "../../db/schema";
import { badRequest, conflict, notFound } from "../../lib/errors";
import { newId } from "../../lib/ids";
import type { Tenant } from "../../types";
import { orgPlan } from "../billing";
import { setBudgets, setCostTypeBudgets } from "./job-cost";
import { addSovLines, createProject } from "./projects";

type EstimateRow = typeof estimates.$inferSelect;
type LineRow = typeof estimateLines.$inferSelect;
type AlternateRow = typeof estimateAlternates.$inferSelect;

const today = (ctx: AppContext) => ctx.now().toISOString().slice(0, 10);

export const ratesOf = (r: EstimateRow): EstimateRates => ({
  markupBps: {
    labor: r.laborMarkupBps,
    material: r.materialMarkupBps,
    equipment: r.equipmentMarkupBps,
    subcontract: r.subcontractMarkupBps,
    other: r.otherMarkupBps,
  },
  materialTaxBps: r.materialTaxBps,
});

const lineInput = (l: LineRow): EstimateLineInput => ({
  bidItem: l.bidItem,
  category: l.category,
  description: l.description,
  quantityMilli: l.quantityMilli,
  unit: l.unit,
  unitCostMicros: l.unitCostMicros,
});

const alternatesMap = (rows: AlternateRow[]): Alternates =>
  Object.fromEntries(rows.map((a) => [a.bidItemKey, a.kind]));

function summary(row: EstimateRow, lines: LineRow[], alts: AlternateRow[]): EstimateSummaryDto {
  const result = computeEstimate(lines.map(lineInput), ratesOf(row), alternatesMap(alts));
  const rates = ratesOf(row);
  return {
    id: row.id,
    number: row.number,
    label: estimateLabel(row.number),
    name: row.name,
    gcName: row.gcName,
    gcContactName: row.gcContactName,
    gcContactEmail: row.gcContactEmail,
    location: row.location,
    bidDueOn: row.bidDueOn,
    sentOn: row.sentOn,
    decidedOn: row.decidedOn,
    status: row.status,
    validDays: row.validDays,
    markupBps: rates.markupBps,
    materialTaxBps: rates.materialTaxBps,
    inclusions: row.inclusions,
    exclusions: row.exclusions,
    notes: row.notes,
    projectId: row.projectId,
    totals: result.totals,
    bidItemCount: result.bidItems.length,
    lineCount: lines.length,
  };
}

async function getRow(ctx: AppContext, orgId: string, estimateId: string) {
  const row = await ctx.db
    .select()
    .from(estimates)
    .where(and(eq(estimates.id, estimateId), eq(estimates.orgId, orgId)))
    .get();
  if (!row) throw notFound("Estimate");
  return row;
}

async function linesOf(ctx: AppContext, orgId: string, estimateId: string) {
  return ctx.db
    .select()
    .from(estimateLines)
    .where(and(eq(estimateLines.orgId, orgId), eq(estimateLines.estimateId, estimateId)))
    .orderBy(asc(estimateLines.sortOrder));
}

async function alternateRowsOf(ctx: AppContext, orgId: string, estimateId: string) {
  return ctx.db
    .select()
    .from(estimateAlternates)
    .where(and(eq(estimateAlternates.orgId, orgId), eq(estimateAlternates.estimateId, estimateId)));
}

export async function listEstimates(ctx: AppContext, orgId: string): Promise<EstimateListDto> {
  const [rows, lines, alts] = await Promise.all([
    ctx.db
      .select()
      .from(estimates)
      .where(eq(estimates.orgId, orgId))
      .orderBy(desc(estimates.number)),
    ctx.db
      .select()
      .from(estimateLines)
      .where(eq(estimateLines.orgId, orgId))
      .orderBy(asc(estimateLines.sortOrder)),
    ctx.db.select().from(estimateAlternates).where(eq(estimateAlternates.orgId, orgId)),
  ]);
  const byEstimate = new Map<string, LineRow[]>();
  for (const l of lines) {
    const list = byEstimate.get(l.estimateId) ?? [];
    list.push(l);
    byEstimate.set(l.estimateId, list);
  }
  const altsBy = new Map<string, AlternateRow[]>();
  for (const a of alts) {
    const list = altsBy.get(a.estimateId) ?? [];
    list.push(a);
    altsBy.set(a.estimateId, list);
  }
  const items = rows.map((r) => summary(r, byEstimate.get(r.id) ?? [], altsBy.get(r.id) ?? []));
  const open = items.filter((e) => e.status === "draft" || e.status === "sent");
  return {
    items,
    pipeline: {
      openCount: open.length,
      openPriceCents: open.reduce((s, e) => s + e.totals.priceCents, 0),
      wonCount: items.filter((e) => e.status === "won").length,
      lostCount: items.filter((e) => e.status === "lost").length,
    },
    nextNumber: (rows.reduce((m, r) => Math.max(m, r.number), 0) || 0) + 1,
  };
}

export async function getEstimate(
  ctx: AppContext,
  orgId: string,
  estimateId: string,
): Promise<EstimateDetailDto> {
  const [row, lines, alts, { plan }] = await Promise.all([
    getRow(ctx, orgId, estimateId),
    linesOf(ctx, orgId, estimateId),
    alternateRowsOf(ctx, orgId, estimateId),
    orgPlan(ctx, orgId),
  ]);
  const alternates = alternatesMap(alts);
  const result = computeEstimate(lines.map(lineInput), ratesOf(row), alternates);
  const lineDtos: EstimateLineDto[] = lines.map((l, i) => ({
    id: l.id,
    bidItem: l.bidItem,
    category: l.category,
    description: l.description,
    quantityMilli: l.quantityMilli,
    unit: l.unit,
    unitCostMicros: l.unitCostMicros,
    costCents: result.lineCostCents[i] ?? 0,
  }));
  return {
    ...summary(row, lines, alts),
    lines: lineDtos,
    bidItems: result.bidItems,
    winProblems: row.status === "won" ? [] : winProblems(result),
    budgetsOnWin: plan.jobCosting,
    alternates,
    acceptedAlternates: alts.filter((a) => a.accepted).map((a) => a.bidItemKey),
  };
}

const nullIfBlank = (v: string | null | undefined) => (v == null || v === "" ? null : v);

function headerValues(input: EstimateInputBody | EstimateUpdateBody) {
  const out: Partial<typeof estimates.$inferInsert> = {};
  if (input.name !== undefined) out.name = input.name;
  if (input.gcName !== undefined) out.gcName = input.gcName;
  if (input.gcContactName !== undefined) out.gcContactName = nullIfBlank(input.gcContactName);
  if (input.gcContactEmail !== undefined) out.gcContactEmail = nullIfBlank(input.gcContactEmail);
  if (input.location !== undefined) out.location = nullIfBlank(input.location);
  if (input.bidDueOn !== undefined) out.bidDueOn = input.bidDueOn ?? null;
  if (input.sentOn !== undefined) out.sentOn = input.sentOn ?? null;
  if (input.validDays !== undefined) out.validDays = input.validDays;
  if (input.laborMarkupBps !== undefined) out.laborMarkupBps = input.laborMarkupBps;
  if (input.materialMarkupBps !== undefined) out.materialMarkupBps = input.materialMarkupBps;
  if (input.equipmentMarkupBps !== undefined) out.equipmentMarkupBps = input.equipmentMarkupBps;
  if (input.subcontractMarkupBps !== undefined)
    out.subcontractMarkupBps = input.subcontractMarkupBps;
  if (input.otherMarkupBps !== undefined) out.otherMarkupBps = input.otherMarkupBps;
  if (input.materialTaxBps !== undefined) out.materialTaxBps = input.materialTaxBps;
  if (input.inclusions !== undefined) out.inclusions = nullIfBlank(input.inclusions);
  if (input.exclusions !== undefined) out.exclusions = nullIfBlank(input.exclusions);
  if (input.notes !== undefined) out.notes = nullIfBlank(input.notes);
  return out;
}

export async function createEstimate(
  ctx: AppContext,
  tenant: Tenant,
  input: EstimateInputBody,
): Promise<EstimateDetailDto> {
  const id = newId("est");
  const top = await ctx.db
    .select({ m: max(estimates.number) })
    .from(estimates)
    .where(eq(estimates.orgId, tenant.orgId))
    .get();
  await ctx.db.insert(estimates).values({
    validDays: 30,
    ...headerValues(input),
    id,
    orgId: tenant.orgId,
    number: (top?.m ?? 0) + 1,
    name: input.name,
    gcName: input.gcName,
    status: input.sentOn ? "sent" : "draft",
    createdBy: tenant.userId,
  });
  return getEstimate(ctx, tenant.orgId, id);
}

export async function updateEstimate(
  ctx: AppContext,
  orgId: string,
  estimateId: string,
  input: EstimateUpdateBody,
): Promise<EstimateDetailDto> {
  const row = await getRow(ctx, orgId, estimateId);
  if (row.status === "won") {
    // The job now holds the contract; a won bid is a record of what was proposed.
    throw conflict("A won estimate is the record of what was bid; change the job instead");
  }
  const values = headerValues(input);
  if (input.status !== undefined) {
    values.status = input.status;
    if (input.status === "lost") values.decidedOn = input.decidedOn ?? today(ctx);
    else values.decidedOn = null;
    if (input.status === "sent" && !row.sentOn && input.sentOn === undefined)
      values.sentOn = today(ctx);
  } else if (input.sentOn && row.status === "draft") {
    values.status = "sent";
  }
  if (Object.keys(values).length > 0) {
    await ctx.db
      .update(estimates)
      .set(values)
      .where(and(eq(estimates.id, estimateId), eq(estimates.orgId, orgId)));
  }
  return getEstimate(ctx, orgId, estimateId);
}

export async function setEstimateLines(
  ctx: AppContext,
  orgId: string,
  estimateId: string,
  input: EstimateLinesBody,
): Promise<EstimateDetailDto> {
  const row = await getRow(ctx, orgId, estimateId);
  if (row.status === "won") throw conflict("A won estimate's lines are locked; change the job");
  const lines: EstimateLineInput[] = input.lines.map((l) => ({
    bidItem: l.bidItem.trim().replace(/\s+/g, " "),
    category: l.category,
    description: l.description,
    quantityMilli: l.quantityMilli,
    unit: nullIfBlank(l.unit?.trim()),
    unitCostMicros: l.unitCostMicros,
  }));
  const problems = lineProblems(lines);
  if (problems.length) throw badRequest(problems.slice(0, 5).join(" "));
  // The alternates sent (or, left out, the saved ones), kept only where they name an item.
  let asked: Alternates;
  if (input.alternates) {
    asked = {};
    for (const a of input.alternates) asked[bidItemKey(a.bidItem)] = a.kind;
  } else {
    asked = alternatesMap(await alternateRowsOf(ctx, orgId, estimateId));
  }
  const alternates = alternatesFor(lines, asked);
  const statements = [
    ctx.db
      .delete(estimateLines)
      .where(and(eq(estimateLines.orgId, orgId), eq(estimateLines.estimateId, estimateId))),
    ...chunk(
      lines.map((l, i) => ({ id: newId("esl"), orgId, estimateId, sortOrder: i + 1, ...l })),
      // D1 caps bound parameters per statement (100); each row binds 10.
      9,
    ).map((rows) => ctx.db.insert(estimateLines).values(rows)),
    ctx.db
      .delete(estimateAlternates)
      .where(
        and(eq(estimateAlternates.orgId, orgId), eq(estimateAlternates.estimateId, estimateId)),
      ),
    ...chunk(
      Object.entries(alternates).map(([bidItemKey, kind]) => ({
        id: newId("esa"),
        orgId,
        estimateId,
        bidItemKey,
        kind,
        accepted: false,
      })),
      // Six bound parameters a row.
      16,
    ).map((rows) => ctx.db.insert(estimateAlternates).values(rows)),
    // Touch the estimate so its updated time moves with its lines.
    ctx.db
      .update(estimates)
      .set({ updatedAt: ctx.now() })
      .where(and(eq(estimates.id, estimateId), eq(estimates.orgId, orgId))),
  ];
  // biome-ignore lint/suspicious/noExplicitAny: drizzle's batch tuple type is not exported
  await ctx.db.batch(statements as any);
  return getEstimate(ctx, orgId, estimateId);
}

function chunk<T>(xs: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
  return out;
}

export async function deleteEstimate(ctx: AppContext, orgId: string, estimateId: string) {
  await getRow(ctx, orgId, estimateId);
  await ctx.db
    .delete(estimates)
    .where(and(eq(estimates.id, estimateId), eq(estimates.orgId, orgId)));
}

export interface WinResult {
  estimate: EstimateDetailDto;
  project: ProjectDto;
  /** False when the plan has no job costing: the budgets were not set (the job's SOV was). */
  budgetsSet: boolean;
}

/**
 * Marks the estimate won and creates its job: the GC, location and contract sum from the estimate,
 * one schedule-of-values line per bid item in the job (the base bid with the accepted alternates) at
 * its price, and (on plans with job costing) each line's cost budget at the item's cost with tax,
 * split by cost type as it was bid.
 */
export async function winEstimate(
  ctx: AppContext,
  tenant: Tenant,
  estimateId: string,
  input: WinEstimateBody,
): Promise<WinResult> {
  const { orgId } = tenant;
  const row = await getRow(ctx, orgId, estimateId);
  if (row.status === "won") throw conflict("This estimate is already won");
  const [lines, alts] = await Promise.all([
    linesOf(ctx, orgId, estimateId),
    alternateRowsOf(ctx, orgId, estimateId),
  ]);
  const result = computeEstimate(lines.map(lineInput), ratesOf(row), alternatesMap(alts));
  const accepted = [...new Set((input.acceptedAlternates ?? []).map(bidItemKey))];
  const problems = winProblems(result, accepted);
  if (problems.length) throw badRequest(problems.slice(0, 5).join(" "));
  const job = jobFromEstimate(result, accepted);

  // Claim the win first so two clicks cannot make two jobs.
  const claimed = await ctx.db
    .update(estimates)
    .set({ status: "won", decidedOn: input.decidedOn ?? today(ctx) })
    .where(
      and(eq(estimates.id, estimateId), eq(estimates.orgId, orgId), ne(estimates.status, "won")),
    )
    .returning({ id: estimates.id });
  if (claimed.length === 0) throw conflict("This estimate is already won");

  let project: ProjectDto;
  try {
    project = await createProject(ctx, tenant, {
      name: row.name,
      number: nullIfBlank(input.number),
      location: row.location,
      gcName: row.gcName,
      gcPmName: row.gcContactName,
      gcPmEmail: row.gcContactEmail,
      contractDate: input.contractDate ?? null,
      originalContractSumCents: job.contractSumCents,
      retainagePctBps: input.retainagePctBps ?? 1000,
      storedRetainagePctBps: input.storedRetainagePctBps ?? input.retainagePctBps ?? 1000,
    });
  } catch (e) {
    // The job could not be made (the plan's active-job limit, say): the estimate is not won.
    await ctx.db
      .update(estimates)
      .set({ status: row.status, decidedOn: row.decidedOn })
      .where(and(eq(estimates.id, estimateId), eq(estimates.orgId, orgId)));
    throw e;
  }
  // Linked now, so the job is found from the estimate even if a later step fails.
  await ctx.db
    .update(estimates)
    .set({ projectId: project.id })
    .where(and(eq(estimates.id, estimateId), eq(estimates.orgId, orgId)));
  // The record of which alternates the GC took (the lines are locked from here on); D1 binds at
  // most 100 parameters a statement, so the keys go in chunks.
  for (const keys of chunk(accepted, 90)) {
    await ctx.db
      .update(estimateAlternates)
      .set({ accepted: true })
      .where(
        and(
          eq(estimateAlternates.orgId, orgId),
          eq(estimateAlternates.estimateId, estimateId),
          inArray(estimateAlternates.bidItemKey, keys),
        ),
      );
  }
  const ids = await addSovLines(
    ctx,
    orgId,
    project.id,
    job.lines.map((l) => ({
      itemNumber: l.itemNumber,
      description: l.description,
      originalCents: l.originalCents,
    })),
  );
  const { plan } = await orgPlan(ctx, orgId);
  let budgetsSet = false;
  if (plan.jobCosting && ids.length > 0) {
    await setBudgets(ctx, tenant, project.id, {
      lines: ids.map((sovLineId, i) => ({
        sovLineId,
        budgetCents: job.lines[i]?.budgetCents ?? 0,
      })),
    });
    // Each line's budget split by cost type as it was bid (labor, material with its tax, ...); the
    // split sums to the budget just set, so the budget does not move.
    await setCostTypeBudgets(ctx, tenant, project.id, {
      lines: ids.map((sovLineId, i) => ({
        sovLineId,
        split: job.lines[i]?.budgetByCategory ?? null,
      })),
    });
    budgetsSet = true;
  }
  return { estimate: await getEstimate(ctx, orgId, estimateId), project, budgetsSet };
}

/** What the proposal PDF prints. */
export interface EstimateDocument {
  contractor: { name: string };
  estimate: EstimateDetailDto;
  /** The proposal's date: the day it was sent, else today. */
  dated: string;
}

export async function loadEstimateDocument(
  ctx: AppContext,
  orgId: string,
  estimateId: string,
): Promise<EstimateDocument> {
  const [estimate, org] = await Promise.all([
    getEstimate(ctx, orgId, estimateId),
    ctx.db
      .select({ name: organization.name })
      .from(organization)
      .where(eq(organization.id, orgId))
      .get(),
  ]);
  if (!org) throw notFound("Organization");
  return { contractor: { name: org.name }, estimate, dated: estimate.sentOn ?? today(ctx) };
}
