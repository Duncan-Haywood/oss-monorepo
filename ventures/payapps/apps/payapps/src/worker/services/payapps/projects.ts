// Projects (one subcontract each) and their schedule of values. Every query is scoped by orgId.
import type {
  OpeningInputBody,
  ProjectInput,
  procoreSsovSchema,
  updateProjectSchema,
  updateSovLineSchema,
} from "@shared/api/schemas";
import type { ProjectDto } from "@shared/api/types";
import { type ProcoreSsovPlacement, placementProblems } from "@shared/gc-export/procore-placement";
import { type UnitPricing, unitPricingProblem } from "@shared/unit-price";
import { and, desc, eq, max, ne } from "drizzle-orm";
import type { z } from "zod";
import type { AppContext } from "../../context";
import { changeOrderItems, payAppLines, payApps, projects, sovLines } from "../../db/schema";
import { badRequest, conflict, notFound } from "../../lib/errors";
import { newId } from "../../lib/ids";
import type { Tenant } from "../../types";
import { assertCanAddActiveJob } from "../billing";
import {
  billingStarted,
  getProjectRow,
  loadBundle,
  projectDto,
  retainageLockedLines,
} from "./bundle";

export async function listProjects(ctx: AppContext, orgId: string): Promise<ProjectDto[]> {
  const rows = await ctx.db
    .select()
    .from(projects)
    .where(eq(projects.orgId, orgId))
    .orderBy(desc(projects.createdAt));
  return rows.map(projectDto);
}

export async function createProject(ctx: AppContext, tenant: Tenant, input: ProjectInput) {
  await assertCanAddActiveJob(ctx, tenant.orgId);
  const id = newId("prj");
  await ctx.db.insert(projects).values({
    id,
    orgId: tenant.orgId,
    createdBy: tenant.userId,
    ...input,
  });
  return projectDto(await getProjectRow(ctx, tenant.orgId, id));
}

export async function updateProject(
  ctx: AppContext,
  orgId: string,
  projectId: string,
  patch: z.infer<typeof updateProjectSchema>,
) {
  const b = await loadBundle(ctx, orgId, projectId);
  if (
    patch.originalContractSumCents !== undefined &&
    patch.originalContractSumCents !== b.project.originalContractSumCents &&
    billingStarted(b)
  ) {
    throw conflict(
      "The contract sum is locked once a pay application is submitted; use a change order",
    );
  }
  // Reopening a closed job counts against the plan's active-job limit.
  if (patch.status === "active" && b.project.status !== "active" && !b.project.isSample) {
    await assertCanAddActiveJob(ctx, orgId);
  }
  await ctx.db
    .update(projects)
    .set(patch)
    .where(and(eq(projects.id, projectId), eq(projects.orgId, orgId)));
  return projectDto(await getProjectRow(ctx, orgId, projectId));
}

/**
 * Saves (or, with null, clears) where the job's base-contract lines sit under the GC's Procore SOV
 * positions, for the Procore invoice sheet (src/shared/gc-export/procore-placement.ts).
 */
export async function setProcoreSsov(
  ctx: AppContext,
  orgId: string,
  projectId: string,
  input: z.infer<typeof procoreSsovSchema> | null,
) {
  const b = await loadBundle(ctx, orgId, projectId);
  let json: string | null = null;
  if (input) {
    const base = new Set(b.sov.filter((l) => l.changeOrderId === null).map((l) => l.id));
    const problems = placementProblems(input, base);
    if (problems.length) throw badRequest(problems.slice(0, 5).join(" "));
    const placement: ProcoreSsovPlacement = {
      positions: input.positions,
      placed: input.placed,
      savedOn: new Date().toISOString().slice(0, 10),
    };
    json = JSON.stringify(placement);
  }
  await ctx.db
    .update(projects)
    .set({ procoreSsov: json })
    .where(and(eq(projects.id, projectId), eq(projects.orgId, orgId)));
}

export async function deleteProject(ctx: AppContext, orgId: string, projectId: string) {
  await getProjectRow(ctx, orgId, projectId);
  await ctx.db.delete(projects).where(and(eq(projects.id, projectId), eq(projects.orgId, orgId)));
}

async function nextSortOrder(ctx: AppContext, orgId: string, projectId: string) {
  const row = await ctx.db
    .select({ m: max(sovLines.sortOrder) })
    .from(sovLines)
    .where(and(eq(sovLines.orgId, orgId), eq(sovLines.projectId, projectId)))
    .get();
  return (row?.m ?? 0) + 1;
}

export async function addSovLines(
  ctx: AppContext,
  orgId: string,
  projectId: string,
  lines: {
    itemNumber: string;
    description: string;
    originalCents: number;
    unit?: string | null;
    unitPriceMicros?: number | null;
    quantityMilli?: number | null;
  }[],
) {
  for (const l of lines) {
    const problem = unitPricingProblem(pricingOf(l), {
      originalCents: l.originalCents,
      isChangeOrderLine: false,
    });
    if (problem) throw badRequest(`Line ${l.itemNumber}: ${problem}`);
  }
  const b = await loadBundle(ctx, orgId, projectId);
  if (billingStarted(b) && lines.some((l) => l.originalCents !== 0)) {
    throw conflict(
      "The original schedule of values is locked once a pay application is submitted; add the work with a change order",
    );
  }
  let order = await nextSortOrder(ctx, orgId, projectId);
  const rows = lines.map((l) => ({
    id: newId("sov"),
    orgId,
    projectId,
    sortOrder: order++,
    itemNumber: l.itemNumber,
    description: l.description,
    originalCents: l.originalCents,
    ...pricingOf(l),
  }));
  await ctx.db.insert(sovLines).values(rows);
  return rows.map((r) => r.id);
}

async function getSovLine(ctx: AppContext, orgId: string, projectId: string, lineId: string) {
  const row = await ctx.db
    .select()
    .from(sovLines)
    .where(
      and(eq(sovLines.id, lineId), eq(sovLines.orgId, orgId), eq(sovLines.projectId, projectId)),
    )
    .get();
  if (!row) throw notFound("Schedule of values line");
  return row;
}

export async function updateSovLine(
  ctx: AppContext,
  orgId: string,
  projectId: string,
  lineId: string,
  patch: z.infer<typeof updateSovLineSchema>,
) {
  const line = await getSovLine(ctx, orgId, projectId, lineId);
  if (patch.originalCents !== undefined && patch.originalCents !== line.originalCents) {
    if (line.changeOrderId) throw badRequest("This line's value comes from its change order");
    if (billingStarted(await loadBundle(ctx, orgId, projectId))) {
      throw conflict(
        "The original schedule of values is locked once a pay application is submitted; use a change order",
      );
    }
  }
  const pricing: UnitPricing = {
    unit: patch.unit !== undefined ? (patch.unit ?? null) : line.unit,
    unitPriceMicros:
      patch.unitPriceMicros !== undefined ? (patch.unitPriceMicros ?? null) : line.unitPriceMicros,
    quantityMilli:
      patch.quantityMilli !== undefined ? (patch.quantityMilli ?? null) : line.quantityMilli,
  };
  if (
    (line.unitPriceMicros !== null && pricing.unitPriceMicros !== line.unitPriceMicros) ||
    pricing.quantityMilli !== line.quantityMilli
  ) {
    // A first unit price on a line already billed in dollars is fine (its earlier work is read back
    // at the price, labelled approximate); changing or removing one would reprice billed quantities.
    if (billingStarted(await loadBundle(ctx, orgId, projectId))) {
      throw conflict(
        "The unit price and contract quantity are locked once a pay application is submitted; use a change order",
      );
    }
  }
  const problem = unitPricingProblem(pricing, {
    originalCents: patch.originalCents ?? line.originalCents,
    isChangeOrderLine: line.changeOrderId !== null,
  });
  if (problem) throw badRequest(problem);
  if (
    patch.retainagePctBps !== undefined &&
    patch.retainagePctBps !== line.retainagePctBps &&
    retainageLockedLines(await loadBundle(ctx, orgId, projectId)).has(lineId)
  ) {
    throw conflict(
      "This line's retainage rate is locked: a submitted pay application already holds retainage on it",
    );
  }
  const { unit: _u, unitPriceMicros: _p, quantityMilli: _q, ...rest } = patch;
  await ctx.db
    .update(sovLines)
    .set({ ...rest, ...pricing })
    .where(and(eq(sovLines.id, lineId), eq(sovLines.orgId, orgId)));
}

/** The stored pricing of a line from a request (absent fields are a lump-sum line's nulls). */
function pricingOf(l: {
  unit?: string | null;
  unitPriceMicros?: number | null;
  quantityMilli?: number | null;
}): UnitPricing {
  return {
    unit: l.unit?.trim() || null,
    unitPriceMicros: l.unitPriceMicros ?? null,
    quantityMilli: l.quantityMilli ?? null,
  };
}

export async function deleteSovLine(
  ctx: AppContext,
  orgId: string,
  projectId: string,
  lineId: string,
) {
  await getSovLine(ctx, orgId, projectId, lineId);
  const [billed, coRef] = await Promise.all([
    // Entries on a draft pay app go with the line (ON DELETE CASCADE); submitted history may not.
    ctx.db
      .select({ id: payAppLines.id })
      .from(payAppLines)
      .innerJoin(payApps, eq(payApps.id, payAppLines.payAppId))
      .where(
        and(
          eq(payAppLines.orgId, orgId),
          eq(payAppLines.sovLineId, lineId),
          ne(payApps.status, "draft"),
        ),
      )
      .get(),
    ctx.db
      .select({ id: changeOrderItems.id })
      .from(changeOrderItems)
      .where(and(eq(changeOrderItems.orgId, orgId), eq(changeOrderItems.sovLineId, lineId)))
      .get(),
  ]);
  if (billed) throw conflict("This line has been billed on a pay application");
  if (coRef) throw conflict("A change order adjusts this line");
  await ctx.db.delete(sovLines).where(and(eq(sovLines.id, lineId), eq(sovLines.orgId, orgId)));
}

/**
 * Mid-job start: records the last pay application made before the job moved here, so the first
 * application here continues its numbering, carries its work to date into column D and its line 6
 * into line 7. Only before the first application here exists (a draft would need renumbering).
 */
export async function setOpening(
  ctx: AppContext,
  orgId: string,
  projectId: string,
  input: OpeningInputBody | null,
) {
  const b = await loadBundle(ctx, orgId, projectId);
  if (b.payApps.length > 0) {
    throw conflict(
      "The opening balance can only change before the first pay application here; delete the draft first",
    );
  }
  const known = new Set(b.sov.map((l) => l.id));
  const completed = new Map<string, number>();
  const released = new Map<string, number>();
  for (const l of input?.lines ?? []) {
    if (!known.has(l.sovLineId)) throw badRequest("Unknown schedule of values line");
    if (completed.has(l.sovLineId)) throw badRequest("Each line may appear once");
    completed.set(l.sovLineId, l.completedCents);
    if (l.releasedCents) {
      // Retainage is held on work, so none can have been released on a line with no work.
      if (l.completedCents === 0) {
        throw badRequest("Retainage released before the move needs work completed on that line");
      }
      released.set(l.sovLineId, l.releasedCents);
    }
  }
  if (input && b.project.contractDate && input.periodTo < b.project.contractDate) {
    throw badRequest("The opening application cannot end before the contract date");
  }
  const lineUpdates = b.sov
    .filter(
      (l) =>
        l.openingCompletedCents !== (completed.get(l.id) ?? 0) ||
        l.openingReleasedCents !== (released.get(l.id) ?? 0),
    )
    .map((l) =>
      ctx.db
        .update(sovLines)
        .set({
          openingCompletedCents: completed.get(l.id) ?? 0,
          openingReleasedCents: released.get(l.id) ?? 0,
        })
        .where(and(eq(sovLines.id, l.id), eq(sovLines.orgId, orgId))),
    );
  await ctx.db.batch([
    ctx.db
      .update(projects)
      .set({
        openingAppNumber: input?.appNumber ?? null,
        openingPeriodTo: input?.periodTo ?? null,
        openingPreviousCertificatesCents: input?.previousCertificatesCents ?? null,
        openingRetainageHeldCents: input?.retainageHeldCents ?? null,
      })
      .where(and(eq(projects.id, projectId), eq(projects.orgId, orgId))),
    ...lineUpdates,
  ]);
}
