// Subcontractors and suppliers (DFARS 252.204-7021(d)(4), (f)). Rows are tenant-scoped; every write is
// audited. Currency, level and flow-down checks are pure, in @shared/suppliers.
import {
  checkSuppliers,
  type InfoFlowed,
  MAX_SUPPLIERS_PER_ORG,
  type SupplierDueDate,
  type SupplierLevel,
  type SupplierStatus,
  supplierAttention,
  supplierCurrency,
  supplierDueDates,
  supplierIssues,
  validateSupplier,
} from "@shared/suppliers";
import { and, asc, count, eq } from "drizzle-orm";
import type { AppContext } from "../../context";
import { supplier } from "../../db/schema";
import { badRequest, conflict, notFound } from "../../lib/errors";
import { newId } from "../../lib/ids";
import { audit } from "../audit";
import { assertLevel2Plan } from "../billing";

export type SupplierRow = typeof supplier.$inferSelect;

export interface SupplierInput {
  name: string;
  supplies?: string;
  infoFlowed: InfoFlowed;
  cots?: boolean;
  requiredLevel?: SupplierLevel | null;
  status?: SupplierStatus | null;
  statusDate?: string | null;
  affirmedOn?: string | null;
  cmmcUids?: string;
  clauseFlowedDown?: boolean;
  subcontractRef?: string;
  checkedOn?: string | null;
  awardedOn?: string | null;
  evidenceRef?: string;
  notes?: string;
}

const today = (ctx: AppContext) => ctx.now().toISOString().slice(0, 10);

export async function listSuppliers(ctx: AppContext, orgId: string): Promise<SupplierRow[]> {
  return ctx.db
    .select()
    .from(supplier)
    .where(eq(supplier.orgId, orgId))
    .orderBy(asc(supplier.name))
    .all();
}

export async function supplierList(ctx: AppContext, orgId: string) {
  const rows = await listSuppliers(ctx, orgId);
  const on = today(ctx);
  return {
    today: on,
    items: rows.map((r) => ({
      ...r,
      currency: supplierCurrency(r, on),
      issues: supplierIssues(r, on),
    })),
    check: checkSuppliers(rows, on),
    attention: supplierAttention(rows, on),
  };
}

/** Suppliers' "current through" dates for the calendar file and link: counts per date, no names. */
export async function supplierDueDatesFor(
  ctx: AppContext,
  orgId: string,
): Promise<SupplierDueDate[]> {
  return supplierDueDates(await listSuppliers(ctx, orgId), today(ctx));
}

export async function getSupplier(ctx: AppContext, orgId: string, id: string) {
  const row = await ctx.db
    .select()
    .from(supplier)
    .where(and(eq(supplier.id, id), eq(supplier.orgId, orgId)))
    .get();
  if (!row) throw notFound("Supplier");
  return row;
}

/**
 * Level 1 flow-down (FCI only, Level 1 flowed) is recorded on every plan, as the Level 1 workspace
 * is; a supplier that gets CUI or a Level 2 or 3 requirement needs the Level 2 plan.
 */
async function checkPlanAndRules(
  ctx: AppContext,
  orgId: string,
  merged: Omit<SupplierInput, "name">,
) {
  const errors = validateSupplier(
    {
      infoFlowed: merged.infoFlowed,
      requiredLevel: merged.requiredLevel ?? null,
      status: merged.status ?? null,
      statusDate: merged.statusDate ?? null,
      affirmedOn: merged.affirmedOn ?? null,
      cmmcUids: merged.cmmcUids ?? "",
      checkedOn: merged.checkedOn ?? null,
      awardedOn: merged.awardedOn ?? null,
    },
    today(ctx),
  );
  if (errors.length) throw badRequest(errors.join(" "));
  const level = merged.requiredLevel ?? null;
  if (merged.infoFlowed === "cui" || (level !== null && level !== "l1_self"))
    await assertLevel2Plan(ctx, orgId, "Recording suppliers that get CUI or a Level 2 requirement");
}

export async function createSupplier(
  ctx: AppContext,
  orgId: string,
  actorUserId: string,
  input: SupplierInput,
) {
  await checkPlanAndRules(ctx, orgId, input);
  const existing = await ctx.db
    .select({ n: count() })
    .from(supplier)
    .where(eq(supplier.orgId, orgId))
    .get();
  if ((existing?.n ?? 0) >= MAX_SUPPLIERS_PER_ORG)
    throw conflict(`A list holds at most ${MAX_SUPPLIERS_PER_ORG} suppliers.`);
  const id = newId("sup");
  await ctx.db.insert(supplier).values({
    id,
    orgId,
    name: input.name,
    supplies: input.supplies ?? "",
    infoFlowed: input.infoFlowed,
    cots: input.cots ?? false,
    requiredLevel: input.requiredLevel ?? null,
    status: input.status ?? null,
    statusDate: input.statusDate ?? null,
    affirmedOn: input.affirmedOn ?? null,
    cmmcUids: input.cmmcUids ?? "",
    clauseFlowedDown: input.clauseFlowedDown ?? false,
    subcontractRef: input.subcontractRef ?? "",
    checkedOn: input.checkedOn ?? null,
    awardedOn: input.awardedOn ?? null,
    evidenceRef: input.evidenceRef ?? "",
    notes: input.notes ?? "",
  });
  await audit(ctx, {
    orgId,
    actorUserId,
    action: "supplier.create",
    targetType: "supplier",
    targetId: id,
  });
  return getSupplier(ctx, orgId, id);
}

export async function updateSupplier(
  ctx: AppContext,
  orgId: string,
  actorUserId: string,
  id: string,
  patch: Partial<SupplierInput>,
) {
  const row = await getSupplier(ctx, orgId, id);
  // Validated as the row will be after the change, so a patch cannot leave it inconsistent.
  await checkPlanAndRules(ctx, orgId, { ...row, ...patch });
  await ctx.db
    .update(supplier)
    .set(patch)
    .where(and(eq(supplier.id, id), eq(supplier.orgId, orgId)));
  await audit(ctx, {
    orgId,
    actorUserId,
    action: "supplier.update",
    targetType: "supplier",
    targetId: id,
  });
  return getSupplier(ctx, orgId, id);
}

export async function deleteSupplier(
  ctx: AppContext,
  orgId: string,
  actorUserId: string,
  id: string,
) {
  await getSupplier(ctx, orgId, id);
  await ctx.db.delete(supplier).where(and(eq(supplier.id, id), eq(supplier.orgId, orgId)));
  await audit(ctx, {
    orgId,
    actorUserId,
    action: "supplier.delete",
    targetType: "supplier",
    targetId: id,
  });
}
