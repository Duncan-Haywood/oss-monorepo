// The price list: items added, changed and deleted, one item per category, description and unit,
// a merge (an estimate's lines saved to the list) that adds new prices and updates matching ones,
// viewers who read and do not write, and another company's list kept apart.
import type { PriceItemDto, PriceListDto, PriceMergeDto } from "@shared/api/types";
import { describe, expect, it } from "vitest";
import { addToOrg, api, call, createTestUser, setupTenant } from "./helpers";

const duct = {
  category: "material",
  code: "GD-26",
  description: "Galvanized duct",
  unit: "LB",
  unitCostMicros: 4_875_000,
  note: "Ferguson quote 11/01",
};
const journeyman = {
  category: "labor",
  description: "Sheet metal journeyman",
  unit: "HR",
  unitCostMicros: 68_500_000,
};

async function tenant() {
  const t = await setupTenant("owner");
  return { ...t, as: t.userId, base: `/api/orgs/${t.orgId}/price-list` };
}

describe("price list", () => {
  it("adds, changes and deletes items, one per category, description and unit", async () => {
    const { base, as } = await tenant();
    expect((await call<PriceListDto>(base, { as })).items).toEqual([]);

    const a = await call<PriceItemDto>(base, { method: "POST", as, expect: 201, json: duct });
    expect(a).toMatchObject({ ...duct });
    await call(base, { method: "POST", as, expect: 201, json: journeyman });
    // The same item in other case and spacing is refused.
    await call(base, {
      method: "POST",
      as,
      expect: 409,
      json: { ...duct, description: " galvanized  DUCT ", unit: "lb" },
    });
    // Another unit is another price.
    await call(base, { method: "POST", as, expect: 201, json: { ...duct, unit: "FT" } });

    const changed = await call<PriceItemDto>(`${base}/${a.id}`, {
      method: "PATCH",
      as,
      json: { unitCostMicros: 5_125_000, note: "" },
    });
    expect(changed.unitCostMicros).toBe(5_125_000);
    expect(changed.note).toBeNull();
    expect(changed.code).toBe("GD-26");
    // Renamed onto another item's key: refused.
    await call(`${base}/${a.id}`, { method: "PATCH", as, expect: 409, json: { unit: "FT" } });
    await call(base, { method: "POST", as, expect: 400, json: { ...duct, unitCostMicros: -1 } });

    const list = await call<PriceListDto>(base, { as });
    expect(list.items.map((i) => [i.category, i.description, i.unit])).toEqual([
      ["labor", "Sheet metal journeyman", "HR"],
      ["material", "Galvanized duct", "FT"],
      ["material", "Galvanized duct", "LB"],
    ]);
    expect(list.limit).toBeGreaterThan(1000);

    await call(`${base}/${a.id}`, { method: "DELETE", as });
    expect((await call<PriceListDto>(base, { as })).items).toHaveLength(2);
    expect((await api(`${base}/${a.id}`, { method: "DELETE", as })).status).toBe(404);
  });

  it("merges a batch: new prices added, matching ones updated, the rest counted", async () => {
    const { base, as } = await tenant();
    await call(base, { method: "POST", as, expect: 201, json: duct });
    await call(base, { method: "POST", as, expect: 201, json: journeyman });
    const r = await call<PriceMergeDto>(`${base}/merge`, {
      method: "POST",
      as,
      json: {
        items: [
          // New cost for the duct; the code and note left out keep the saved ones.
          {
            category: "material",
            description: "galvanized duct",
            unit: "lb",
            unitCostMicros: 5_125_000,
          },
          journeyman,
          {
            category: "equipment",
            description: "Scissor lift",
            unit: "DAY",
            unitCostMicros: 185_000_000,
          },
          {
            category: "equipment",
            description: "Scissor lift",
            unit: "DAY",
            unitCostMicros: 175_000_000,
          },
        ],
      },
    });
    expect([r.added, r.updated, r.unchanged]).toEqual([1, 1, 1]);
    expect(r.conflicts).toEqual(["Scissor lift"]);
    const byName = Object.fromEntries(r.list.items.map((i) => [i.description, i]));
    expect(byName["Galvanized duct"]).toMatchObject({
      unit: "LB",
      unitCostMicros: 5_125_000,
      code: "GD-26",
      note: "Ferguson quote 11/01",
    });
    expect(byName["Scissor lift"]?.unitCostMicros).toBe(175_000_000);

    // A batch bigger than one D1 statement holds still lands whole.
    const many = Array.from({ length: 40 }, (_, i) => ({
      category: "material",
      description: `Fitting ${i + 1}`,
      unit: "EA",
      unitCostMicros: (i + 1) * 1_000_000,
    }));
    const r2 = await call<PriceMergeDto>(`${base}/merge`, {
      method: "POST",
      as,
      json: { items: many },
    });
    expect(r2.added).toBe(40);
    expect(r2.list.items).toHaveLength(43);
  });

  it("lets viewers read and not write, and keeps companies apart", async () => {
    const a = await tenant();
    const item = await call<PriceItemDto>(a.base, {
      method: "POST",
      as: a.as,
      expect: 201,
      json: duct,
    });
    const viewer = await createTestUser();
    await addToOrg(a.orgId, viewer.id, "viewer");
    expect((await call<PriceListDto>(a.base, { as: viewer.id })).items).toHaveLength(1);
    await call(a.base, { method: "POST", as: viewer.id, expect: 403, json: journeyman });
    await call(`${a.base}/merge`, {
      method: "POST",
      as: viewer.id,
      expect: 403,
      json: { items: [journeyman] },
    });
    await call(`${a.base}/${item.id}`, {
      method: "PATCH",
      as: viewer.id,
      expect: 403,
      json: { unitCostMicros: 1 },
    });

    const b = await tenant();
    expect((await api(a.base, { as: b.as })).status).toBe(404);
    expect(
      (
        await api(`${b.base}/${item.id}`, {
          method: "PATCH",
          as: b.as,
          json: { unitCostMicros: 1 },
        })
      ).status,
    ).toBe(404);
    expect((await api(`${b.base}/${item.id}`, { method: "DELETE", as: b.as })).status).toBe(404);
    expect((await call<PriceListDto>(b.base, { as: b.as })).items).toEqual([]);
    // B can list the same item on its own list.
    await call(b.base, { method: "POST", as: b.as, expect: 201, json: duct });
    const still = await call<PriceListDto>(a.base, { as: a.as });
    expect(still.items.map((i) => i.unitCostMicros)).toEqual([4_875_000]);
  });
});
