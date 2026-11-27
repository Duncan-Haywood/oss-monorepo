// Removal rate per material: the rate-card rows, their tenant and role checks, and a STEP quote
// roughed at the material's rate on the one machine that has one.
import type { QuoteDetailDto, RateCardDto, RemovalRateDto, RfqDetailDto } from "@shared/api";
import { testFakes } from "@worker/context";
import { describe, expect, it } from "vitest";
import { RFQ_EMAIL } from "../fixtures/rfq";
import { addMember, api, json, seedRateCard, setupTenant } from "./helpers";

type Tenant = Awaited<ReturnType<typeof setupTenant>>;

async function shop(t: Tenant) {
  const base = await seedRateCard(t); // Haas VF-2 (no default rate), 6061 plate, 303 bar
  const post = <T>(p: string, body: unknown) =>
    json<T>(api(t.path(`/rate-card${p}`), { method: "POST", as: t.userId, json: body }), 201);
  const vmc = await post<{ id: string }>("/machines", {
    name: "Roughing VMC",
    kind: "mill_3axis",
    hourlyRateCents: 8_500,
    defaultSetupMinutes: 30,
    removalRateIn3PerMin: 2,
  });
  const laser = await post<{ id: string }>("/machines", {
    name: "Fiber laser",
    kind: "laser",
    hourlyRateCents: 15_000,
    cutSpeedInPerMin: 300,
  });
  return { ...base, vmc: vmc.id, laser: laser.id };
}

const put = (t: Tenant, body: unknown, as = t.userId) =>
  api(t.path("/rate-card/removal-rates"), { method: "PUT", as, json: body });

describe("removal rates by material", () => {
  it("saves one rate per machine and material, replacing it on a second save", async () => {
    const t = await setupTenant();
    const s = await shop(t);
    const first = await json<RemovalRateDto>(
      put(t, { machineId: s.mill, materialId: s.al, removalRateIn3PerMin: 4 }),
    );
    const again = await json<RemovalRateDto>(
      put(t, { machineId: s.mill, materialId: s.al, removalRateIn3PerMin: 4.5 }),
    );
    expect(again.id).toBe(first.id);
    const card = await json<RateCardDto>(api(t.path("/rate-card"), { as: t.userId }));
    expect(card.removalRates).toEqual([
      { id: first.id, machineId: s.mill, materialId: s.al, removalRateIn3PerMin: 4.5 },
    ]);
    const del = await api(t.path(`/rate-card/removal-rates/${first.id}`), {
      method: "DELETE",
      as: t.userId,
    });
    expect(del.status).toBe(204);
    const after = await json<RateCardDto>(api(t.path("/rate-card"), { as: t.userId }));
    expect(after.removalRates).toEqual([]);
  });

  it("refuses a laser, a zero rate, and an estimator", async () => {
    const t = await setupTenant();
    const s = await shop(t);
    const bad = await put(t, { machineId: s.laser, materialId: s.al, removalRateIn3PerMin: 4 });
    expect(bad.status).toBe(400);
    const zero = await put(t, { machineId: s.mill, materialId: s.al, removalRateIn3PerMin: 0 });
    expect(zero.status).toBe(400);
    const estimator = await addMember(t.orgId, "estimator");
    const denied = await put(
      t,
      { machineId: s.mill, materialId: s.al, removalRateIn3PerMin: 4 },
      estimator,
    );
    expect(denied.status).toBe(403);
  });

  it("never reads or writes another shop's machines, materials or rates", async () => {
    const a = await setupTenant();
    const b = await setupTenant();
    const mine = await shop(a);
    const theirs = await shop(b);
    const crossMaterial = await put(b, {
      machineId: theirs.mill,
      materialId: mine.al,
      removalRateIn3PerMin: 4,
    });
    expect(crossMaterial.status).toBe(404);
    const crossMachine = await put(b, {
      machineId: mine.mill,
      materialId: theirs.al,
      removalRateIn3PerMin: 4,
    });
    expect(crossMachine.status).toBe(404);
    const row = await json<RemovalRateDto>(
      put(a, { machineId: mine.mill, materialId: mine.al, removalRateIn3PerMin: 4 }),
    );
    const del = await api(b.path(`/rate-card/removal-rates/${row.id}`), {
      method: "DELETE",
      as: b.userId,
    });
    expect(del.status).toBe(404);
    const bCard = await json<RateCardDto>(api(b.path("/rate-card"), { as: b.userId }));
    expect(bCard.removalRates).toEqual([]);
    const aCard = await json<RateCardDto>(api(a.path("/rate-card"), { as: a.userId }));
    expect(aCard.removalRates.map((r) => r.id)).toEqual([row.id]);
  });

  it("roughs a STEP part at the material's rate on the one machine that has one", async () => {
    const t = await setupTenant();
    const s = await shop(t);
    // The VMC has a default 2 in³/min; the Haas has a 6061 rate, which wins for a 6061 part.
    await json(put(t, { machineId: s.mill, materialId: s.al, removalRateIn3PerMin: 4 }));
    testFakes.geometry.set("BRK-1001.step", {
      format: "step",
      volumeIn3: 1.5,
      boundingBoxIn: { xIn: 3.9, yIn: 1, zIn: 0.5 },
      surfaceAreaIn2: null,
      holes: [],
      flat: null,
      confidence: { boundingBox: "high", volume: "high", holes: "high" },
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
        json: { confirmed: true, materialId: s.al },
      }),
    );
    const q = await json<QuoteDetailDto>(
      api(t.path("/quotes"), { method: "POST", as: t.userId, json: { rfqId: rfq.id } }),
      201,
    );
    // 0.75 × 1.25 × 4.25 = 3.984 in³ blank, 1.5 in³ part: 2.48 in³ at 4 in³/min = 0.62 -> 0.6 min
    const rough = q.lines[0]?.inputs.operations.find((o) => o.label.startsWith("Rough from CAD"));
    expect(rough).toEqual({
      machineId: s.mill,
      label: "Rough from CAD: 2.48 in³ removed at 4 in³/min (rate for Aluminum 6061-T6 plate)",
      setupMinutes: 0,
      cycleMinutesPerPart: 0.6,
    });
  });
});
