// Drill feed per material: the rate-card rows, their tenant and role checks, and a STEP quote
// drilled at the material's feed on the one machine that has one.
import type { DrillFeedDto, QuoteDetailDto, RateCardDto, RfqDetailDto } from "@shared/api";
import { testFakes } from "@worker/context";
import { describe, expect, it } from "vitest";
import { RFQ_EMAIL } from "../fixtures/rfq";
import { addMember, api, json, seedRateCard, setupTenant } from "./helpers";

type Tenant = Awaited<ReturnType<typeof setupTenant>>;

async function shop(t: Tenant) {
  const base = await seedRateCard(t); // Haas VF-2 (no drilling rates), 6061 plate, 303 bar
  const post = <T>(p: string, body: unknown) =>
    json<T>(api(t.path(`/rate-card${p}`), { method: "POST", as: t.userId, json: body }), 201);
  const vmc = await post<{ id: string }>("/machines", {
    name: "Drilling VMC",
    kind: "mill_3axis",
    hourlyRateCents: 8_500,
    defaultSetupMinutes: 20,
    secondsPerHole: 3,
    drillFeedInPerMin: 12,
  });
  const press = await post<{ id: string }>("/machines", {
    name: "Drill press",
    kind: "other",
    hourlyRateCents: 4_000,
    defaultSetupMinutes: 5,
    secondsPerHole: 20,
  });
  const laser = await post<{ id: string }>("/machines", {
    name: "Fiber laser",
    kind: "laser",
    hourlyRateCents: 15_000,
    cutSpeedInPerMin: 300,
  });
  const saw = await post<{ id: string }>("/machines", {
    name: "Band saw",
    kind: "saw",
    hourlyRateCents: 3_000,
  });
  return { ...base, vmc: vmc.id, press: press.id, laser: laser.id, saw: saw.id };
}

const put = (t: Tenant, body: unknown, as = t.userId) =>
  api(t.path("/rate-card/drill-feeds"), { method: "PUT", as, json: body });

describe("drill feeds by material", () => {
  it("saves one feed per machine and material, replacing it on a second save", async () => {
    const t = await setupTenant();
    const s = await shop(t);
    const first = await json<DrillFeedDto>(
      put(t, { machineId: s.vmc, materialId: s.ss, drillFeedInPerMin: 3 }),
    );
    const again = await json<DrillFeedDto>(
      put(t, { machineId: s.vmc, materialId: s.ss, drillFeedInPerMin: 2.5 }),
    );
    expect(again.id).toBe(first.id);
    // a drill press entered as "other" drills: it has a time per hole
    const press = await json<DrillFeedDto>(
      put(t, { machineId: s.press, materialId: s.ss, drillFeedInPerMin: 1.5 }),
    );
    const card = await json<RateCardDto>(api(t.path("/rate-card"), { as: t.userId }));
    expect(card.drillFeeds).toEqual([
      { id: first.id, machineId: s.vmc, materialId: s.ss, drillFeedInPerMin: 2.5 },
      { id: press.id, machineId: s.press, materialId: s.ss, drillFeedInPerMin: 1.5 },
    ]);
    const del = await api(t.path(`/rate-card/drill-feeds/${first.id}`), {
      method: "DELETE",
      as: t.userId,
    });
    expect(del.status).toBe(204);
    const after = await json<RateCardDto>(api(t.path("/rate-card"), { as: t.userId }));
    expect(after.drillFeeds.map((f) => f.id)).toEqual([press.id]);
  });

  it("refuses a laser, a saw, a zero feed, a retired machine and an estimator", async () => {
    const t = await setupTenant();
    const s = await shop(t);
    for (const machineId of [s.laser, s.saw]) {
      const bad = await put(t, { machineId, materialId: s.al, drillFeedInPerMin: 4 });
      expect(bad.status).toBe(400);
    }
    const zero = await put(t, { machineId: s.vmc, materialId: s.al, drillFeedInPerMin: 0 });
    expect(zero.status).toBe(400);
    await json(
      api(t.path(`/rate-card/machines/${s.press}`), {
        method: "PATCH",
        as: t.userId,
        json: { active: false },
      }),
    );
    const retired = await put(t, { machineId: s.press, materialId: s.al, drillFeedInPerMin: 4 });
    expect(retired.status).toBe(400);
    const estimator = await addMember(t.orgId, "estimator");
    const denied = await put(
      t,
      { machineId: s.vmc, materialId: s.al, drillFeedInPerMin: 4 },
      estimator,
    );
    expect(denied.status).toBe(403);
  });

  it("never reads or writes another shop's machines, materials or feeds", async () => {
    const a = await setupTenant();
    const b = await setupTenant();
    const mine = await shop(a);
    const theirs = await shop(b);
    const crossMaterial = await put(b, {
      machineId: theirs.vmc,
      materialId: mine.al,
      drillFeedInPerMin: 4,
    });
    expect(crossMaterial.status).toBe(404);
    const crossMachine = await put(b, {
      machineId: mine.vmc,
      materialId: theirs.al,
      drillFeedInPerMin: 4,
    });
    expect(crossMachine.status).toBe(404);
    const row = await json<DrillFeedDto>(
      put(a, { machineId: mine.vmc, materialId: mine.al, drillFeedInPerMin: 4 }),
    );
    const del = await api(b.path(`/rate-card/drill-feeds/${row.id}`), {
      method: "DELETE",
      as: b.userId,
    });
    expect(del.status).toBe(404);
    const bCard = await json<RateCardDto>(api(b.path("/rate-card"), { as: b.userId }));
    expect(bCard.drillFeeds).toEqual([]);
    const aCard = await json<RateCardDto>(api(a.path("/rate-card"), { as: a.userId }));
    expect(aCard.drillFeeds.map((f) => f.id)).toEqual([row.id]);
  });

  it("drills a STEP part at the material's feed on the one machine that has one", async () => {
    const t = await setupTenant();
    const s = await shop(t);
    // Two machines time holes, so with no feed for the material the estimator would pick one;
    // the VMC's 303 stainless feed (its default is 12 in/min) makes it the drilling machine.
    await json(put(t, { machineId: s.vmc, materialId: s.ss, drillFeedInPerMin: 2 }));
    testFakes.geometry.set("BRK-1001.step", {
      format: "step",
      volumeIn3: null,
      boundingBoxIn: { xIn: 3.9, yIn: 1, zIn: 0.5 },
      surfaceAreaIn2: null,
      holes: [],
      holeLocations: [
        { diametersIn: [0.257], depthIn: 0.5 },
        { diametersIn: [0.257], depthIn: 0.5 },
      ],
      flat: null,
      confidence: { boundingBox: "high", volume: "low", holes: "high" },
      flags: [],
      source: "fake",
    });
    const form = new FormData();
    form.set("bodyText", RFQ_EMAIL);
    form.append("files", new File(["ISO-10303-21;"], "BRK-1001.step"));
    const rfq = await json<RfqDetailDto>(
      api(t.path("/rfqs"), { method: "POST", as: t.userId, body: form }),
      201,
    );
    const ex = await json<RfqDetailDto>(
      api(t.path(`/rfqs/${rfq.id}/extract`), { method: "POST", as: t.userId }),
    );
    const brk = ex.parts.find((p) => p.partNumber === "BRK-1001");
    await json(
      api(t.path(`/rfqs/${rfq.id}/parts/${brk?.id}`), {
        method: "PATCH",
        as: t.userId,
        json: { confirmed: true, materialId: s.ss },
      }),
    );
    const q = await json<QuoteDetailDto>(
      api(t.path("/quotes"), { method: "POST", as: t.userId, json: { rfqId: rfq.id } }),
      201,
    );
    // 2 × 3 s = 0.1 min; 1 in at 2 in/min = 0.5 min
    expect(q.lines[0]?.inputs.operations).toContainEqual({
      machineId: s.vmc,
      label: "Drill from CAD: 2 holes × 3 s + 1 in deep at 2 in/min (feed for 303 Stainless bar)",
      setupMinutes: 20,
      cycleMinutesPerPart: 0.6,
    });
  });
});
