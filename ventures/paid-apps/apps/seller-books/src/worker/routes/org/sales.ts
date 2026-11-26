// Sales (orders + refunds) with their itemised fees; linking a sale to the inventory item it sold.
import { PLATFORMS } from "@shared/enums";
import { and, desc, eq, gte, inArray, isNull, lte, type SQL } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { inventoryItem, platformCharge, sale, saleFee } from "../../db/schema";
import { badRequest, conflict, notFound } from "../../lib/errors";
import { validate } from "../../lib/validate";
import { requireRole } from "../../middleware/tenant";
import type { AppEnv } from "../../types";
import { isoDate, page, pageQuery } from "./schemas";

const routes = new Hono<AppEnv>();

const listQuery = pageQuery.extend({
  platform: z.enum(PLATFORMS).optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
  unlinked: z.enum(["true", "false"]).optional(),
});

routes.get("/", validate("query", listQuery), async (c) => {
  const { orgId } = c.var.tenant;
  const q = c.req.valid("query");
  const where: SQL[] = [eq(sale.orgId, orgId)];
  if (q.platform) where.push(eq(sale.platform, q.platform));
  if (q.from) where.push(gte(sale.date, q.from));
  if (q.to) where.push(lte(sale.date, q.to));
  if (q.unlinked === "true") where.push(isNull(sale.inventoryItemId), eq(sale.kind, "order"));
  const rows = await c.var.ctx.db
    .select()
    .from(sale)
    .where(and(...where))
    .orderBy(desc(sale.date), sale.id)
    .limit(q.limit + 1)
    .offset(q.cursor);
  const ids = rows.map((r) => r.id);
  const fees = ids.length
    ? await c.var.ctx.db
        .select()
        .from(saleFee)
        .where(and(eq(saleFee.orgId, orgId), inArray(saleFee.saleId, ids)))
    : [];
  const items = rows.map((r) => ({ ...r, fees: fees.filter((f) => f.saleId === r.id) }));
  return c.json(page(items, q.limit, q.cursor));
});

routes.get("/charges", validate("query", listQuery), async (c) => {
  const { orgId } = c.var.tenant;
  const q = c.req.valid("query");
  const where: SQL[] = [eq(platformCharge.orgId, orgId)];
  if (q.platform) where.push(eq(platformCharge.platform, q.platform));
  if (q.from) where.push(gte(platformCharge.date, q.from));
  if (q.to) where.push(lte(platformCharge.date, q.to));
  const rows = await c.var.ctx.db
    .select()
    .from(platformCharge)
    .where(and(...where))
    .orderBy(desc(platformCharge.date), platformCharge.id)
    .limit(q.limit + 1)
    .offset(q.cursor);
  return c.json(page(rows, q.limit, q.cursor));
});

routes.get("/:id", async (c) => {
  const { orgId } = c.var.tenant;
  const row = await c.var.ctx.db
    .select()
    .from(sale)
    .where(and(eq(sale.id, c.req.param("id")), eq(sale.orgId, orgId)))
    .get();
  if (!row) throw notFound("Sale");
  const fees = await c.var.ctx.db
    .select()
    .from(saleFee)
    .where(and(eq(saleFee.orgId, orgId), eq(saleFee.saleId, row.id)));
  return c.json({ ...row, fees });
});

routes.post(
  "/:id/link-item",
  requireRole("editor"),
  validate("json", z.object({ itemId: z.string().min(1) })),
  async (c) => {
    const { orgId } = c.var.tenant;
    const db = c.var.ctx.db;
    const s = await db
      .select()
      .from(sale)
      .where(and(eq(sale.id, c.req.param("id")), eq(sale.orgId, orgId)))
      .get();
    if (!s) throw notFound("Sale");
    if (s.kind !== "order") throw badRequest("Only orders can be linked to an item.");
    if (s.inventoryItemId)
      throw conflict("This sale is already linked to an item; unlink it first.");
    const item = await db
      .select()
      .from(inventoryItem)
      .where(and(eq(inventoryItem.id, c.req.valid("json").itemId), eq(inventoryItem.orgId, orgId)))
      .get();
    if (!item) throw notFound("Item");
    if (item.status !== "in_stock") throw conflict("That item is not in stock.");
    await db.batch([
      db
        .update(sale)
        .set({ inventoryItemId: item.id })
        .where(and(eq(sale.id, s.id), eq(sale.orgId, orgId))),
      db
        .update(inventoryItem)
        .set({ status: "sold", disposedDate: s.date })
        .where(and(eq(inventoryItem.id, item.id), eq(inventoryItem.orgId, orgId))),
    ]);
    return c.json({ ok: true });
  },
);

routes.delete("/:id/link-item", requireRole("editor"), async (c) => {
  const { orgId } = c.var.tenant;
  const db = c.var.ctx.db;
  const s = await db
    .select()
    .from(sale)
    .where(and(eq(sale.id, c.req.param("id")), eq(sale.orgId, orgId)))
    .get();
  if (!s) throw notFound("Sale");
  if (!s.inventoryItemId) return c.json({ ok: true });
  await db.batch([
    db
      .update(sale)
      .set({ inventoryItemId: null })
      .where(and(eq(sale.id, s.id), eq(sale.orgId, orgId))),
    db
      .update(inventoryItem)
      .set({ status: "in_stock", disposedDate: null })
      .where(and(eq(inventoryItem.id, s.inventoryItemId), eq(inventoryItem.orgId, orgId))),
  ]);
  return c.json({ ok: true });
});

export default routes;
