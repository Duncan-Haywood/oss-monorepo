// The Schedule C worksheet names sales with no item linked when stock that could be what they sold is still
// counted in line 41; linking the sale clears it.
import { describe, expect, it } from "vitest";
import { api, json, setupTenant } from "./helpers";

type Ws = {
  partIII: { line: string; amountCents: number | null; note?: string }[];
  warnings: string[];
  unlinkedSales: { orders: number; itemsOnHand: number; itemsOnHandCents: number } | null;
};

describe("unlinked sales and line 41", () => {
  it("warns while a sale has no item, and stops once it is linked", async () => {
    const t = await setupTenant();
    const p = (s: string) => `/api/orgs/${t.orgId}${s}`;
    const item = await json<{ id: string }>(
      await api(p("/inventory/items"), {
        method: "POST",
        as: t.userId,
        json: { title: "Pyrex bowl", acquiredDate: "2026-02-01", costCents: 1000 },
      }),
    );
    const sale = await api(p("/sales"), {
      method: "POST",
      as: t.userId,
      json: { date: "2026-03-10", title: "Pyrex bowl, market stall", itemCents: 3000 },
    });
    expect(sale.status).toBe(201);
    const saleId = (await json<{ id: string }>(sale)).id;

    const ws = async () =>
      json<Ws>(await api(p("/reports/schedule-c?year=2026"), { as: t.userId }));
    let w = await ws();
    expect(w.unlinkedSales).toMatchObject({ orders: 1, itemsOnHand: 1, itemsOnHandCents: 1000 });
    expect(w.partIII.find((l) => l.line === "41")?.amountCents).toBe(1000);
    expect(w.warnings.join(" ")).toMatch(/1 sale in 2026 has no stock item linked/);

    const link = await api(p(`/sales/${saleId}/link-item`), {
      method: "POST",
      as: t.userId,
      json: { itemId: item.id },
    });
    expect(link.status).toBe(200);
    w = await ws();
    expect(w.unlinkedSales).toBeNull();
    expect(w.partIII.find((l) => l.line === "41")?.amountCents).toBe(0);
    expect(w.partIII.find((l) => l.line === "42")?.amountCents).toBe(1000);
    expect(w.warnings.join(" ")).not.toMatch(/no stock item linked/);
  });
});
