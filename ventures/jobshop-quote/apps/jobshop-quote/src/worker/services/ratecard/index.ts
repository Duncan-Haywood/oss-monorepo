// Rate card CRUD and loading the card the costing engine prices from. All queries scoped by orgId.
import type {
  CutSpeedImportBody,
  CutSpeedInput,
  DrillFeedInput,
  MaterialRateImportBody,
  PriceListSource,
  RateCardImportBody,
  RemovalRateInput,
} from "@shared/api";
import type { RateCard } from "@shared/costing";
import { CUTTING_MACHINE_KINDS, planCutSpeedImport } from "@shared/cut-speed-import";
import { isDrillingMachine, type MaterialPriceSource, ROUGHING_MACHINE_KINDS } from "@shared/enums";
import { PRICE_HISTORY_LIMIT, type PriceFields, priceChanged } from "@shared/material-price";
import { type MaterialRateKind, planMaterialRateImport } from "@shared/material-rate-import";
import { type ImportValues, planRateImport } from "@shared/rate-card-import";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import type { AppContext } from "../../context";
import {
  cutSpeeds,
  drillFeeds,
  finishingOps,
  machines,
  materialPriceChanges,
  materials,
  removalRates,
  shopSettings,
  user,
} from "../../db/schema";
import { badRequest, notFound } from "../../lib/errors";
import { newId } from "../../lib/ids";

export async function getSettings(ctx: AppContext, orgId: string) {
  const row = await ctx.db.select().from(shopSettings).where(eq(shopSettings.orgId, orgId)).get();
  if (!row) throw notFound("Shop settings");
  return row;
}

export async function updateSettings(
  ctx: AppContext,
  orgId: string,
  patch: Partial<typeof shopSettings.$inferInsert>,
) {
  // The logo changes only through services/ratecard/logo.ts, which checks the image first.
  const { orgId: _ignored, nextQuoteNumber: _n, logoKey: _l, ...safe } = patch;
  if (Object.keys(safe).length > 0) {
    await ctx.db.update(shopSettings).set(safe).where(eq(shopSettings.orgId, orgId));
  }
  return getSettings(ctx, orgId);
}

const settingsDto = (s: typeof shopSettings.$inferSelect) => {
  const { orgId: _o, nextQuoteNumber: _n, updatedAt: _u, logoKey, ...rest } = s;
  return { ...rest, hasLogo: logoKey !== null };
};

const strip = <T extends { orgId: string; createdAt: Date; updatedAt: Date }>(row: T) => {
  const { orgId: _o, createdAt: _c, updatedAt: _u, ...rest } = row;
  return rest;
};

/** A material row for the editor: the price date as an ISO string (shared/material-price.ts). */
const materialDto = (row: typeof materials.$inferSelect) => {
  const { priceSetAt, ...rest } = strip(row);
  return { ...rest, priceSetAt: priceSetAt.toISOString() };
};

/** The history row for a material's price as it now stands. */
function priceChangeRow(
  orgId: string,
  materialId: string,
  p: PriceFields,
  source: MaterialPriceSource,
  byUserId: string | null,
  at: Date,
  from?: PriceListSource,
): typeof materialPriceChanges.$inferInsert {
  return {
    id: newId("mpc"),
    orgId,
    materialId,
    pricingBasis: p.pricingBasis,
    pricePerLbCents: p.pricePerLbCents,
    stockPriceCents: p.stockPriceCents,
    pricePerFootCents: p.pricePerFootCents ?? null,
    pricePerCwtCents: p.pricePerCwtCents ?? null,
    pricePerMetreCents: p.pricePerMetreCents ?? null,
    source,
    supplier: from?.supplier || null,
    priceListDate: from?.date || null,
    byUserId,
    createdAt: at,
  };
}

/**
 * "Still good": the shop checked these materials' prices with its supplier and they stand. Each is
 * dated now without changing its price, with a "confirm" history row, in one D1 batch. Every id must
 * be one of this shop's active materials (404 for another shop's or an unknown id, 400 for a retired
 * one; nothing is saved either way).
 */
export async function confirmMaterialPrices(
  ctx: AppContext,
  orgId: string,
  materialIds: string[],
  byUserId: string | null,
) {
  const ids = [...new Set(materialIds)];
  const rows = await ctx.db
    .select()
    .from(materials)
    .where(and(eq(materials.orgId, orgId), inArray(materials.id, ids)))
    .all();
  if (rows.length !== ids.length) throw notFound("Material");
  const retired = rows.filter((r) => !r.active);
  if (retired.length > 0) {
    throw badRequest(
      `Retired materials cannot be confirmed: ${retired.map((r) => r.name).join(", ")}`,
    );
  }
  const at = ctx.now();
  const [first, ...more] = rows.flatMap((r) => [
    ctx.db
      .update(materials)
      .set({ priceSetAt: at })
      .where(and(eq(materials.id, r.id), eq(materials.orgId, orgId))),
    ctx.db
      .insert(materialPriceChanges)
      .values(priceChangeRow(orgId, r.id, r, "confirm", byUserId, at)),
  ]);
  if (first) await ctx.db.batch([first, ...more]);
  return { confirmed: rows.length, at: at.toISOString() };
}

/** A material's price history, newest first (at most PRICE_HISTORY_LIMIT rows). */
export async function listMaterialPriceHistory(ctx: AppContext, orgId: string, materialId: string) {
  const mat = await ctx.db
    .select({ id: materials.id, name: materials.name })
    .from(materials)
    .where(and(eq(materials.id, materialId), eq(materials.orgId, orgId)))
    .get();
  if (!mat) throw notFound("Material");
  const rows = await ctx.db
    .select({
      id: materialPriceChanges.id,
      pricingBasis: materialPriceChanges.pricingBasis,
      pricePerLbCents: materialPriceChanges.pricePerLbCents,
      stockPriceCents: materialPriceChanges.stockPriceCents,
      pricePerFootCents: materialPriceChanges.pricePerFootCents,
      pricePerCwtCents: materialPriceChanges.pricePerCwtCents,
      pricePerMetreCents: materialPriceChanges.pricePerMetreCents,
      source: materialPriceChanges.source,
      supplier: materialPriceChanges.supplier,
      priceListDate: materialPriceChanges.priceListDate,
      byName: user.name,
      createdAt: materialPriceChanges.createdAt,
    })
    .from(materialPriceChanges)
    .leftJoin(user, eq(user.id, materialPriceChanges.byUserId))
    .where(
      and(eq(materialPriceChanges.orgId, orgId), eq(materialPriceChanges.materialId, materialId)),
    )
    .orderBy(desc(materialPriceChanges.createdAt), desc(materialPriceChanges.id))
    .limit(PRICE_HISTORY_LIMIT + 1)
    .all();
  return {
    materialId: mat.id,
    name: mat.name,
    entries: rows.slice(0, PRICE_HISTORY_LIMIT).map((r) => ({
      ...r,
      createdAt: r.createdAt.toISOString(),
    })),
    truncated: rows.length > PRICE_HISTORY_LIMIT,
  };
}

/** Full rate card for the editor (inactive rows included). */
export async function getRateCardDto(ctx: AppContext, orgId: string) {
  const [settings, ms, mats, fins, speeds, rates, feeds] = await Promise.all([
    getSettings(ctx, orgId),
    ctx.db
      .select()
      .from(machines)
      .where(eq(machines.orgId, orgId))
      .orderBy(asc(machines.name))
      .all(),
    ctx.db
      .select()
      .from(materials)
      .where(eq(materials.orgId, orgId))
      .orderBy(asc(materials.name))
      .all(),
    ctx.db
      .select()
      .from(finishingOps)
      .where(eq(finishingOps.orgId, orgId))
      .orderBy(asc(finishingOps.name))
      .all(),
    listCutSpeeds(ctx, orgId),
    listRemovalRates(ctx, orgId),
    listDrillFeeds(ctx, orgId),
  ]);
  return {
    settings: settingsDto(settings),
    machines: ms.map(strip),
    materials: mats.map(materialDto),
    finishingOps: fins.map(strip),
    cutSpeeds: speeds,
    removalRates: rates,
    drillFeeds: feeds,
  };
}

/**
 * The card the engine prices from. Inactive rows stay resolvable so an existing draft that uses a
 * retired machine still prices (the UI only offers active rows for new choices).
 */
export async function loadRateCard(ctx: AppContext, orgId: string): Promise<RateCard> {
  const dto = await getRateCardDto(ctx, orgId);
  return {
    laborMarkupBps: dto.settings.laborMarkupBps,
    materialMarkupBps: dto.settings.materialMarkupBps,
    outsideServiceMarkupBps: dto.settings.outsideServiceMarkupBps,
    minimumLineCents: dto.settings.minimumLineCents,
    currency: dto.settings.currency,
    machines: dto.machines.map((m) => ({
      id: m.id,
      name: m.name,
      hourlyRateCents: m.hourlyRateCents,
      setupRateCents: m.setupRateCents,
    })),
    materials: dto.materials.map((m) => ({
      id: m.id,
      name: m.name,
      pricingBasis: m.pricingBasis,
      pricePerLbCents: m.pricePerLbCents,
      densityLbPerIn3: m.densityLbPerIn3,
      stockPriceCents: m.stockPriceCents,
      stockDescription: m.stockDescription,
      pricePerFootCents: m.pricePerFootCents,
      pricePerCwtCents: m.pricePerCwtCents,
      pricePerMetreCents: m.pricePerMetreCents,
      cutAllowanceIn: m.cutAllowanceIn,
      barLengthIn: m.barLengthIn,
      barRemnantIn: m.barRemnantIn,
      scrapBps: m.scrapBps,
      minChargeCents: m.minChargeCents,
    })),
    finishingOps: dto.finishingOps.map((f) => ({
      id: f.id,
      name: f.name,
      perPartCents: f.perPartCents,
      lotChargeCents: f.lotChargeCents,
      outsideService: f.outsideService,
    })),
  };
}

export type RateKind = "machines" | "materials" | "finishing-ops";
type MachineValues = Omit<typeof machines.$inferInsert, "id" | "orgId">;
type MaterialValues = Omit<typeof materials.$inferInsert, "id" | "orgId">;
type FinishingValues = Omit<typeof finishingOps.$inferInsert, "id" | "orgId">;

export async function createMachine(ctx: AppContext, orgId: string, v: MachineValues) {
  const [row] = await ctx.db
    .insert(machines)
    .values({ ...v, id: newId("mch"), orgId })
    .returning();
  if (!row) throw new Error("insert returned no row");
  return strip(row);
}
export async function createMaterial(
  ctx: AppContext,
  orgId: string,
  v: MaterialValues,
  byUserId: string | null = null,
) {
  const at = new Date();
  const id = newId("mat");
  const { priceSetAt: _p, ...values } = v;
  const [rows] = await ctx.db.batch([
    ctx.db
      .insert(materials)
      .values({ ...values, id, orgId, priceSetAt: at })
      .returning(),
    ctx.db
      .insert(materialPriceChanges)
      .values(priceChangeRow(orgId, id, priceFieldsOf(values), "create", byUserId, at)),
  ]);
  const row = rows[0];
  if (!row) throw new Error("insert returned no row");
  return materialDto(row);
}

function priceFieldsOf(v: {
  pricingBasis: PriceFields["pricingBasis"];
  pricePerLbCents?: number | null;
  stockPriceCents?: number | null;
  pricePerFootCents?: number | null;
  pricePerCwtCents?: number | null;
  pricePerMetreCents?: number | null;
}): PriceFields {
  return {
    pricingBasis: v.pricingBasis,
    pricePerLbCents: v.pricePerLbCents ?? null,
    stockPriceCents: v.stockPriceCents ?? null,
    pricePerFootCents: v.pricePerFootCents ?? null,
    pricePerCwtCents: v.pricePerCwtCents ?? null,
    pricePerMetreCents: v.pricePerMetreCents ?? null,
  };
}
export async function createFinishingOp(ctx: AppContext, orgId: string, v: FinishingValues) {
  const [row] = await ctx.db
    .insert(finishingOps)
    .values({ ...v, id: newId("fin"), orgId })
    .returning();
  if (!row) throw new Error("insert returned no row");
  return strip(row);
}

export async function updateMachine(
  ctx: AppContext,
  orgId: string,
  id: string,
  v: Partial<MachineValues>,
) {
  if (Object.keys(v).length === 0) {
    const cur = await ctx.db
      .select()
      .from(machines)
      .where(and(eq(machines.id, id), eq(machines.orgId, orgId)))
      .get();
    if (!cur) throw notFound("Machine");
    return strip(cur);
  }
  const [row] = await ctx.db
    .update(machines)
    .set(v)
    .where(and(eq(machines.id, id), eq(machines.orgId, orgId)))
    .returning();
  if (!row) throw notFound("Machine");
  return strip(row);
}
/**
 * Updates a material. When the price it charges by changes, the price date moves to now and a
 * history row is written in the same batch; any other edit leaves both alone.
 */
export async function updateMaterial(
  ctx: AppContext,
  orgId: string,
  id: string,
  patch: Partial<MaterialValues>,
  byUserId: string | null = null,
) {
  const { priceSetAt: _p, ...v } = patch;
  const cur = await ctx.db
    .select()
    .from(materials)
    .where(and(eq(materials.id, id), eq(materials.orgId, orgId)))
    .get();
  if (!cur) throw notFound("Material");
  if (Object.keys(v).length === 0) return materialDto(cur);
  const where = and(eq(materials.id, id), eq(materials.orgId, orgId));
  if (!priceChanged(cur, v)) {
    const [row] = await ctx.db.update(materials).set(v).where(where).returning();
    if (!row) throw notFound("Material");
    return materialDto(row);
  }
  const at = new Date();
  const next = priceFieldsOf({ ...priceFieldsOf(cur), ...definedPrice(v) });
  const [rows] = await ctx.db.batch([
    ctx.db
      .update(materials)
      .set({ ...v, priceSetAt: at })
      .where(where)
      .returning(),
    ctx.db
      .insert(materialPriceChanges)
      .values(priceChangeRow(orgId, id, next, "edit", byUserId, at)),
  ]);
  const row = rows[0];
  if (!row) throw notFound("Material");
  return materialDto(row);
}

function definedPrice(v: Partial<MaterialValues>): Partial<PriceFields> {
  const out: Partial<PriceFields> = {};
  if (v.pricingBasis !== undefined) out.pricingBasis = v.pricingBasis;
  if (v.pricePerLbCents !== undefined) out.pricePerLbCents = v.pricePerLbCents;
  if (v.stockPriceCents !== undefined) out.stockPriceCents = v.stockPriceCents;
  if (v.pricePerFootCents !== undefined) out.pricePerFootCents = v.pricePerFootCents;
  if (v.pricePerCwtCents !== undefined) out.pricePerCwtCents = v.pricePerCwtCents;
  if (v.pricePerMetreCents !== undefined) out.pricePerMetreCents = v.pricePerMetreCents;
  return out;
}
export async function updateFinishingOp(
  ctx: AppContext,
  orgId: string,
  id: string,
  v: Partial<FinishingValues>,
) {
  if (Object.keys(v).length === 0) {
    const cur = await ctx.db
      .select()
      .from(finishingOps)
      .where(and(eq(finishingOps.id, id), eq(finishingOps.orgId, orgId)))
      .get();
    if (!cur) throw notFound("Finishing operation");
    return strip(cur);
  }
  const [row] = await ctx.db
    .update(finishingOps)
    .set(v)
    .where(and(eq(finishingOps.id, id), eq(finishingOps.orgId, orgId)))
    .returning();
  if (!row) throw notFound("Finishing operation");
  return strip(row);
}

/**
 * Rate items are retired (active = false), not deleted: quotes snapshot the rows they used, and a
 * draft that references a retired row keeps pricing until the estimator changes it.
 */
export async function retireRateItem(ctx: AppContext, kind: RateKind, orgId: string, id: string) {
  if (kind === "machines") return updateMachine(ctx, orgId, id, { active: false });
  if (kind === "materials") return updateMaterial(ctx, orgId, id, { active: false });
  return updateFinishingOp(ctx, orgId, id, { active: false });
}

/**
 * Rate-card import (src/shared/rate-card-import.ts): rows read from the shop's own sheet. The rows
 * are matched to this shop's rates by name and validated again here, never trusted from the browser;
 * one bad row refuses the whole import (400 with each row's problem), and the good case writes every
 * row in one D1 batch, so an import is all or nothing. Existing quotes are not touched: lines keep
 * their rate snapshots until the estimator presses Re-price.
 */
export async function importRateCard(
  ctx: AppContext,
  orgId: string,
  body: RateCardImportBody,
  byUserId: string | null = null,
) {
  const card = await getRateCardDto(ctx, orgId);
  const existing =
    body.kind === "machines"
      ? card.machines
      : body.kind === "materials"
        ? card.materials
        : card.finishingOps;
  const plan = planRateImport(
    body.kind,
    body.rows as { row: number; values: ImportValues }[],
    existing,
  );
  if (plan.errors.length > 0) {
    throw badRequest(
      `${plan.errors.length} row${plan.errors.length === 1 ? "" : "s"} cannot be imported; nothing was saved`,
      plan.errors,
    );
  }
  const table =
    body.kind === "machines" ? machines : body.kind === "materials" ? materials : finishingOps;
  const prefix = body.kind === "machines" ? "mch" : body.kind === "materials" ? "mat" : "fin";
  // Rows that change nothing are not written or counted, as in the pair imports below: the preview
  // said "no change", so "Saved" must not call them updated.
  const writes = plan.rows.filter((r) => r.action === "create" || r.changes.length > 0);
  const at = new Date();
  const byId = new Map(card.materials.map((m) => [m.id, m]));
  // Materials: a row whose price changes (or a new row) moves its price date and adds a history
  // row in the same batch, so the import stays all or nothing. A supplier's sheet named in the
  // import (supplier, date) is kept on each of those history rows.
  const from = body.kind === "materials" ? body.priceList : undefined;
  const history: (typeof materialPriceChanges.$inferInsert)[] = [];
  const stmts = writes.map((r) => {
    const { name: _n, ...rest } = r.values;
    if (r.action === "update" && r.id) {
      let set = rest as Record<string, unknown>;
      const cur = body.kind === "materials" ? byId.get(r.id) : undefined;
      if (cur) {
        const patch = rest as Partial<MaterialValues>;
        if (priceChanged(cur, patch)) {
          set = { ...set, priceSetAt: at };
          const next = priceFieldsOf({ ...priceFieldsOf(cur), ...definedPrice(patch) });
          history.push(priceChangeRow(orgId, r.id, next, "import", byUserId, at, from));
        }
      }
      return ctx.db
        .update(table)
        .set(set as never)
        .where(and(eq(table.id, r.id), eq(table.orgId, orgId)));
    }
    const id = newId(prefix);
    if (body.kind === "materials") {
      const v = r.values as unknown as MaterialValues;
      history.push(priceChangeRow(orgId, id, priceFieldsOf(v), "import", byUserId, at, from));
      return ctx.db.insert(table).values({ ...r.values, id, orgId, priceSetAt: at } as never);
    }
    return ctx.db.insert(table).values({ ...r.values, id, orgId } as never);
  });
  if (history.length > 0) stmts.push(ctx.db.insert(materialPriceChanges).values(history) as never);
  const [first, ...more] = stmts;
  if (first) await ctx.db.batch([first, ...more]);
  return {
    created: writes.filter((r) => r.action === "create").length,
    updated: writes.filter((r) => r.action === "update").length,
  };
}

// ---- Cut speed per material and thickness ----

/** The shop's cut speeds by machine and material row, oldest first. */
export async function listCutSpeeds(ctx: AppContext, orgId: string) {
  const rows = await ctx.db
    .select()
    .from(cutSpeeds)
    .where(eq(cutSpeeds.orgId, orgId))
    .orderBy(asc(cutSpeeds.createdAt), asc(cutSpeeds.id))
    .all();
  return rows.map(strip);
}

/**
 * Sets a cutting machine's speed on one material row (one per pair: a second save replaces it).
 * Both rows must be this shop's and active; the machine must be one that cuts (has a default cut
 * speed or is a laser, waterjet or plasma), so a speed cannot land on a mill by a stale form.
 */
export async function setCutSpeed(ctx: AppContext, orgId: string, v: CutSpeedInput) {
  const [machine, material] = await Promise.all([
    ctx.db
      .select({ kind: machines.kind, active: machines.active, cut: machines.cutSpeedInPerMin })
      .from(machines)
      .where(and(eq(machines.id, v.machineId), eq(machines.orgId, orgId)))
      .get(),
    ctx.db
      .select({ active: materials.active })
      .from(materials)
      .where(and(eq(materials.id, v.materialId), eq(materials.orgId, orgId)))
      .get(),
  ]);
  if (!machine) throw notFound("Machine");
  if (!material) throw notFound("Material");
  if (!machine.active || !material.active) {
    throw badRequest("Retired machines and materials take no new cut speeds");
  }
  if (!CUTTING_KINDS.has(machine.kind) && !(machine.cut && machine.cut > 0)) {
    throw badRequest("Cut speeds are for cutting machines (laser, waterjet, plasma)");
  }
  const [row] = await ctx.db
    .insert(cutSpeeds)
    .values({ ...v, id: newId("cut"), orgId })
    .onConflictDoUpdate({
      target: [cutSpeeds.machineId, cutSpeeds.materialId],
      set: {
        cutSpeedInPerMin: v.cutSpeedInPerMin,
        pierceSeconds: v.pierceSeconds,
        updatedAt: ctx.now(),
      },
    })
    .returning();
  if (!row) throw new Error("upsert returned no row");
  return strip(row);
}

/** Removes one cut speed; the machine's default speed applies to that material again. */
export async function deleteCutSpeed(ctx: AppContext, orgId: string, id: string) {
  const [row] = await ctx.db
    .delete(cutSpeeds)
    .where(and(eq(cutSpeeds.id, id), eq(cutSpeeds.orgId, orgId)))
    .returning({ id: cutSpeeds.id });
  if (!row) throw notFound("Cut speed");
}

// ---- Removal rate per material ----

/** The shop's removal rates by machine and material row, oldest first. */
export async function listRemovalRates(ctx: AppContext, orgId: string) {
  const rows = await ctx.db
    .select()
    .from(removalRates)
    .where(eq(removalRates.orgId, orgId))
    .orderBy(asc(removalRates.createdAt), asc(removalRates.id))
    .all();
  return rows.map(strip);
}

/**
 * Sets a roughing machine's removal rate in one material row (one per pair: a second save replaces
 * it). Both rows must be this shop's and active; the machine must be one that roughs (a mill or
 * lathe kind, or one with a default removal rate), so a rate cannot land on a laser by a stale form.
 */
export async function setRemovalRate(ctx: AppContext, orgId: string, v: RemovalRateInput) {
  const [machine, material] = await Promise.all([
    ctx.db
      .select({ kind: machines.kind, active: machines.active, rate: machines.removalRateIn3PerMin })
      .from(machines)
      .where(and(eq(machines.id, v.machineId), eq(machines.orgId, orgId)))
      .get(),
    ctx.db
      .select({ active: materials.active })
      .from(materials)
      .where(and(eq(materials.id, v.materialId), eq(materials.orgId, orgId)))
      .get(),
  ]);
  if (!machine) throw notFound("Machine");
  if (!material) throw notFound("Material");
  if (!machine.active || !material.active) {
    throw badRequest("Retired machines and materials take no new removal rates");
  }
  if (!ROUGHING_MACHINE_KINDS.has(machine.kind) && !(machine.rate && machine.rate > 0)) {
    throw badRequest("Removal rates are for roughing machines (mills and lathes)");
  }
  const [row] = await ctx.db
    .insert(removalRates)
    .values({ ...v, id: newId("mrr"), orgId })
    .onConflictDoUpdate({
      target: [removalRates.machineId, removalRates.materialId],
      set: { removalRateIn3PerMin: v.removalRateIn3PerMin, updatedAt: ctx.now() },
    })
    .returning();
  if (!row) throw new Error("upsert returned no row");
  return strip(row);
}

/** Removes one removal rate; the machine's default rate applies to that material again. */
export async function deleteRemovalRate(ctx: AppContext, orgId: string, id: string) {
  const [row] = await ctx.db
    .delete(removalRates)
    .where(and(eq(removalRates.id, id), eq(removalRates.orgId, orgId)))
    .returning({ id: removalRates.id });
  if (!row) throw notFound("Removal rate");
}

// ---- Drill feed per material ----

/** The shop's drill feeds by machine and material row, oldest first. */
export async function listDrillFeeds(ctx: AppContext, orgId: string) {
  const rows = await ctx.db
    .select()
    .from(drillFeeds)
    .where(eq(drillFeeds.orgId, orgId))
    .orderBy(asc(drillFeeds.createdAt), asc(drillFeeds.id))
    .all();
  return rows.map(strip);
}

/**
 * Sets a drilling machine's feed in one material row (one per pair: a second save replaces it).
 * Both rows must be this shop's and active; the machine must be one that drills (a mill or lathe
 * kind, or one with a seconds per hole or a default drill feed, such as a drill press entered as
 * "other"), so a feed cannot land on a laser by a stale form.
 */
export async function setDrillFeed(ctx: AppContext, orgId: string, v: DrillFeedInput) {
  const [machine, material] = await Promise.all([
    ctx.db
      .select({
        kind: machines.kind,
        active: machines.active,
        perHole: machines.secondsPerHole,
        feed: machines.drillFeedInPerMin,
      })
      .from(machines)
      .where(and(eq(machines.id, v.machineId), eq(machines.orgId, orgId)))
      .get(),
    ctx.db
      .select({ active: materials.active })
      .from(materials)
      .where(and(eq(materials.id, v.materialId), eq(materials.orgId, orgId)))
      .get(),
  ]);
  if (!machine) throw notFound("Machine");
  if (!material) throw notFound("Material");
  if (!machine.active || !material.active) {
    throw badRequest("Retired machines and materials take no new drill feeds");
  }
  if (!isDrillingMachine(machine.kind, machine.perHole, machine.feed)) {
    throw badRequest(
      "Drill feeds are for machines that drill (mills, lathes, or one with a time per hole)",
    );
  }
  const [row] = await ctx.db
    .insert(drillFeeds)
    .values({ ...v, id: newId("dfd"), orgId })
    .onConflictDoUpdate({
      target: [drillFeeds.machineId, drillFeeds.materialId],
      set: { drillFeedInPerMin: v.drillFeedInPerMin, updatedAt: ctx.now() },
    })
    .returning();
  if (!row) throw new Error("upsert returned no row");
  return strip(row);
}

/** Removes one drill feed; the machine's default feed applies to that material again. */
export async function deleteDrillFeed(ctx: AppContext, orgId: string, id: string) {
  const [row] = await ctx.db
    .delete(drillFeeds)
    .where(and(eq(drillFeeds.id, id), eq(drillFeeds.orgId, orgId)))
    .returning({ id: drillFeeds.id });
  if (!row) throw notFound("Drill feed");
}

/** Machine kinds that cut sheet from a flat pattern. */
export const CUTTING_KINDS: ReadonlySet<string> = CUTTING_MACHINE_KINDS;

/**
 * Cut-speed import (src/shared/cut-speed-import.ts): rows from the shop's cut chart, matched to this
 * shop's machines, materials and speeds by name and validated again here, never trusted from the
 * browser. One bad row refuses the whole import (400 with each row's problem); the good case upserts
 * every changed row in one D1 batch. Rows that change nothing are not written.
 */
export async function importCutSpeeds(ctx: AppContext, orgId: string, body: CutSpeedImportBody) {
  const card = await getRateCardDto(ctx, orgId);
  const plan = planCutSpeedImport(body.rows, card);
  if (plan.errors.length > 0) {
    throw badRequest(
      `${plan.errors.length} row${plan.errors.length === 1 ? "" : "s"} cannot be imported; nothing was saved`,
      plan.errors,
    );
  }
  const now = ctx.now();
  const writes = plan.rows.filter((r) => r.action === "create" || r.changes.length > 0);
  const stmts = writes.map((r) =>
    ctx.db
      .insert(cutSpeeds)
      .values({ ...r.values, id: newId("cut"), orgId })
      .onConflictDoUpdate({
        target: [cutSpeeds.machineId, cutSpeeds.materialId],
        set: {
          cutSpeedInPerMin: r.values.cutSpeedInPerMin,
          pierceSeconds: r.values.pierceSeconds,
          updatedAt: now,
        },
      }),
  );
  const [first, ...more] = stmts;
  if (first) await ctx.db.batch([first, ...more]);
  return {
    created: plan.rows.filter((r) => r.action === "create").length,
    updated: writes.filter((r) => r.action === "update").length,
  };
}

/**
 * Removal-rate or drill-feed import (src/shared/material-rate-import.ts): rows from the shop's sheet,
 * matched to this shop's machines, materials and rows by name and validated again here, never trusted
 * from the browser. One bad row refuses the whole import (400 with each row's problem); the good case
 * upserts every changed row in one D1 batch. Rows that change nothing are not written.
 */
export async function importMaterialRates(
  ctx: AppContext,
  orgId: string,
  kind: MaterialRateKind,
  body: MaterialRateImportBody,
) {
  const card = await getRateCardDto(ctx, orgId);
  const plan = planMaterialRateImport(kind, body.rows, card);
  if (plan.errors.length > 0) {
    throw badRequest(
      `${plan.errors.length} row${plan.errors.length === 1 ? "" : "s"} cannot be imported; nothing was saved`,
      plan.errors,
    );
  }
  const now = ctx.now();
  const writes = plan.rows.filter((r) => r.action === "create" || r.changes.length > 0);
  const stmts = writes.map((r) => {
    if ("removalRateIn3PerMin" in r.values) {
      const v = r.values;
      return ctx.db
        .insert(removalRates)
        .values({ ...v, id: newId("mrr"), orgId })
        .onConflictDoUpdate({
          target: [removalRates.machineId, removalRates.materialId],
          set: { removalRateIn3PerMin: v.removalRateIn3PerMin, updatedAt: now },
        });
    }
    const v = r.values;
    return ctx.db
      .insert(drillFeeds)
      .values({ ...v, id: newId("dfd"), orgId })
      .onConflictDoUpdate({
        target: [drillFeeds.machineId, drillFeeds.materialId],
        set: { drillFeedInPerMin: v.drillFeedInPerMin, updatedAt: now },
      });
  });
  const [first, ...more] = stmts;
  if (first) await ctx.db.batch([first, ...more]);
  return {
    created: plan.rows.filter((r) => r.action === "create").length,
    updated: writes.filter((r) => r.action === "update").length,
  };
}
