// A lot whose cost is split by what each item should sell for (services/books/lots.ts, "value"):
// the split chosen on the lot, the expected prices typed on its items, the even fallback while one is
// missing, and switching the split back.
import { describe, expect, it } from "vitest";
import { api, json, setupTenant } from "./helpers";

interface LotRow {
  id: string;
  splitBy: string;
  missingValueCount: number;
  unallocatedCents: number;
}
interface ItemRow {
  id: string;
  title: string;
  costCents: number;
  estimatedValueCents: number | null;
}

describe("lot cost split by expected price", () => {
  it("weights shares by expected price, falls back to even, and switches back", async () => {
    const { userId: as, orgId } = await setupTenant();
    const base = `/api/orgs/${orgId}`;
    const costs = async () =>
      Object.fromEntries(
        (await json<{ items: ItemRow[] }>(await api(`${base}/inventory/items`, { as }))).items.map(
          (i) => [i.title, i.costCents],
        ),
      );

    const created = await api(`${base}/inventory/lots`, {
      method: "POST",
      as,
      json: {
        name: "Thrift bin",
        acquiredDate: "2026-03-01",
        totalCostCents: 4000,
        splitBy: "value",
        items: [
          { title: "Coat", estimatedValueCents: 20000 },
          { title: "Shirt A", estimatedValueCents: 500 },
          { title: "Shirt B", estimatedValueCents: 500 },
          { title: "Shirt C", estimatedValueCents: 500 },
          { title: "Shirt D", estimatedValueCents: 500 },
        ],
      },
    });
    expect(created.status).toBe(201);
    const lot = await json<{ id: string; splitUsed: string; warnings: string[] }>(created);
    expect(lot.splitUsed).toBe("value");
    expect(lot.warnings).toEqual([]);
    expect(await costs()).toEqual({
      Coat: 3636,
      "Shirt A": 91,
      "Shirt B": 91,
      "Shirt C": 91,
      "Shirt D": 91,
    });

    // A new item with no expected price: the lot is split evenly until it has one, and says so.
    const added = await api(`${base}/inventory/items`, {
      method: "POST",
      as,
      json: { title: "Belt", lotId: lot.id },
    });
    expect(added.status).toBe(201);
    const belt = await json<ItemRow>(added);
    expect(belt.costCents).toBe(666); // 4000 / 6, leftover cents to the first items
    const lots = await json<{ items: LotRow[] }>(await api(`${base}/inventory/lots`, { as }));
    expect(lots.items[0]).toMatchObject({ splitBy: "value", missingValueCount: 1 });

    // Its price typed in: back to the value split, the shares adding up to the lot cost.
    const priced = await api(`${base}/inventory/items/${belt.id}`, {
      method: "PATCH",
      as,
      json: { estimatedValueCents: 2000 },
    });
    expect(await json<ItemRow>(priced)).toMatchObject({
      estimatedValueCents: 2000,
      costCents: 333,
    });
    const byValue = await costs();
    expect(byValue.Coat).toBe(3334); // 3333.33, and the tied remainders go to the first items
    expect(Object.values(byValue).reduce((s, v) => s + v, 0)).toBe(4000);

    // Switching the lot to an even split re-spreads it; the expected prices stay saved.
    const even = await api(`${base}/inventory/lots/${lot.id}`, {
      method: "PATCH",
      as,
      json: { splitBy: "even" },
    });
    expect(await json<{ splitUsed: string }>(even)).toMatchObject({ splitUsed: "even" });
    expect(new Set(Object.values(await costs()))).toEqual(new Set([667, 666]));

    // A split that is neither is refused.
    const bad = await api(`${base}/inventory/lots/${lot.id}`, {
      method: "PATCH",
      as,
      json: { splitBy: "random" },
    });
    expect(bad.status).toBe(400);
  });
});
