// Which items an order sold (services/books/units.ts), end to end: the 2026-11-26 quality audit's probe.
// The eBay fixture sells two of SKU-PYREX-2 in one order on 2026-01-18 and SKU-JEANS-1 on 2026-01-05.
import { describe, expect, it } from "vitest";
import ebayCsv from "../fixtures/ebay-transaction-report.csv?raw";
import { api, json, setupTenant } from "./helpers";

type Item = { id: string; sku: string | null; status: string; disposedDate: string | null };

async function addItem(as: string, orgId: string, body: Record<string, unknown>) {
  const res = await api(`/api/orgs/${orgId}/inventory/items`, { method: "POST", as, json: body });
  expect(res.status).toBe(201);
  return json<Item>(res);
}

async function items(as: string, orgId: string) {
  return (
    await json<{ items: Item[] }>(await api(`/api/orgs/${orgId}/inventory/items?limit=100`, { as }))
  ).items;
}

async function sales(as: string, orgId: string) {
  return (
    await json<{
      items: { id: string; sku: string | null; kind: string; inventoryItemId: string | null }[];
    }>(await api(`/api/orgs/${orgId}/sales?limit=100`, { as }))
  ).items;
}

async function setup() {
  const t = await setupTenant();
  const pyrex1 = await addItem(t.userId, t.orgId, {
    title: "Pyrex bowl",
    sku: "SKU-PYREX-2",
    acquiredDate: "2025-11-01",
    costCents: 1000,
  });
  const pyrex2 = await addItem(t.userId, t.orgId, {
    title: "Pyrex bowl",
    sku: "SKU-PYREX-2",
    acquiredDate: "2025-11-02",
    costCents: 1000,
  });
  // Bought after the jeans sold on 2026-01-05: it cannot be the pair that sold.
  const jeans = await addItem(t.userId, t.orgId, {
    title: "Levi's 501",
    sku: "SKU-JEANS-1",
    acquiredDate: "2026-03-01",
    costCents: 700,
  });
  const res = await api(`/api/orgs/${t.orgId}/imports`, {
    method: "POST",
    as: t.userId,
    json: { report: "ebay_transaction_report", fileName: "ebay.csv", csv: ebayCsv },
  });
  expect(res.status).toBe(201);
  const batch = await json<{ id: string; itemsLinked: number }>(res);
  return { ...t, pyrex1, pyrex2, jeans, batch };
}

const pnlTotal = async (as: string, orgId: string) =>
  (
    await json<{ total: { cogsCents: number; ordersWithoutCost: number } }>(
      await api(`/api/orgs/${orgId}/reports/pnl?from=2026-01-01&to=2026-12-31`, { as }),
    )
  ).total;

const partIII = async (as: string, orgId: string) => {
  const ws = await json<{ partIII: { line: string; amountCents: number }[] }>(
    await api(`/api/orgs/${orgId}/reports/schedule-c?year=2026&mileageRate=70`, { as }),
  );
  return (l: string) => ws.partIII.find((x) => x.line === l)?.amountCents;
};

describe("cost of goods: which items an order sold", () => {
  it("a two-unit order sells two items, and an item bought after a sale is left in stock", async () => {
    const { userId, orgId, pyrex1, pyrex2, jeans, batch } = await setup();
    expect(batch.itemsLinked).toBe(2);
    const byId = new Map((await items(userId, orgId)).map((i) => [i.id, i]));
    expect(byId.get(pyrex1.id)).toMatchObject({ status: "sold", disposedDate: "2026-01-18" });
    expect(byId.get(pyrex2.id)).toMatchObject({ status: "sold", disposedDate: "2026-01-18" });
    expect(byId.get(jeans.id)).toMatchObject({ status: "in_stock", disposedDate: null });

    // Both bowls' cost in the P&L; the jeans order has no item, so it counts as missing cost.
    expect(await pnlTotal(userId, orgId)).toMatchObject({ cogsCents: 2000, ordersWithoutCost: 1 });
    // Part III: 35 + 36 - 41 = 42 with both bowls gone and the jeans (bought 2026) still on hand.
    const line = await partIII(userId, orgId);
    expect(line("41")).toBe(700);
    expect(line("42")).toBe(2000);

    // The ledger names both items.
    const csv = await (
      await api(`/api/orgs/${orgId}/reports/sales-ledger.csv?from=2026-01-01&to=2026-12-31`, {
        as: userId,
      })
    ).text();
    expect(csv).toContain("Cost from inventory item: Pyrex bowl and 1 more");

    // The stock report times both bowls (each gets half the order).
    const stock = await api(
      `/api/orgs/${orgId}/reports/stock?asOf=2026-12-31&from=2026-01-01&to=2026-12-31`,
      { as: userId },
    );
    expect(stock.status).toBe(200);
  });

  it("refuses a manual link to an item bought after the sale, and links a second unit by hand", async () => {
    const { userId, orgId, jeans } = await setupTenant().then(async (t) => {
      const j = await addItem(t.userId, t.orgId, {
        title: "Levi's 501",
        sku: null,
        acquiredDate: "2026-03-01",
        costCents: 700,
      });
      await api(`/api/orgs/${t.orgId}/imports`, {
        method: "POST",
        as: t.userId,
        json: { report: "ebay_transaction_report", fileName: "ebay.csv", csv: ebayCsv },
      });
      return { ...t, jeans: j };
    });
    const all = await sales(userId, orgId);
    const jeansSale = all.find((s) => s.sku === "SKU-JEANS-1" && s.kind === "order");
    const pyrexSale = all.find((s) => s.sku === "SKU-PYREX-2");
    const late = await api(`/api/orgs/${orgId}/sales/${jeansSale?.id}/link-item`, {
      method: "POST",
      as: userId,
      json: { itemId: jeans.id },
    });
    expect(late.status).toBe(409);

    const bowlA = await addItem(userId, orgId, {
      title: "Bowl A",
      acquiredDate: "2026-01-01",
      costCents: 400,
    });
    const bowlB = await addItem(userId, orgId, {
      title: "Bowl B",
      acquiredDate: "2026-01-02",
      costCents: 600,
    });
    const bowlC = await addItem(userId, orgId, {
      title: "Bowl C",
      acquiredDate: "2026-01-03",
      costCents: 900,
    });
    const link = (itemId: string) =>
      api(`/api/orgs/${orgId}/sales/${pyrexSale?.id}/link-item`, {
        method: "POST",
        as: userId,
        json: { itemId },
      });
    expect((await link(bowlA.id)).status).toBe(200);
    expect((await link(bowlB.id)).status).toBe(200);
    // The order sold two: a third is refused.
    expect((await link(bowlC.id)).status).toBe(409);
    expect(await pnlTotal(userId, orgId)).toMatchObject({ cogsCents: 1000 });

    // Unlinking the order puts both bowls back in stock.
    const un = await api(`/api/orgs/${orgId}/sales/${pyrexSale?.id}/link-item`, {
      method: "DELETE",
      as: userId,
    });
    expect(un.status).toBe(200);
    const byId = new Map((await items(userId, orgId)).map((i) => [i.id, i]));
    expect(byId.get(bowlA.id)?.status).toBe("in_stock");
    expect(byId.get(bowlB.id)?.status).toBe("in_stock");
    expect(await pnlTotal(userId, orgId)).toMatchObject({ cogsCents: 0 });
  });

  it("deleting the import puts every unit back in stock", async () => {
    const { userId, orgId, pyrex1, pyrex2, batch } = await setup();
    const del = await api(`/api/orgs/${orgId}/imports/${batch.id}`, {
      method: "DELETE",
      as: userId,
    });
    expect(del.status).toBe(200);
    const byId = new Map((await items(userId, orgId)).map((i) => [i.id, i]));
    expect(byId.get(pyrex1.id)?.status).toBe("in_stock");
    expect(byId.get(pyrex2.id)?.status).toBe("in_stock");
  });

  it("deleting one of an order's items keeps the order linked to the other", async () => {
    const { userId, orgId, pyrex1, pyrex2 } = await setup();
    const del = await api(`/api/orgs/${orgId}/inventory/items/${pyrex1.id}`, {
      method: "DELETE",
      as: userId,
    });
    expect(del.status).toBe(200);
    const pyrexSale = (await sales(userId, orgId)).find((s) => s.sku === "SKU-PYREX-2");
    expect(pyrexSale?.inventoryItemId).toBe(pyrex2.id);
    // One bowl's cost left, and the order now has a unit with no item.
    expect(await pnlTotal(userId, orgId)).toMatchObject({ cogsCents: 1000, ordersWithoutCost: 2 });
  });
});
