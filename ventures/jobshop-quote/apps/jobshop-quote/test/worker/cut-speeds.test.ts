// Cut speed per material and thickness: the rate-card rows, their tenant and role checks, and a
// DXF quote timed at the material's speed on the one machine that has one.
import type { CutSpeedDto, QuoteDetailDto, RateCardDto, RfqDetailDto } from "@shared/api";
import { testFakes } from "@worker/context";
import { describe, expect, it } from "vitest";
import { RFQ_EMAIL } from "../fixtures/rfq";
import { addMember, api, json, seedRateCard, setupTenant } from "./helpers";

type Tenant = Awaited<ReturnType<typeof setupTenant>>;

async function cutters(t: Tenant) {
  const post = <T>(p: string, body: unknown) =>
    json<T>(api(t.path(`/rate-card${p}`), { method: "POST", as: t.userId, json: body }), 201);
  const laser = await post<{ id: string }>("/machines", {
    name: "Fiber laser",
    kind: "laser",
    hourlyRateCents: 15_000,
    defaultSetupMinutes: 15,
    cutSpeedInPerMin: 300,
    pierceSeconds: 1.5,
  });
  const plasma = await post<{ id: string }>("/machines", {
    name: "Plasma table",
    kind: "plasma",
    hourlyRateCents: 11_000,
    defaultSetupMinutes: 10,
    cutSpeedInPerMin: 120,
    pierceSeconds: 1,
  });
  const plate = await post<{ id: string }>("/materials", {
    name: "A36 plate 0.5 in",
    pricingBasis: "per_lb",
    pricePerLbCents: 90,
    densityLbPerIn3: 0.2836,
    sheetThicknessIn: 0.5,
  });
  return { laser, plasma, plate };
}

const put = (t: Tenant, body: unknown, as = t.userId) =>
  api(t.path("/rate-card/cut-speeds"), { method: "PUT", as, json: body });

describe("cut speeds by material", () => {
  it("saves one speed per machine and material, replacing it on a second save", async () => {
    const t = await setupTenant();
    const { laser, plate } = await cutters(t);
    const first = await json<CutSpeedDto>(
      put(t, { machineId: laser.id, materialId: plate.id, cutSpeedInPerMin: 40 }),
    );
    expect(first).toMatchObject({ cutSpeedInPerMin: 40, pierceSeconds: null });
    const again = await json<CutSpeedDto>(
      put(t, { machineId: laser.id, materialId: plate.id, cutSpeedInPerMin: 45, pierceSeconds: 4 }),
    );
    expect(again.id).toBe(first.id);
    const card = await json<RateCardDto>(api(t.path("/rate-card"), { as: t.userId }));
    expect(card.cutSpeeds).toEqual([
      {
        id: first.id,
        machineId: laser.id,
        materialId: plate.id,
        cutSpeedInPerMin: 45,
        pierceSeconds: 4,
      },
    ]);
    const del = await api(t.path(`/rate-card/cut-speeds/${first.id}`), {
      method: "DELETE",
      as: t.userId,
    });
    expect(del.status).toBe(204);
    const after = await json<RateCardDto>(api(t.path("/rate-card"), { as: t.userId }));
    expect(after.cutSpeeds).toEqual([]);
  });

  it("refuses a mill, a zero speed, and an estimator", async () => {
    const t = await setupTenant();
    const { mill } = await seedRateCard(t);
    const { plate, laser } = await cutters(t);
    const bad = await put(t, { machineId: mill, materialId: plate.id, cutSpeedInPerMin: 40 });
    expect(bad.status).toBe(400);
    const zero = await put(t, { machineId: laser.id, materialId: plate.id, cutSpeedInPerMin: 0 });
    expect(zero.status).toBe(400);
    const estimator = await addMember(t.orgId, "estimator");
    const denied = await put(
      t,
      { machineId: laser.id, materialId: plate.id, cutSpeedInPerMin: 40 },
      estimator,
    );
    expect(denied.status).toBe(403);
  });

  it("never reads or writes another shop's machines, materials or speeds", async () => {
    const a = await setupTenant();
    const b = await setupTenant();
    const mine = await cutters(a);
    const theirs = await cutters(b);
    // b's own machine with a's material, and a's machine with b's material: both not found for b
    const crossMaterial = await put(b, {
      machineId: theirs.laser.id,
      materialId: mine.plate.id,
      cutSpeedInPerMin: 40,
    });
    expect(crossMaterial.status).toBe(404);
    const crossMachine = await put(b, {
      machineId: mine.laser.id,
      materialId: theirs.plate.id,
      cutSpeedInPerMin: 40,
    });
    expect(crossMachine.status).toBe(404);
    const row = await json<CutSpeedDto>(
      put(a, { machineId: mine.laser.id, materialId: mine.plate.id, cutSpeedInPerMin: 40 }),
    );
    const del = await api(b.path(`/rate-card/cut-speeds/${row.id}`), {
      method: "DELETE",
      as: b.userId,
    });
    expect(del.status).toBe(404);
    const bCard = await json<RateCardDto>(api(b.path("/rate-card"), { as: b.userId }));
    expect(bCard.cutSpeeds).toEqual([]);
    const aCard = await json<RateCardDto>(api(a.path("/rate-card"), { as: a.userId }));
    expect(aCard.cutSpeeds.map((s) => s.id)).toEqual([row.id]);
  });

  it("times a DXF part at the material's speed on the one machine that has one", async () => {
    const t = await setupTenant();
    await seedRateCard(t);
    const { plasma, plate } = await cutters(t);
    await json(
      put(t, {
        machineId: plasma.id,
        materialId: plate.id,
        cutSpeedInPerMin: 80,
        pierceSeconds: 3,
      }),
    );
    testFakes.geometry.set("BRK-1001.dxf", {
      format: "dxf",
      volumeIn3: null,
      boundingBoxIn: { xIn: 4, yIn: 2, zIn: 0 },
      surfaceAreaIn2: null,
      holes: [],
      flat: {
        blankIn: { widthIn: 4, heightIn: 2 },
        netAreaIn2: 7.9,
        cutLengthIn: 84.25,
        pierceCount: 5,
        bendLineCount: 0,
      },
      confidence: { boundingBox: "high", volume: "high", holes: "high", bends: "high" },
      flags: [],
      source: "fake",
    });
    const form = new FormData();
    form.set("bodyText", RFQ_EMAIL);
    form.append("files", new File(["0\nSECTION"], "BRK-1001.dxf"));
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
        json: { confirmed: true, materialId: plate.id },
      }),
    );
    const q = await json<QuoteDetailDto>(
      api(t.path("/quotes"), { method: "POST", as: t.userId, json: { rfqId: rfq.id } }),
      201,
    );
    // Laser and plasma both have a default speed, so without the plate row nothing would be
    // suggested. 84.25 / 80 = 1.0531 min + 5 × 3 s = 0.25 min -> 1.3031, rounded up to 1.31.
    const cut = q.lines[0]?.inputs.operations.find((o) => o.label.startsWith("Cut from DXF"));
    expect(cut).toEqual({
      machineId: plasma.id,
      label: "Cut from DXF: 84.3 in at 80 in/min + 5 pierces × 3 s (rate for A36 plate 0.5 in)",
      setupMinutes: 10,
      cycleMinutesPerPart: 1.31,
    });
  });
});

describe("cut-speed import", () => {
  const imp = (t: Tenant, rows: unknown, as = t.userId) =>
    api(t.path("/rate-card/cut-speeds/import"), { method: "POST", as, json: { rows } });
  const card = (t: Tenant) => json<RateCardDto>(api(t.path("/rate-card"), { as: t.userId }));

  it("adds and updates speeds by machine and material name, all in one save", async () => {
    const t = await setupTenant();
    const { laser, plasma, plate } = await cutters(t);
    const first = await json<CutSpeedDto>(
      put(t, { machineId: laser.id, materialId: plate.id, cutSpeedInPerMin: 40, pierceSeconds: 2 }),
    );
    const res = await json(
      imp(t, [
        {
          row: 2,
          values: { machine: "fiber laser", material: "a36 plate 0.5 in", cutSpeedInPerMin: 45 },
        },
        {
          row: 3,
          values: { machine: "Plasma table", material: "A36 plate 0.5 in", cutSpeedInPerMin: 80 },
        },
      ]),
    );
    expect(res).toEqual({ created: 1, updated: 1 });
    const after = await card(t);
    expect(after.cutSpeeds.find((s) => s.id === first.id)).toMatchObject({
      cutSpeedInPerMin: 45,
      pierceSeconds: 2, // the sheet had no pierce: the saved one stays
    });
    expect(after.cutSpeeds.find((s) => s.machineId === plasma.id)).toMatchObject({
      materialId: plate.id,
      cutSpeedInPerMin: 80,
      pierceSeconds: null,
    });
    // The same sheet again writes nothing.
    const again = await json(
      imp(t, [
        {
          row: 2,
          values: { machine: "Fiber laser", material: "A36 plate 0.5 in", cutSpeedInPerMin: 45 },
        },
      ]),
    );
    expect(again).toEqual({ created: 0, updated: 0 });
  });

  it("saves nothing when one row is wrong, and names it", async () => {
    const t = await setupTenant();
    const { mill } = await seedRateCard(t);
    expect(mill).toBeTruthy();
    await cutters(t);
    const res = await imp(t, [
      {
        row: 2,
        values: { machine: "Fiber laser", material: "A36 plate 0.5 in", cutSpeedInPerMin: 45 },
      },
      {
        row: 3,
        values: { machine: "Waterjet", material: "A36 plate 0.5 in", cutSpeedInPerMin: 20 },
      },
    ]);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error?: { details?: unknown } } & Record<string, unknown>;
    expect(JSON.stringify(body)).toContain('no machine named \\"Waterjet\\"');
    expect((await card(t)).cutSpeeds).toEqual([]);
  });

  it("is for admins, and never matches another shop's machines or materials", async () => {
    const a = await setupTenant();
    const b = await setupTenant();
    await cutters(a);
    const estimator = await addMember(a.orgId, "estimator");
    const row = {
      row: 2,
      values: { machine: "Fiber laser", material: "A36 plate 0.5 in", cutSpeedInPerMin: 45 },
    };
    expect((await imp(a, [row], estimator)).status).toBe(403);
    // b has no machines: a's names do not resolve for b.
    expect((await imp(b, [row])).status).toBe(400);
    expect((await card(a)).cutSpeeds).toEqual([]);
    expect((await card(b)).cutSpeeds).toEqual([]);
  });
});
