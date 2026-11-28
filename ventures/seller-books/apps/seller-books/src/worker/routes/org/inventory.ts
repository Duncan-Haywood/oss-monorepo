// Inventory: items (each with a cost basis) and lots (bulk buys whose cost is spread over their items).
import { INVENTORY_STATUSES } from "@shared/enums";
import { COUNT_OUTCOMES, type CountItem, MAX_COUNT_ITEMS } from "@shared/stock-count";
import { and, desc, eq, inArray, lte, type SQL, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { Hono } from "hono";
import { z } from "zod";
import { rowsPerInsert } from "../../db/client";
import { inventoryItem, inventoryLot, sale } from "../../db/schema";
import { badRequest, notFound } from "../../lib/errors";
import { newId } from "../../lib/ids";
import { validate } from "../../lib/validate";
import { requireRole } from "../../middleware/tenant";
import { LOT_SPLITS } from "../../services/books/lots";
import { reallocateLot } from "../../services/books/service";
import { importInventorySheet } from "../../services/importers/inventory-store";
import type { AppEnv } from "../../types";
import { MAX_IMPORT_BYTES } from "./imports";
import { isoDate, page, pageQuery, positiveCents } from "./schemas";

const routes = new Hono<AppEnv>();

const text = (max: number) => z.string().trim().max(max);

// ---- lots ------------------------------------------------------------------------------------------

const lotInput = z.object({
  name: text(200).min(1),
  acquiredDate: isoDate,
  vendor: text(200).nullish(),
  totalCostCents: positiveCents,
  /** "even" (default) or "value": items without a typed-in cost share it by their expected price. */
  splitBy: z.enum(LOT_SPLITS).optional(),
  notes: text(2000).nullish(),
  /** Optional items to create in the lot right away. */
  items: z
    .array(
      z.object({
        title: text(300).min(1),
        sku: text(100).nullish(),
        costCents: positiveCents.nullish(),
        /** Where this item came from when not the lot's vendor. */
        source: text(200).nullish(),
        /** What the seller expects it to sell for (the "value" split). */
        estimatedValueCents: positiveCents.nullish(),
      }),
    )
    .max(500)
    .optional(),
});

routes.get("/lots", async (c) => {
  const { orgId } = c.var.tenant;
  const lots = await c.var.ctx.db
    .select()
    .from(inventoryLot)
    .where(eq(inventoryLot.orgId, orgId))
    .orderBy(desc(inventoryLot.acquiredDate));
  const items = await c.var.ctx.db
    .select({
      lotId: inventoryItem.lotId,
      costCents: inventoryItem.costCents,
      costIsManual: inventoryItem.costIsManual,
      estimatedValueCents: inventoryItem.estimatedValueCents,
      status: inventoryItem.status,
    })
    .from(inventoryItem)
    .where(eq(inventoryItem.orgId, orgId));
  return c.json({
    items: lots.map((l) => {
      const mine = items.filter((i) => i.lotId === l.id);
      const carried = mine.reduce((s, i) => s + i.costCents, 0);
      const shared = mine.filter((i) => !i.costIsManual);
      return {
        ...l,
        itemCount: mine.length,
        soldCount: mine.filter((i) => i.status === "sold").length,
        unallocatedCents: Math.max(0, l.totalCostCents - carried),
        /** Items sharing the cost with no expected price: a "value" lot is split evenly while any. */
        missingValueCount: shared.filter((i) => !i.estimatedValueCents).length,
      };
    }),
  });
});

routes.post("/lots", requireRole("editor"), validate("json", lotInput), async (c) => {
  const { orgId } = c.var.tenant;
  const body = c.req.valid("json");
  const lotId = newId("lot");
  await c.var.ctx.db.insert(inventoryLot).values({
    id: lotId,
    orgId,
    name: body.name,
    acquiredDate: body.acquiredDate,
    vendor: body.vendor ?? null,
    totalCostCents: body.totalCostCents,
    splitBy: body.splitBy ?? "even",
    notes: body.notes ?? null,
  });
  const rows = (body.items ?? []).map((i) => ({
    id: newId("itm"),
    orgId,
    lotId,
    title: i.title,
    sku: i.sku || null,
    acquiredDate: body.acquiredDate,
    costCents: i.costCents ?? 0,
    costIsManual: i.costCents != null,
    source: i.source || null,
    estimatedValueCents: i.estimatedValueCents || null,
  }));
  const chunk = rowsPerInsert(inventoryItem);
  for (let i = 0; i < rows.length; i += chunk)
    await c.var.ctx.db.insert(inventoryItem).values(rows.slice(i, i + chunk));
  const result = await reallocateLot(c.var.ctx, orgId, lotId);
  return c.json(
    {
      id: lotId,
      itemCount: result.itemCount,
      unallocatedCents: result.unallocatedCents,
      warnings: result.warnings,
      splitUsed: result.splitUsed,
    },
    201,
  );
});

routes.get("/lots/:id", async (c) => {
  const { orgId } = c.var.tenant;
  const lot = await c.var.ctx.db
    .select()
    .from(inventoryLot)
    .where(and(eq(inventoryLot.id, c.req.param("id")), eq(inventoryLot.orgId, orgId)))
    .get();
  if (!lot) throw notFound("Lot");
  const items = await c.var.ctx.db
    .select()
    .from(inventoryItem)
    .where(and(eq(inventoryItem.orgId, orgId), eq(inventoryItem.lotId, lot.id)))
    .orderBy(inventoryItem.createdAt, sql`rowid`);
  return c.json({ ...lot, items });
});

routes.patch(
  "/lots/:id",
  requireRole("editor"),
  validate("json", lotInput.omit({ items: true }).partial()),
  async (c) => {
    const { orgId } = c.var.tenant;
    const body = c.req.valid("json");
    if (Object.keys(body).length === 0) throw badRequest("Nothing to update.");
    const res = await c.var.ctx.db
      .update(inventoryLot)
      .set(body)
      .where(and(eq(inventoryLot.id, c.req.param("id")), eq(inventoryLot.orgId, orgId)))
      .returning({ id: inventoryLot.id });
    if (res.length === 0) throw notFound("Lot");
    const result = await reallocateLot(c.var.ctx, orgId, c.req.param("id"));
    return c.json({
      ok: true,
      unallocatedCents: result.unallocatedCents,
      warnings: result.warnings,
      splitUsed: result.splitUsed,
    });
  },
);

routes.delete("/lots/:id", requireRole("editor"), async (c) => {
  const { orgId } = c.var.tenant;
  const id = c.req.param("id");
  const lot = await c.var.ctx.db
    .select({ id: inventoryLot.id })
    .from(inventoryLot)
    .where(and(eq(inventoryLot.id, id), eq(inventoryLot.orgId, orgId)))
    .get();
  if (!lot) throw notFound("Lot");
  // Items keep their allocated cost as a typed-in cost (lot_id becomes null via ON DELETE SET NULL).
  await c.var.ctx.db
    .update(inventoryItem)
    .set({ costIsManual: true })
    .where(and(eq(inventoryItem.orgId, orgId), eq(inventoryItem.lotId, id)));
  await c.var.ctx.db
    .delete(inventoryLot)
    .where(and(eq(inventoryLot.id, id), eq(inventoryLot.orgId, orgId)));
  return c.json({ ok: true });
});

// ---- items -----------------------------------------------------------------------------------------

const itemInput = z.object({
  title: text(300).min(1),
  sku: text(100).nullish(),
  acquiredDate: isoDate.optional(),
  /** Omit for an item in a lot to take its share of the lot cost. */
  costCents: positiveCents.nullish(),
  lotId: z.string().nullish(),
  /** Where it was bought (a store, a sale, a supplier); an item in a lot falls back to the lot's vendor. */
  source: text(200).nullish(),
  /** What the seller expects it to sell for (weights its share of a lot split by value). */
  estimatedValueCents: positiveCents.nullish(),
});

routes.get(
  "/items",
  validate(
    "query",
    pageQuery.extend({
      status: z.enum(INVENTORY_STATUSES).optional(),
      sku: z.string().max(100).optional(),
    }),
  ),
  async (c) => {
    const { orgId } = c.var.tenant;
    const q = c.req.valid("query");
    const where: SQL[] = [eq(inventoryItem.orgId, orgId)];
    if (q.status) where.push(eq(inventoryItem.status, q.status));
    if (q.sku) where.push(eq(inventoryItem.sku, q.sku));
    const rows = await c.var.ctx.db
      .select()
      .from(inventoryItem)
      .where(and(...where))
      .orderBy(desc(inventoryItem.acquiredDate), inventoryItem.id)
      .limit(q.limit + 1)
      .offset(q.cursor);
    return c.json(page(rows, q.limit, q.cursor));
  },
);

routes.post("/items", requireRole("editor"), validate("json", itemInput), async (c) => {
  const { orgId } = c.var.tenant;
  const body = c.req.valid("json");
  let acquiredDate = body.acquiredDate;
  if (body.lotId) {
    const lot = await c.var.ctx.db
      .select()
      .from(inventoryLot)
      .where(and(eq(inventoryLot.id, body.lotId), eq(inventoryLot.orgId, orgId)))
      .get();
    if (!lot) throw notFound("Lot");
    acquiredDate ??= lot.acquiredDate;
  } else if (body.costCents == null) {
    throw badRequest("An item outside a lot needs its cost.");
  }
  if (!acquiredDate) throw badRequest("acquiredDate is required for an item outside a lot.");
  const id = newId("itm");
  await c.var.ctx.db.insert(inventoryItem).values({
    id,
    orgId,
    lotId: body.lotId ?? null,
    title: body.title,
    sku: body.sku || null,
    acquiredDate,
    costCents: body.costCents ?? 0,
    costIsManual: body.costCents != null,
    source: body.source || null,
    estimatedValueCents: body.estimatedValueCents || null,
  });
  if (body.lotId) await reallocateLot(c.var.ctx, orgId, body.lotId);
  const row = await c.var.ctx.db
    .select()
    .from(inventoryItem)
    .where(and(eq(inventoryItem.id, id), eq(inventoryItem.orgId, orgId)))
    .get();
  return c.json(row, 201);
});

/**
 * A sourcing sheet saved as CSV -> inventory items (services/importers/inventory-sheet.ts). `dryRun`
 * answers the same summary without writing, for the preview on the Inventory page.
 */
routes.post(
  "/items/import",
  requireRole("editor"),
  validate(
    "json",
    z.object({
      fileName: z.string().trim().min(1).max(200),
      csv: z.string().min(1).max(MAX_IMPORT_BYTES),
      dryRun: z.boolean().optional(),
    }),
  ),
  async (c) => {
    const { orgId } = c.var.tenant;
    const { csv, dryRun } = c.req.valid("json");
    const summary = await importInventorySheet(c.var.ctx, orgId, csv, dryRun === true);
    return c.json(summary, dryRun ? 200 : 201);
  },
);

routes.patch(
  "/items/:id",
  requireRole("editor"),
  validate(
    "json",
    z.object({
      title: text(300).min(1).optional(),
      sku: text(100).nullish(),
      source: text(200).nullish(),
      acquiredDate: isoDate.optional(),
      /** A number sets a typed-in cost; null returns a lot item to its share of the lot. */
      costCents: positiveCents.nullable().optional(),
      status: z.enum(["in_stock", "written_off", "personal_use"]).optional(),
      disposedDate: isoDate.nullish(),
      /** Expected price; null clears it. */
      estimatedValueCents: positiveCents.nullish(),
    }),
  ),
  async (c) => {
    const { orgId } = c.var.tenant;
    const body = c.req.valid("json");
    const db = c.var.ctx.db;
    const item = await db
      .select()
      .from(inventoryItem)
      .where(and(eq(inventoryItem.id, c.req.param("id")), eq(inventoryItem.orgId, orgId)))
      .get();
    if (!item) throw notFound("Item");
    if (body.status && item.status === "sold") {
      throw badRequest("This item is linked to a sale; unlink the sale to change its status.");
    }
    const patch: Partial<typeof inventoryItem.$inferInsert> = {};
    if (body.title !== undefined) patch.title = body.title;
    if (body.sku !== undefined) patch.sku = body.sku || null;
    if (body.source !== undefined) patch.source = body.source || null;
    if (body.acquiredDate !== undefined) patch.acquiredDate = body.acquiredDate;
    if (body.estimatedValueCents !== undefined)
      patch.estimatedValueCents = body.estimatedValueCents || null;
    if (body.costCents !== undefined) {
      if (body.costCents === null && !item.lotId)
        throw badRequest("An item outside a lot needs its cost.");
      patch.costIsManual = body.costCents !== null;
      if (body.costCents !== null) patch.costCents = body.costCents;
    }
    if (body.status !== undefined) {
      patch.status = body.status;
      if (body.status === "in_stock") patch.disposedDate = null;
      else {
        if (!body.disposedDate)
          throw badRequest("disposedDate is required when an item leaves inventory.");
        patch.disposedDate = body.disposedDate;
      }
    }
    await db
      .update(inventoryItem)
      .set(patch)
      .where(and(eq(inventoryItem.id, item.id), eq(inventoryItem.orgId, orgId)));
    if (item.lotId && (body.costCents !== undefined || body.estimatedValueCents !== undefined))
      await reallocateLot(c.var.ctx, orgId, item.lotId);
    return c.json(
      await db
        .select()
        .from(inventoryItem)
        .where(and(eq(inventoryItem.id, item.id), eq(inventoryItem.orgId, orgId)))
        .get(),
    );
  },
);

routes.delete("/items/:id", requireRole("editor"), async (c) => {
  const { orgId } = c.var.tenant;
  const db = c.var.ctx.db;
  const item = await db
    .select()
    .from(inventoryItem)
    .where(and(eq(inventoryItem.id, c.req.param("id")), eq(inventoryItem.orgId, orgId)))
    .get();
  if (!item) throw notFound("Item");
  // An order that sold this item and others keeps pointing at one of the others.
  await db.batch([
    db
      .update(sale)
      .set({
        // Columns written with their tables: drizzle renders ${sale.id} as a bare "id", which here bound to
        // inventory_item.id, so the order was always unlinked instead of moved to another item (2026-11-28).
        inventoryItemId: sql`(select ii.id from inventory_item ii where ii.org_id = ${orgId} and ii.sold_by_sale_id = "sale"."id" and ii.id <> ${item.id} order by ii.acquired_date, ii.id limit 1)`,
      })
      .where(and(eq(sale.orgId, orgId), eq(sale.inventoryItemId, item.id))),
    db
      .delete(inventoryItem)
      .where(and(eq(inventoryItem.id, item.id), eq(inventoryItem.orgId, orgId))),
  ]);
  if (item.lotId) await reallocateLot(c.var.ctx, orgId, item.lotId);
  return c.json({ ok: true });
});

// ---- stock count (src/shared/stock-count.ts) -------------------------------------------------------

/** IN lists stay under D1's 100 bound parameters a statement, with room for the other conditions. */
const ID_SLICE = 90;
const slices = <T>(xs: T[]) =>
  Array.from({ length: Math.ceil(xs.length / ID_SLICE) }, (_, n) =>
    xs.slice(n * ID_SLICE, (n + 1) * ID_SLICE),
  );

/** The items a count on `asOf` expects: in stock now and bought on or before it. */
routes.get("/count", validate("query", z.object({ asOf: isoDate })), async (c) => {
  const { orgId } = c.var.tenant;
  const { asOf } = c.req.valid("query");
  const rows = await c.var.ctx.db
    .select({
      id: inventoryItem.id,
      title: inventoryItem.title,
      sku: inventoryItem.sku,
      acquiredDate: inventoryItem.acquiredDate,
      costCents: inventoryItem.costCents,
      source: inventoryItem.source,
      lotName: inventoryLot.name,
      lotVendor: inventoryLot.vendor,
    })
    .from(inventoryItem)
    .leftJoin(
      inventoryLot,
      and(eq(inventoryLot.id, inventoryItem.lotId), eq(inventoryLot.orgId, orgId)),
    )
    .where(
      and(
        eq(inventoryItem.orgId, orgId),
        eq(inventoryItem.status, "in_stock"),
        lte(inventoryItem.acquiredDate, asOf),
      ),
    )
    .orderBy(inventoryItem.acquiredDate, inventoryItem.id)
    .limit(MAX_COUNT_ITEMS + 1);
  const items: CountItem[] = rows.slice(0, MAX_COUNT_ITEMS).map((r) => ({
    id: r.id,
    title: r.title,
    sku: r.sku,
    acquiredDate: r.acquiredDate,
    costCents: r.costCents,
    lotName: r.lotName ?? null,
    source: r.source ?? r.lotVendor ?? null,
  }));
  return c.json({ asOf, items, truncated: rows.length > MAX_COUNT_ITEMS });
});

/**
 * Applies a count: the items not found leave inventory on the count's date, all as written off or all as
 * taken for personal use. Every id must be this shop's, still in stock and bought on or before the date,
 * or nothing is written (an item sold in another tab since the count began is named, not skipped).
 */
routes.post(
  "/count",
  requireRole("editor"),
  validate(
    "json",
    z.object({
      asOf: isoDate,
      outcome: z.enum(COUNT_OUTCOMES),
      missing: z.array(z.string().min(1).max(64)).min(1).max(MAX_COUNT_ITEMS),
    }),
  ),
  async (c) => {
    const { orgId } = c.var.tenant;
    const { asOf, outcome, missing } = c.req.valid("json");
    const ids = [...new Set(missing)];
    const db = c.var.ctx.db;
    const rows: { id: string; status: string; acquiredDate: string; costCents: number }[] = [];
    for (const part of slices(ids)) {
      rows.push(
        ...(await db
          .select({
            id: inventoryItem.id,
            status: inventoryItem.status,
            acquiredDate: inventoryItem.acquiredDate,
            costCents: inventoryItem.costCents,
          })
          .from(inventoryItem)
          .where(and(eq(inventoryItem.orgId, orgId), inArray(inventoryItem.id, part)))),
      );
    }
    if (rows.length !== ids.length) throw notFound("Item");
    const notInStock = rows.filter((r) => r.status !== "in_stock").length;
    if (notInStock)
      throw badRequest(
        `${notInStock} of these items are no longer in stock (sold or removed since the count began). Reload the count and try again.`,
      );
    const later = rows.filter((r) => r.acquiredDate > asOf).length;
    if (later)
      throw badRequest(
        `${later} of these items were bought after ${asOf}, so this count cannot include them.`,
      );
    const updates: BatchItem<"sqlite">[] = slices(ids).map((part) =>
      db
        .update(inventoryItem)
        .set({ status: outcome, disposedDate: asOf })
        .where(
          and(
            eq(inventoryItem.orgId, orgId),
            eq(inventoryItem.status, "in_stock"),
            inArray(inventoryItem.id, part),
          ),
        ),
    );
    // One batch is one transaction: the count lands whole or not at all.
    await db.batch(updates as [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]]);
    return c.json({
      updated: ids.length,
      costCents: rows.reduce((s, r) => s + r.costCents, 0),
      asOf,
      outcome,
    });
  },
);

/** Undoes a count: the items it took out go back in stock (only items written off or used, never sold). */
routes.post(
  "/count/undo",
  requireRole("editor"),
  validate(
    "json",
    z.object({ ids: z.array(z.string().min(1).max(64)).min(1).max(MAX_COUNT_ITEMS) }),
  ),
  async (c) => {
    const { orgId } = c.var.tenant;
    const ids = [...new Set(c.req.valid("json").ids)];
    const db = c.var.ctx.db;
    let updated = 0;
    for (const part of slices(ids)) {
      const res = await db
        .update(inventoryItem)
        .set({ status: "in_stock", disposedDate: null })
        .where(
          and(
            eq(inventoryItem.orgId, orgId),
            inArray(inventoryItem.status, [...COUNT_OUTCOMES]),
            inArray(inventoryItem.id, part),
          ),
        );
      updated += res.meta.changes ?? 0;
    }
    return c.json({ updated });
  },
);

export default routes;
