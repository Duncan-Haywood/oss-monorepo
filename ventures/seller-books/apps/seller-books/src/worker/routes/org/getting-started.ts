// GET /api/orgs/:orgId/getting-started -> the first-run checklist (src/shared/getting-started.ts), read
// from row counts in the shop's own books. Viewers can read it; nothing is written.
import { gettingStarted } from "@shared/getting-started";
import { and, count, countDistinct, eq, isNull } from "drizzle-orm";
import { Hono } from "hono";
import { expense, importBatch, inventoryItem, mileageTrip, sale } from "../../db/schema";
import type { AppEnv } from "../../types";

const routes = new Hono<AppEnv>();

routes.get("/", async (c) => {
  const { db } = c.var.ctx;
  const { orgId } = c.var.tenant;
  const orders = and(eq(sale.orgId, orgId), eq(sale.kind, "order"));
  const [imports, items, orderRows, unlinked, expenses, trips] = await Promise.all([
    db
      .select({ n: count(), platforms: countDistinct(importBatch.platform) })
      .from(importBatch)
      .where(eq(importBatch.orgId, orgId))
      .get(),
    db.select({ n: count() }).from(inventoryItem).where(eq(inventoryItem.orgId, orgId)).get(),
    db.select({ n: count() }).from(sale).where(orders).get(),
    db
      .select({ n: count() })
      .from(sale)
      .where(and(orders, isNull(sale.inventoryItemId)))
      .get(),
    db.select({ n: count() }).from(expense).where(eq(expense.orgId, orgId)).get(),
    db.select({ n: count() }).from(mileageTrip).where(eq(mileageTrip.orgId, orgId)).get(),
  ]);
  return c.json(
    gettingStarted({
      imports: imports?.n ?? 0,
      platforms: imports?.platforms ?? 0,
      items: items?.n ?? 0,
      orders: orderRows?.n ?? 0,
      ordersWithoutCost: unlinked?.n ?? 0,
      expensesAndTrips: (expenses?.n ?? 0) + (trips?.n ?? 0),
    }),
  );
});

export default routes;
