// Sales (orders + refunds) with their itemised fees; linking a sale to the inventory item it sold;
// direct sales (made off the marketplaces) typed in and deleted one at a time.
import { DIRECT, SALE_CHANNELS } from "@shared/enums";
import { and, desc, eq, gte, inArray, isNotNull, isNull, lte, type SQL } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { Hono } from "hono";
import { z } from "zod";
import { inventoryItem, platformCharge, sale, saleFee } from "../../db/schema";
import { badRequest, conflict, notFound } from "../../lib/errors";
import { newId } from "../../lib/ids";
import { validate } from "../../lib/validate";
import { requireRole } from "../../middleware/tenant";
import { assertOrdersAllowed } from "../../services/billing/service";
import { releaseItemsOfSales, removeReturnedCopies } from "../../services/books/service";
import type { AppEnv } from "../../types";
import { isoDate, page, pageQuery, positiveCents } from "./schemas";

const routes = new Hono<AppEnv>();

const listQuery = pageQuery.extend({
  platform: z.enum(SALE_CHANNELS).optional(),
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
    const linked = await db
      .select({ id: inventoryItem.id })
      .from(inventoryItem)
      .where(and(eq(inventoryItem.orgId, orgId), eq(inventoryItem.soldBySaleId, s.id)));
    // Links made before items recorded their order count the order's own item once.
    const linkedCount = linked.length || (s.inventoryItemId ? 1 : 0);
    if (linkedCount >= s.quantity)
      throw conflict(
        s.quantity > 1
          ? `This order sold ${s.quantity} units and all of them are linked; unlink it first.`
          : "This sale is already linked to an item; unlink it first.",
      );
    const item = await db
      .select()
      .from(inventoryItem)
      .where(and(eq(inventoryItem.id, c.req.valid("json").itemId), eq(inventoryItem.orgId, orgId)))
      .get();
    if (!item) throw notFound("Item");
    if (item.status !== "in_stock") throw conflict("That item is not in stock.");
    if (item.acquiredDate > s.date)
      throw conflict(
        `That item was bought on ${item.acquiredDate}, after this sale on ${s.date}, so it cannot be the one that sold.`,
      );
    const updates: BatchItem<"sqlite">[] = [
      db
        .update(inventoryItem)
        .set({ status: "sold", disposedDate: s.date, soldBySaleId: s.id })
        .where(and(eq(inventoryItem.id, item.id), eq(inventoryItem.orgId, orgId))),
    ];
    if (!s.inventoryItemId)
      updates.push(
        db
          .update(sale)
          .set({ inventoryItemId: item.id })
          .where(and(eq(sale.id, s.id), eq(sale.orgId, orgId))),
      );
    // An order linked before items recorded their order: record it on the first item too.
    if (s.inventoryItemId && linked.length === 0)
      updates.push(
        db
          .update(inventoryItem)
          .set({ soldBySaleId: s.id })
          .where(and(eq(inventoryItem.id, s.inventoryItemId), eq(inventoryItem.orgId, orgId))),
      );
    await db.batch(updates as [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]]);
    return c.json({ ok: true, linked: linkedCount + 1, quantity: s.quantity });
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
  await releaseItemsOfSales(c.var.ctx, orgId, [s]);
  await db
    .update(sale)
    .set({ inventoryItemId: null })
    .where(and(eq(sale.id, s.id), eq(sale.orgId, orgId)));
  return c.json({ ok: true });
});

/**
 * A sale made off the marketplaces: cash at a market, Facebook Marketplace, a local pickup paid by
 * Venmo. There is no report to import, so it is typed in. It lands in the books as a `direct` sale,
 * so the P&L, the Schedule C worksheet's gross receipts, the ledger and the journal export count it
 * like any imported order. A refund is the same with `kind: "refund"`. The free plan's monthly order
 * cap applies; the platform limit does not (billing counts platforms by import).
 */
const directSaleInput = z
  .object({
    kind: z.enum(["order", "refund"]).default("order"),
    date: isoDate,
    title: z.string().trim().min(1).max(300),
    /** What the buyer paid for the item, before any sales tax. Orders only. */
    itemCents: positiveCents.default(0),
    /** Shipping the buyer paid on top, if it was shipped. Orders only. */
    shippingChargedCents: positiveCents.default(0),
    /** Money handed back to the buyer. Refunds only. */
    refundCents: positiveCents.default(0),
    /** What the payment app kept (PayPal, Venmo for business, Square, a card reader). */
    paymentFeeCents: positiveCents.default(0),
    /** Postage the seller paid for this sale, when it was shipped. */
    shippingLabelCents: positiveCents.default(0),
    /** The stock item this sale sold; it is marked sold on the sale date. Orders only. */
    itemId: z.string().min(1).nullish(),
    notes: z.string().trim().max(1000).nullish(),
  })
  .superRefine((b, ctx) => {
    if (b.kind === "order") {
      if (b.itemCents + b.shippingChargedCents <= 0)
        ctx.addIssue({
          code: "custom",
          path: ["itemCents"],
          message: "Enter what the buyer paid.",
        });
      if (b.refundCents)
        ctx.addIssue({
          code: "custom",
          path: ["refundCents"],
          message: "A refund amount goes on a refund.",
        });
    } else {
      if (b.refundCents <= 0)
        ctx.addIssue({ code: "custom", path: ["refundCents"], message: "Enter the refund." });
      if (b.itemCents || b.shippingChargedCents || b.itemId)
        ctx.addIssue({
          code: "custom",
          path: ["itemCents"],
          message: "A refund has only the amount returned, fees and postage.",
        });
    }
  });

routes.post("/", requireRole("editor"), validate("json", directSaleInput), async (c) => {
  const { orgId } = c.var.tenant;
  const db = c.var.ctx.db;
  const b = c.req.valid("json");
  if (b.date > c.var.ctx.now().toISOString().slice(0, 10))
    throw badRequest("The sale date is in the future.");
  const item = b.itemId
    ? await db
        .select()
        .from(inventoryItem)
        .where(and(eq(inventoryItem.id, b.itemId), eq(inventoryItem.orgId, orgId)))
        .get()
    : null;
  if (b.itemId && !item) throw notFound("Item");
  if (item && item.status !== "in_stock") throw conflict("That item is not in stock.");
  if (item && item.acquiredDate > b.date)
    throw conflict(
      `That item was bought on ${item.acquiredDate}, after this sale on ${b.date}, so it cannot be the one that sold.`,
    );
  if (b.kind === "order") await assertOrdersAllowed(c.var.ctx, orgId, [b.date], "sale");

  const id = newId("sal");
  const feeCents = b.paymentFeeCents;
  const inCents = b.kind === "order" ? b.itemCents + b.shippingChargedCents : -b.refundCents;
  const insertSale = db.insert(sale).values({
    id,
    orgId,
    platform: DIRECT,
    kind: b.kind,
    externalId: id,
    orderId: null,
    date: b.date,
    title: b.title,
    sku: item?.sku ?? null,
    quantity: 1,
    itemCents: b.kind === "order" ? b.itemCents : 0,
    shippingChargedCents: b.kind === "order" ? b.shippingChargedCents : 0,
    salesTaxCents: 0,
    refundCents: b.kind === "refund" ? b.refundCents : 0,
    shippingLabelCents: b.shippingLabelCents,
    netCents: inCents - feeCents - b.shippingLabelCents,
    inventoryItemId: item?.id ?? null,
    importBatchId: null,
    notes: b.notes ?? null,
  });
  const insertFee = db.insert(saleFee).values({
    id: newId("fee"),
    orgId,
    saleId: id,
    kind: "payment_processing",
    amountCents: feeCents,
    sourceColumn: "Payment fee (typed in)",
  });
  const markSold = item
    ? db
        .update(inventoryItem)
        .set({ status: "sold", disposedDate: b.date, soldBySaleId: id })
        .where(and(eq(inventoryItem.id, item.id), eq(inventoryItem.orgId, orgId)))
    : null;
  // One D1 batch: the sale, its fee and the item's status are saved together or not at all.
  const rest = [...(feeCents ? [insertFee] : []), ...(markSold ? [markSold] : [])];
  await db.batch([insertSale, ...rest]);
  return c.json({ id }, 201);
});

/** Deletes a direct sale (imported rows go with their import). A linked item goes back in stock. */
routes.delete("/:id", requireRole("editor"), async (c) => {
  const { orgId } = c.var.tenant;
  const db = c.var.ctx.db;
  const s = await db
    .select()
    .from(sale)
    .where(and(eq(sale.id, c.req.param("id")), eq(sale.orgId, orgId)))
    .get();
  if (!s) throw notFound("Sale");
  if (s.platform !== DIRECT || s.importBatchId)
    throw badRequest("Imported sales are removed by deleting their import on the Imports page.");
  await releaseItemsOfSales(c.var.ctx, orgId, [s]);
  await removeReturnedCopies(c.var.ctx, orgId, { refundIds: [s.id] });
  await db.batch([
    db.delete(saleFee).where(and(eq(saleFee.saleId, s.id), eq(saleFee.orgId, orgId))),
    db.delete(sale).where(and(eq(sale.id, s.id), eq(sale.orgId, orgId))),
  ]);
  return c.json({ ok: true });
});

export default routes;

// ---------------------------------------------------------------------------------------------------------
// Items that came back on a refund. A refund row only says money went back; whether the item came back is
// the seller's to say. Marking it adds a copy of the sold item to stock (`returnSaleId`, schema/books.ts):
// dated the day it came back, at the original's cost, outside any lot. The original stays sold on its sale
// date, so a year already filed keeps its line 41, and the copy is never a purchase (line 36): its cost was in
// cost of goods sold when it sold, and on hand again it comes back out through line 41.

async function loadRefund(c: { var: AppEnv["Variables"] }, id: string) {
  const { orgId } = c.var.tenant;
  const s = await c.var.ctx.db
    .select()
    .from(sale)
    .where(and(eq(sale.id, id), eq(sale.orgId, orgId)))
    .get();
  if (!s) throw notFound("Sale");
  if (s.kind !== "refund") throw badRequest("Only a refund can bring an item back into stock.");
  return s;
}

const itemColumns = {
  id: inventoryItem.id,
  title: inventoryItem.title,
  sku: inventoryItem.sku,
  costCents: inventoryItem.costCents,
  status: inventoryItem.status,
  acquiredDate: inventoryItem.acquiredDate,
  disposedDate: inventoryItem.disposedDate,
  soldBySaleId: inventoryItem.soldBySaleId,
  returnedFromItemId: inventoryItem.returnedFromItemId,
};

/**
 * What this refund brought back (`returned`), and the sold items it could have been (`candidates`): the
 * items its own order sold when the report gives an order number, otherwise the latest items sold on or
 * before the refund. Items already brought back by any refund are left out of the candidates.
 */
routes.get("/:id/returned-items", async (c) => {
  const { orgId } = c.var.tenant;
  const db = c.var.ctx.db;
  const r = await loadRefund(c, c.req.param("id"));
  const returned = await db
    .select(itemColumns)
    .from(inventoryItem)
    .where(and(eq(inventoryItem.orgId, orgId), eq(inventoryItem.returnSaleId, r.id)))
    .orderBy(inventoryItem.id);
  const comeBack = await db
    .select({ id: inventoryItem.returnedFromItemId })
    .from(inventoryItem)
    .where(and(eq(inventoryItem.orgId, orgId), isNotNull(inventoryItem.returnedFromItemId)));
  const taken = new Set(comeBack.map((x) => x.id));
  let fromOrder = false;
  let candidates: (typeof returned)[number][] = [];
  if (r.orderId) {
    const orders = await db
      .select({ id: sale.id, inventoryItemId: sale.inventoryItemId })
      .from(sale)
      .where(
        and(
          eq(sale.orgId, orgId),
          eq(sale.platform, r.platform),
          eq(sale.orderId, r.orderId),
          eq(sale.kind, "order"),
        ),
      );
    if (orders.length) {
      const ids = orders.map((o) => o.id);
      const legacy = orders.map((o) => o.inventoryItemId).filter((x): x is string => !!x);
      const rows = await db
        .select(itemColumns)
        .from(inventoryItem)
        .where(and(eq(inventoryItem.orgId, orgId), inArray(inventoryItem.soldBySaleId, ids)));
      const legacyRows = legacy.length
        ? await db
            .select(itemColumns)
            .from(inventoryItem)
            .where(and(eq(inventoryItem.orgId, orgId), inArray(inventoryItem.id, legacy)))
        : [];
      const byId = new Map([...rows, ...legacyRows].map((i) => [i.id, i]));
      candidates = [...byId.values()].filter((i) => i.status === "sold");
      fromOrder = candidates.length > 0;
    }
  }
  if (!fromOrder) {
    candidates = await db
      .select(itemColumns)
      .from(inventoryItem)
      .where(
        and(
          eq(inventoryItem.orgId, orgId),
          eq(inventoryItem.status, "sold"),
          lte(inventoryItem.disposedDate, r.date),
        ),
      )
      .orderBy(desc(inventoryItem.disposedDate), inventoryItem.id)
      .limit(200);
  }
  return c.json({
    returned,
    fromOrder,
    candidates: candidates.filter((i) => !taken.has(i.id)),
  });
});

routes.post(
  "/:id/returned-items",
  requireRole("editor"),
  validate(
    "json",
    z.object({
      itemId: z.string().min(1),
      /** The day the item was back in hand; omitted = the refund's date (or the sale's, if later). */
      date: isoDate.optional(),
    }),
  ),
  async (c) => {
    const { orgId } = c.var.tenant;
    const db = c.var.ctx.db;
    const r = await loadRefund(c, c.req.param("id"));
    const b = c.req.valid("json");
    const item = await db
      .select()
      .from(inventoryItem)
      .where(and(eq(inventoryItem.id, b.itemId), eq(inventoryItem.orgId, orgId)))
      .get();
    if (!item) throw notFound("Item");
    if (item.status !== "sold" || !item.disposedDate)
      throw conflict("Only an item that sold can come back on a refund.");
    const already = await db
      .select({ id: inventoryItem.id })
      .from(inventoryItem)
      .where(and(eq(inventoryItem.orgId, orgId), eq(inventoryItem.returnedFromItemId, item.id)))
      .get();
    if (already) throw conflict("That item is already back in stock from a refund.");
    // ISO dates sort as text: the later of the refund and the sale.
    const date = b.date ?? ([r.date, item.disposedDate].sort()[1] as string);
    if (date < item.disposedDate)
      throw conflict(
        `That item sold on ${item.disposedDate}; it cannot have come back before then (${date}).`,
      );
    if (date > c.var.ctx.now().toISOString().slice(0, 10))
      throw badRequest("The return date is in the future.");
    const id = newId("itm");
    await db.insert(inventoryItem).values({
      id,
      orgId,
      lotId: null,
      sku: item.sku,
      title: item.title,
      acquiredDate: date,
      costCents: item.costCents,
      costIsManual: true,
      status: "in_stock",
      disposedDate: null,
      soldBySaleId: null,
      returnSaleId: r.id,
      returnedFromItemId: item.id,
    });
    return c.json(
      await db
        .select(itemColumns)
        .from(inventoryItem)
        .where(and(eq(inventoryItem.id, id), eq(inventoryItem.orgId, orgId)))
        .get(),
      201,
    );
  },
);

/** Takes back "it came back": the copy leaves stock (an order that sold it again is left unlinked). */
routes.delete("/:id/returned-items/:itemId", requireRole("editor"), async (c) => {
  const { orgId } = c.var.tenant;
  const r = await loadRefund(c, c.req.param("id"));
  const copy = await c.var.ctx.db
    .select({ id: inventoryItem.id, status: inventoryItem.status })
    .from(inventoryItem)
    .where(
      and(
        eq(inventoryItem.orgId, orgId),
        eq(inventoryItem.id, c.req.param("itemId")),
        eq(inventoryItem.returnSaleId, r.id),
      ),
    )
    .get();
  if (!copy) throw notFound("Returned item");
  if (copy.status !== "in_stock")
    throw conflict(
      "That item has left stock again; unlink its sale or put it back in stock first.",
    );
  await c.var.ctx.db
    .delete(inventoryItem)
    .where(and(eq(inventoryItem.orgId, orgId), eq(inventoryItem.id, copy.id)));
  return c.json({ ok: true });
});
