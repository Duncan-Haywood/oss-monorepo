// Material price lists, part 1: the price date and history written by edits and imports, the
// shop's age limit, and tenant isolation of the history route.
import type {
  MaterialDto,
  MaterialPriceHistoryDto,
  RateCardDto,
  ShopSettingsDto,
} from "@shared/api";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { materials } from "../../src/worker/db/schema";
import { addMember, api, json, seedRateCard, setupTenant, testDb } from "./helpers";

type T = { userId: string; path: (p?: string) => string };
const card = (t: T) => json<RateCardDto>(api(t.path("/rate-card"), { as: t.userId }));
const history = (t: T, id: string, as = t.userId) =>
  json<MaterialPriceHistoryDto>(api(t.path(`/rate-card/materials/${id}/prices`), { as }));
const put = (t: T, id: string, body: unknown) =>
  json<MaterialDto>(
    api(t.path(`/rate-card/materials/${id}`), { method: "PUT", as: t.userId, json: body }),
  );

const aluminum = {
  name: "Aluminum 6061-T6 plate",
  pricingBasis: "per_lb",
  pricePerLbCents: 450,
  densityLbPerIn3: 0.0975,
  scrapBps: 1_000,
  minChargeCents: 2_500,
};

/** Moves a material's price date back, as if it had been set `days` ago. */
async function age(id: string, days: number) {
  await testDb()
    .update(materials)
    .set({ priceSetAt: new Date(Date.now() - days * 86_400_000) })
    .where(eq(materials.id, id));
}

describe("material price dates and history", () => {
  it("records the first price on create, with who set it", async () => {
    const t = await setupTenant();
    const ids = await seedRateCard(t);
    const al = (await card(t)).materials.find((m) => m.id === ids.al);
    expect(al?.priceSetAt).toMatch(/^\d{4}-\d\d-\d\dT/);
    const h = await history(t, ids.al);
    expect(h.name).toBe("Aluminum 6061-T6 plate");
    expect(h.entries).toHaveLength(1);
    expect(h.entries[0]).toMatchObject({
      source: "create",
      pricingBasis: "per_lb",
      pricePerLbCents: 450,
      byName: "Test User",
    });
    expect(h.truncated).toBe(false);
  });

  it("moves the date and adds a row only when the price changes", async () => {
    const t = await setupTenant();
    const ids = await seedRateCard(t);
    await age(ids.al, 200);
    const before = (await card(t)).materials.find((m) => m.id === ids.al);
    // A name and scrap edit is not a new price.
    const renamed = await put(t, ids.al, { ...aluminum, name: "6061-T6 plate", scrapBps: 1_200 });
    expect(renamed.priceSetAt).toBe(before?.priceSetAt);
    expect((await history(t, ids.al)).entries).toHaveLength(1);
    // A new $/lb is.
    const repriced = await put(t, ids.al, {
      ...aluminum,
      name: "6061-T6 plate",
      pricePerLbCents: 480,
    });
    expect(Date.parse(repriced.priceSetAt)).toBeGreaterThan(Date.now() - 60_000);
    const h = await history(t, ids.al);
    expect(h.entries.map((e) => [e.source, e.pricePerLbCents])).toEqual([
      ["edit", 480],
      ["create", 450],
    ]);
  });

  it("counts a changed price from an import, and leaves unchanged rows alone", async () => {
    const t = await setupTenant();
    const ids = await seedRateCard(t);
    await age(ids.al, 120);
    await age(ids.ss, 120);
    const before = await card(t);
    const res = await api(t.path("/rate-card/import"), {
      method: "POST",
      as: t.userId,
      json: {
        kind: "materials",
        rows: [
          { row: 2, values: { name: "Aluminum 6061-T6 plate", pricePerLbCents: 495 } },
          // Same stock price, new description: an update, but not a new price.
          {
            row: 3,
            values: {
              name: "303 Stainless bar",
              stockPriceCents: 12_000,
              stockDescription: "0.75 in x 12 ft",
            },
          },
          {
            row: 4,
            values: {
              name: "4140 bar",
              pricingBasis: "per_lb",
              pricePerLbCents: 310,
              densityLbPerIn3: 0.284,
            },
          },
        ],
      },
    });
    expect(res.status).toBe(200);
    const after = await card(t);
    const find = (c: RateCardDto, id: string) => c.materials.find((m) => m.id === id);
    expect(find(after, ids.al)?.priceSetAt).not.toBe(find(before, ids.al)?.priceSetAt);
    expect(find(after, ids.ss)?.priceSetAt).toBe(find(before, ids.ss)?.priceSetAt);
    expect((await history(t, ids.al)).entries.map((e) => [e.source, e.pricePerLbCents])).toEqual([
      ["import", 495],
      ["create", 450],
    ]);
    expect((await history(t, ids.ss)).entries).toHaveLength(1);
    const added = after.materials.find((m) => m.name === "4140 bar");
    expect(added).toBeDefined();
    expect((await history(t, added?.id ?? "")).entries).toMatchObject([
      { source: "import", pricePerLbCents: 310 },
    ]);
  });

  it("keeps the shop's age limit, 90 days by default, and lets an admin turn it off", async () => {
    const t = await setupTenant();
    expect((await card(t)).settings.materialPriceMaxAgeDays).toBe(90);
    const patch = (body: unknown, as = t.userId) =>
      api(t.path("/settings"), { method: "PATCH", as, json: body });
    expect(
      (await json<ShopSettingsDto>(patch({ materialPriceMaxAgeDays: 30 }))).materialPriceMaxAgeDays,
    ).toBe(30);
    expect(
      (await json<ShopSettingsDto>(patch({ materialPriceMaxAgeDays: null })))
        .materialPriceMaxAgeDays,
    ).toBeNull();
    expect((await patch({ materialPriceMaxAgeDays: 0 })).status).toBe(400);
    const estimator = await addMember(t.path().split("/").pop() ?? "", "estimator");
    expect((await patch({ materialPriceMaxAgeDays: 60 }, estimator)).status).toBe(403);
  });

  it("lets any member read the history, and no other shop", async () => {
    const t = await setupTenant();
    const ids = await seedRateCard(t);
    const orgId = t.path().split("/").pop() ?? "";
    const viewer = await addMember(orgId, "viewer");
    expect((await history(t, ids.al, viewer)).entries).toHaveLength(1);
    const other = await setupTenant();
    const res = await api(other.path(`/rate-card/materials/${ids.al}/prices`), {
      as: other.userId,
    });
    expect(res.status).toBe(404);
    const cross = await api(t.path(`/rate-card/materials/${ids.al}/prices`), { as: other.userId });
    expect(cross.status).toBe(404); // not a member: the shop is hidden
  });
});

describe("'Still good': confirming material prices", () => {
  const confirm = (t: T, materialIds: string[], as = t.userId) =>
    api(t.path("/rate-card/materials/confirm-prices"), {
      method: "POST",
      as,
      json: { materialIds },
    });

  it("dates the prices now without changing them, with a 'confirm' history row", async () => {
    const t = await setupTenant();
    const { al, ss } = await seedRateCard(t);
    await age(al, 200);
    await age(ss, 120);
    const before = await card(t);
    const res = await confirm(t, [al, ss, al]);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ confirmed: 2 });
    const after = await card(t);
    for (const id of [al, ss]) {
      const was = before.materials.find((m) => m.id === id);
      const now = after.materials.find((m) => m.id === id);
      expect(Date.now() - Date.parse(now?.priceSetAt ?? "")).toBeLessThan(60_000);
      expect(now?.pricePerLbCents).toBe(was?.pricePerLbCents);
      expect(now?.stockPriceCents).toBe(was?.stockPriceCents);
    }
    const h = await history(t, al);
    expect(h.entries[0]).toMatchObject({ source: "confirm", pricePerLbCents: 450 });
    expect(h.entries[0]?.byName).not.toBeNull();
  });

  it("refuses a retired material and saves nothing", async () => {
    const t = await setupTenant();
    const { al, ss } = await seedRateCard(t);
    await age(al, 200);
    await api(t.path(`/rate-card/materials/${ss}`), { method: "DELETE", as: t.userId });
    const old = (await card(t)).materials.find((m) => m.id === al)?.priceSetAt;
    expect((await confirm(t, [al, ss])).status).toBe(400);
    expect((await card(t)).materials.find((m) => m.id === al)?.priceSetAt).toBe(old);
  });

  it("is for admins, and another shop's material is a 404", async () => {
    const a = await setupTenant();
    const b = await setupTenant();
    const { al } = await seedRateCard(a);
    const est = await addMember(a.path().split("/").pop() ?? "", "estimator");
    expect((await confirm(a, [al], est)).status).toBe(403);
    expect((await confirm(b, [al])).status).toBe(404);
    expect((await history(a, al)).entries.map((e) => e.source)).toEqual(["create"]);
  });
});
