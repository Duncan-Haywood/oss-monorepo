// D1 binds at most 100 parameters a statement. The Sales page asks for `/sales?limit=500`, and the
// list looked up every listed sale's fees in one `IN (...)`: from 99 sales on, the page answered 500.
// Reads here are scoped to this file's own org, so it passes in any file order (isolate: false).
import { rowsPerInsert } from "@worker/db/client";
import { inventoryItem, sale, saleFee } from "@worker/db/schema";
import { newId } from "@worker/lib/ids";
import { describe, expect, it } from "vitest";
import { api, json, setupTenant, testDb } from "./helpers";

const N = 150;

describe("a seller with more than 100 sales", () => {
  it("the Sales page lists every sale with its own fees", async () => {
    const t = await setupTenant();
    const db = testDb();
    const sales = Array.from({ length: N }, (_, i) => ({
      id: newId("sal"),
      orgId: t.orgId,
      platform: "ebay",
      kind: "order",
      externalId: `bulk-${i}`,
      date: `2026-0${1 + (i % 9)}-${String(1 + (i % 28)).padStart(2, "0")}`,
      itemCents: 1000 + i,
    }));
    const fees = sales.map((s, i) => ({
      id: newId("fee"),
      orgId: t.orgId,
      saleId: s.id,
      kind: "final_value",
      amountCents: 100 + i,
      sourceColumn: "Final Value Fee - variable",
    }));
    for (let i = 0; i < N; i += rowsPerInsert(sale))
      await db.insert(sale).values(sales.slice(i, i + rowsPerInsert(sale)));
    for (let i = 0; i < N; i += rowsPerInsert(saleFee))
      await db.insert(saleFee).values(fees.slice(i, i + rowsPerInsert(saleFee)));

    const res = await api(`/api/orgs/${t.orgId}/sales?limit=500`, { as: t.userId });
    expect(res.status).toBe(200);
    const page = await json<{
      items: { id: string; itemCents: number; fees: { amountCents: number }[] }[];
    }>(res);
    expect(page.items).toHaveLength(N);
    for (const item of page.items) {
      expect(item.fees.map((f) => f.amountCents)).toEqual([100 + (item.itemCents - 1000)]);
    }
  });

  it("an inventory sheet links one order line that sold more than 100 units", async () => {
    // The link marks every unit the order sold in one UPDATE ... WHERE id IN (...).
    const t = await setupTenant();
    const db = testDb();
    const units = 120;
    const saleId = newId("sal");
    await db.insert(sale).values({
      id: saleId,
      orgId: t.orgId,
      platform: "ebay",
      kind: "order",
      externalId: "wholesale-lot",
      date: "2026-05-01",
      sku: "LOT-120",
      quantity: units,
      itemCents: 60_000,
    });
    const res = await api(`/api/orgs/${t.orgId}/inventory/items/import`, {
      method: "POST",
      as: t.userId,
      json: {
        fileName: "stock.csv",
        csv: `Item,SKU,Qty,Total Cost,Date Bought\nBulk tees,LOT-120,${units},$240.00,2026-04-01\n`,
      },
    });
    expect(res.status).toBe(201);
    expect(await json<{ salesLinked: number }>(res)).toMatchObject({ salesLinked: 1 });
    const sold = await db
      .select({ status: inventoryItem.status, by: inventoryItem.soldBySaleId })
      .from(inventoryItem);
    const mine = sold.filter((r) => r.by === saleId);
    expect(mine).toHaveLength(units);
    expect(mine.every((r) => r.status === "sold")).toBe(true);
  });
});
