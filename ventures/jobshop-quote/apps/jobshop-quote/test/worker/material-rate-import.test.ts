// Removal-rate and drill-feed import: rows from the shop's sheet matched by machine and material
// name, all saved in one batch or none, admins only, and never another shop's rows.
import type { RateCardDto } from "@shared/api";
import { describe, expect, it } from "vitest";
import { addMember, api, json, seedRateCard, setupTenant } from "./helpers";

type Tenant = Awaited<ReturnType<typeof setupTenant>>;

async function shop(t: Tenant) {
  const base = await seedRateCard(t); // Haas VF-2, Aluminum 6061-T6 plate, 303 Stainless bar
  const post = <T>(p: string, body: unknown) =>
    json<T>(api(t.path(`/rate-card${p}`), { method: "POST", as: t.userId, json: body }), 201);
  const press = await post<{ id: string }>("/machines", {
    name: "Drill press",
    kind: "other",
    hourlyRateCents: 4_000,
    secondsPerHole: 20,
  });
  await post("/machines", {
    name: "Fiber laser",
    kind: "laser",
    hourlyRateCents: 15_000,
    cutSpeedInPerMin: 300,
  });
  return { ...base, press: press.id };
}

const imp = (t: Tenant, kind: string, rows: unknown, as = t.userId) =>
  api(t.path(`/rate-card/${kind}/import`), { method: "POST", as, json: { rows } });
const card = (t: Tenant) => json<RateCardDto>(api(t.path("/rate-card"), { as: t.userId }));

describe("removal-rate import", () => {
  it("adds and updates rates by machine and material name, all in one save", async () => {
    const t = await setupTenant();
    const s = await shop(t);
    await json(
      api(t.path("/rate-card/removal-rates"), {
        method: "PUT",
        as: t.userId,
        json: { machineId: s.mill, materialId: s.al, removalRateIn3PerMin: 4 },
      }),
    );
    const res = await json(
      imp(t, "removal-rates", [
        { row: 2, values: { machine: "haas vf-2", material: "aluminum 6061-t6 plate", value: 5 } },
        { row: 3, values: { machine: "Haas VF-2", material: "303 Stainless bar", value: 1.2 } },
      ]),
    );
    expect(res).toEqual({ created: 1, updated: 1 });
    const after = await card(t);
    expect(
      after.removalRates
        .map((r) => [r.materialId, r.removalRateIn3PerMin])
        .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
    ).toEqual(
      [
        [s.al, 5],
        [s.ss, 1.2],
      ].sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
    );
    // The same sheet again writes nothing.
    const again = await json(
      imp(t, "removal-rates", [
        { row: 2, values: { machine: "Haas VF-2", material: "Aluminum 6061-T6 plate", value: 5 } },
      ]),
    );
    expect(again).toEqual({ created: 0, updated: 0 });
  });

  it("saves nothing when one row is wrong, and names it", async () => {
    const t = await setupTenant();
    await shop(t);
    const res = await imp(t, "removal-rates", [
      { row: 2, values: { machine: "Haas VF-2", material: "Aluminum 6061-T6 plate", value: 5 } },
      { row: 3, values: { machine: "Fiber laser", material: "Aluminum 6061-T6 plate", value: 5 } },
    ]);
    expect(res.status).toBe(400);
    expect(JSON.stringify(await res.json())).toContain("is not a roughing machine");
    expect((await card(t)).removalRates).toEqual([]);
  });
});

describe("drill-feed import", () => {
  it("adds feeds for a drill press and a mill, and refuses a laser", async () => {
    const t = await setupTenant();
    const s = await shop(t);
    const res = await json(
      imp(t, "drill-feeds", [
        { row: 2, values: { machine: "Drill press", material: "303 Stainless bar", value: 1.5 } },
        { row: 3, values: { machine: "Haas VF-2", material: "303 Stainless bar", value: 3 } },
      ]),
    );
    expect(res).toEqual({ created: 2, updated: 0 });
    const feeds = (await card(t)).drillFeeds;
    expect(feeds.find((f) => f.machineId === s.press)).toMatchObject({
      materialId: s.ss,
      drillFeedInPerMin: 1.5,
    });
    const bad = await imp(t, "drill-feeds", [
      { row: 2, values: { machine: "Fiber laser", material: "303 Stainless bar", value: 2 } },
    ]);
    expect(bad.status).toBe(400);
    expect((await card(t)).drillFeeds).toHaveLength(2);
  });

  it("is for admins, and never matches another shop's machines or materials", async () => {
    const a = await setupTenant();
    const b = await setupTenant();
    await shop(a);
    const estimator = await addMember(a.orgId, "estimator");
    const row = {
      row: 2,
      values: { machine: "Haas VF-2", material: "303 Stainless bar", value: 3 },
    };
    expect((await imp(a, "drill-feeds", [row], estimator)).status).toBe(403);
    expect((await imp(a, "removal-rates", [row], estimator)).status).toBe(403);
    // b has no machines: a's names do not resolve for b.
    expect((await imp(b, "drill-feeds", [row])).status).toBe(400);
    expect((await card(a)).drillFeeds).toEqual([]);
    expect((await card(b)).drillFeeds).toEqual([]);
  });

  it("rejects a body over the schema's limits", async () => {
    const t = await setupTenant();
    await shop(t);
    const res = await imp(t, "drill-feeds", [
      { row: 2, values: { machine: "Haas VF-2", material: "303 Stainless bar", value: 5000 } },
    ]);
    expect(res.status).toBe(400);
  });
});
