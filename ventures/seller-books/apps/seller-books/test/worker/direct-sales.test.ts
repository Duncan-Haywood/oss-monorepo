// Direct sales: sales made off the marketplaces (cash, Facebook Marketplace, a market stall), typed in
// one at a time, counted in the P&L and the Schedule C worksheet like imported orders.
import { describe, expect, it } from "vitest";
import { api, json, setupTenant } from "./helpers";

type Tenant = Awaited<ReturnType<typeof setupTenant>>;
const path = (t: Tenant, p: string) => `/api/orgs/${t.orgId}${p}`;

const addSale = (t: Tenant, body: Record<string, unknown>, as = t.userId) =>
  api(path(t, "/sales"), { method: "POST", as, json: body });

const pnlTotal = async (t: Tenant) =>
  (
    await json<{
      cells: { platform: string; month: string; orders: number; revenueCents: number }[];
      total: {
        revenueCents: number;
        feesCents: number;
        postageCents: number;
        cogsCents: number;
        netProfitCents: number;
      };
    }>(await api(path(t, "/reports/pnl?from=2026-01-01&to=2026-12-31"), { as: t.userId }))
  ).total;

const scheduleLine = async (t: Tenant, l: string) => {
  const ws = await json<{ lines: { line: string; amountCents: number | null }[] }>(
    await api(path(t, "/reports/schedule-c?year=2026&mileageRate=70"), { as: t.userId }),
  );
  return ws.lines.find((x) => x.line === l)?.amountCents;
};

describe("direct sales", () => {
  it("a typed-in sale with a fee, postage and a stock item lands in the P&L and the worksheet", async () => {
    const t = await setupTenant();
    const item = await json<{ id: string }>(
      await api(path(t, "/inventory/items"), {
        method: "POST",
        as: t.userId,
        json: { title: "Denim jacket", acquiredDate: "2026-01-15", costCents: 1200 },
      }),
    );
    const res = await addSale(t, {
      date: "2026-03-10",
      title: "Denim jacket, Facebook Marketplace",
      itemCents: 4500,
      shippingChargedCents: 800,
      paymentFeeCents: 160,
      shippingLabelCents: 650,
      itemId: item.id,
    });
    expect(res.status).toBe(201);
    const { id } = await json<{ id: string }>(res);

    const sale = await json<{
      platform: string;
      kind: string;
      netCents: number;
      inventoryItemId: string | null;
      fees: { kind: string; amountCents: number }[];
    }>(await api(path(t, `/sales/${id}`), { as: t.userId }));
    expect(sale).toMatchObject({
      platform: "direct",
      kind: "order",
      netCents: 4500 + 800 - 160 - 650,
      inventoryItemId: item.id,
    });
    expect(sale.fees).toEqual([
      expect.objectContaining({ kind: "payment_processing", amountCents: 160 }),
    ]);
    const stock = await json<{ items: { id: string }[] }>(
      await api(path(t, "/inventory/items?status=in_stock"), { as: t.userId }),
    );
    expect(stock.items.map((i) => i.id)).not.toContain(item.id);

    expect(await pnlTotal(t)).toMatchObject({
      revenueCents: 5300,
      feesCents: 160,
      postageCents: 650,
      cogsCents: 1200,
      netProfitCents: 5300 - 160 - 650 - 1200,
    });
    expect(await scheduleLine(t, "1")).toBe(5300);

    // The sales list filters by the direct channel.
    const direct = await json<{ items: { id: string }[] }>(
      await api(path(t, "/sales?platform=direct"), { as: t.userId }),
    );
    expect(direct.items.map((s) => s.id)).toEqual([id]);
  });

  it("a refund to a buyer is a return on line 2", async () => {
    const t = await setupTenant();
    expect((await addSale(t, { date: "2026-04-01", title: "Lamp", itemCents: 3000 })).status).toBe(
      201,
    );
    const r = await addSale(t, {
      kind: "refund",
      date: "2026-04-03",
      title: "Lamp, returned",
      refundCents: 3000,
    });
    expect(r.status).toBe(201);
    expect(await scheduleLine(t, "1")).toBe(3000);
    expect(await scheduleLine(t, "2")).toBe(3000);
    expect((await pnlTotal(t)).revenueCents).toBe(0);
  });

  it("refuses an empty sale, a future date, a mixed refund and an item already sold", async () => {
    const t = await setupTenant();
    expect((await addSale(t, { date: "2026-04-01", title: "Nothing" })).status).toBe(400);
    expect((await addSale(t, { date: "2099-01-01", title: "Later", itemCents: 100 })).status).toBe(
      400,
    );
    expect(
      (
        await addSale(t, {
          kind: "refund",
          date: "2026-04-01",
          title: "Mixed",
          refundCents: 100,
          itemCents: 100,
        })
      ).status,
    ).toBe(400);
    const item = await json<{ id: string }>(
      await api(path(t, "/inventory/items"), {
        method: "POST",
        as: t.userId,
        json: { title: "Mug", acquiredDate: "2026-01-01", costCents: 200 },
      }),
    );
    const sale = { date: "2026-04-01", title: "Mug", itemCents: 1000, itemId: item.id };
    expect((await addSale(t, sale)).status).toBe(201);
    expect((await addSale(t, sale)).status).toBe(409);
    const later = await json<{ id: string }>(
      await api(path(t, "/inventory/items"), {
        method: "POST",
        as: t.userId,
        json: { title: "Vase", acquiredDate: "2026-05-01", costCents: 300 },
      }),
    );
    expect(
      (await addSale(t, { date: "2026-04-01", title: "Vase", itemCents: 900, itemId: later.id }))
        .status,
    ).toBe(409);
  });

  it("deleting a direct sale puts its item back in stock; imported sales cannot be deleted one by one", async () => {
    const t = await setupTenant();
    const item = await json<{ id: string }>(
      await api(path(t, "/inventory/items"), {
        method: "POST",
        as: t.userId,
        json: { title: "Boots", acquiredDate: "2026-01-01", costCents: 900 },
      }),
    );
    const { id } = await json<{ id: string }>(
      await addSale(t, {
        date: "2026-05-01",
        title: "Boots",
        itemCents: 5000,
        paymentFeeCents: 100,
        itemId: item.id,
      }),
    );
    const del = await api(path(t, `/sales/${id}`), { method: "DELETE", as: t.userId });
    expect(del.status).toBe(200);
    expect((await api(path(t, `/sales/${id}`), { as: t.userId })).status).toBe(404);
    const stock = await json<{ items: { id: string }[] }>(
      await api(path(t, "/inventory/items?status=in_stock"), { as: t.userId }),
    );
    expect(stock.items.map((i) => i.id)).toContain(item.id);
    expect((await pnlTotal(t)).revenueCents).toBe(0);

    const csv = [
      '"Item Id","Sold Date","Completed Date","Order Status","Item Title","Item Price","Buyer Shipping Fee","Seller Shipping Fee","Mercari Selling Fee","Payment Processing Fee","Shipping Adjustment Fee","Sales Tax Charged to Buyer","Buyer Protection Charged to Buyer","Net Seller Proceeds"',
      '"mx1","2026-05-02","2026-05-02","completed","Hat","10.00","0.00","0.00","1.00","0.00","0.00","0.00","0.00","9.00"',
    ].join("\n");
    const imp = await api(path(t, "/imports"), {
      method: "POST",
      as: t.userId,
      json: { report: "mercari_sales_report", fileName: "m.csv", csv },
    });
    expect(imp.status).toBe(201);
    const sales = await json<{ items: { id: string }[] }>(
      await api(path(t, "/sales?platform=mercari"), { as: t.userId }),
    );
    const imported = sales.items[0]?.id ?? "";
    expect(
      (await api(path(t, `/sales/${imported}`), { method: "DELETE", as: t.userId })).status,
    ).toBe(400);
  });

  it("viewers cannot add or delete; another org's user gets 404", async () => {
    const t = await setupTenant();
    const viewer = await setupTenant("viewer");
    expect((await addSale(viewer, { date: "2026-04-01", title: "X", itemCents: 100 })).status).toBe(
      403,
    );
    const { id } = await json<{ id: string }>(
      await addSale(t, { date: "2026-04-01", title: "X", itemCents: 100 }),
    );
    const other = await setupTenant();
    expect(
      (await api(path(t, `/sales/${id}`), { method: "DELETE", as: other.userId })).status,
    ).toBe(404);
    expect(
      (await addSale(t, { date: "2026-04-01", title: "X", itemCents: 100 }, other.userId)).status,
    ).toBe(404);
  });

  it("Free: direct sales do not use up the one platform, but count toward the 25 orders a month", async () => {
    const t = await setupTenant("owner", null);
    for (let i = 0; i < 25; i++) {
      const r = await addSale(t, { date: "2026-06-10", title: `Sale ${i}`, itemCents: 500 });
      expect(r.status).toBe(201);
    }
    const over = await addSale(t, { date: "2026-06-11", title: "One more", itemCents: 500 });
    expect(over.status).toBe(402);
    expect(JSON.stringify(await over.json())).toContain("2026-06 already has 25");
    expect(
      (await addSale(t, { date: "2026-07-01", title: "Next month", itemCents: 500 })).status,
    ).toBe(201);
    const billing = await json<{ usage: { platforms: string[] } }>(
      await api(path(t, "/billing"), { as: t.userId }),
    );
    expect(billing.usage.platforms).toEqual([]);
  });
});
