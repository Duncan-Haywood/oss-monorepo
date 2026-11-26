// CAD geometry inside workerd: the real packages/cad-features adapter runs in the Worker runtime (no
// Node APIs), and a measured solid pre-fills the quote with a blank and a roughing operation.
import type { QuoteDetailDto, RfqDetailDto } from "@shared/api";
import { testFakes } from "@worker/context";
import { CadFeaturesGeometry } from "@worker/ports/geometry";
import { describe, expect, it } from "vitest";
import bracketStep from "../../../../packages/cad-features/test/fixtures/public/build123d-nema-17-bracket.step?raw";
import { RFQ_EMAIL } from "../fixtures/rfq";
import { api, json, seedRateCard, setupTenant } from "./helpers";

describe("CAD geometry in the Worker runtime", () => {
  it("measures a public STEP file with the real adapter", async () => {
    const bytes = new TextEncoder().encode(bracketStep);
    const g = await new CadFeaturesGeometry().extract({
      name: "bracket.step",
      bytes: bytes.buffer as ArrayBuffer,
    });
    expect(g?.boundingBoxIn).toEqual({ xIn: 1.378, yIn: 1.6142, zIn: 2.0079 });
    expect(g?.volumeIn3).toBeCloseTo(0.4309, 4);
    expect(g?.source).toBe("packages/cad-features@0.1.0");
  });

  it("pre-fills the blank, a roughing and a drilling operation from a measured solid", async () => {
    const t = await setupTenant();
    const rates = await seedRateCard(t);
    // The seeded mill has no measured removal rate; this one does, so it is the only candidate.
    const vmc = await json<{ id: string }>(
      api(t.path("/rate-card/machines"), {
        method: "POST",
        as: t.userId,
        json: {
          name: "Roughing VMC",
          kind: "mill_3axis",
          hourlyRateCents: 8_500,
          defaultSetupMinutes: 30,
          removalRateIn3PerMin: 2,
          secondsPerHole: 6,
        },
      }),
      201,
    );
    testFakes.geometry.set("BRK-1001.step", {
      format: "step",
      volumeIn3: 1.5,
      boundingBoxIn: { xIn: 3.9, yIn: 1, zIn: 0.5 },
      surfaceAreaIn2: null,
      holes: [],
      // two Ø0.257 in through holes, one counterbored; and a Ø1.5 in bore left to the estimator
      holeLocations: [
        { diametersIn: [0.257], depthIn: 0.5 },
        { diametersIn: [0.257, 0.4375], depthIn: 0.5 },
        { diametersIn: [1.5], depthIn: 0.5 },
      ],
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
        json: { confirmed: true },
      }),
    );
    const q = await json<QuoteDetailDto>(
      api(t.path("/quotes"), { method: "POST", as: t.userId, json: { rfqId: rfq.id } }),
      201,
    );
    const line = q.lines[0];
    expect(line?.inputs.material?.materialId).toBe(rates.al);
    // 0.75 × 1.25 × 4.25 = 3.984 in³ blank, 1.5 in³ part: 2.48 in³ removed at 2 in³/min ≈ 1.2 min
    expect(line?.inputs.operations).toEqual([
      {
        machineId: vmc.id,
        label: "Rough from CAD: 2.48 in³ removed at 2 in³/min",
        setupMinutes: 30,
        cycleMinutesPerPart: 1.2,
      },
      // same machine as the roughing: no second setup; 2 × 6 s = 0.2 min
      {
        machineId: vmc.id,
        label: "Drill from CAD: 2 holes × 6 s (1 stepped, 1 bore over 1 in left out)",
        setupMinutes: 0,
        cycleMinutesPerPart: 0.2,
      },
    ]);
  });

  it("times drilling by hole depth at the machine's drill feed, stored on the rate card", async () => {
    const t = await setupTenant();
    await seedRateCard(t);
    const vmc = await json<{ id: string }>(
      api(t.path("/rate-card/machines"), {
        method: "POST",
        as: t.userId,
        json: {
          name: "Drilling VMC",
          kind: "mill_3axis",
          hourlyRateCents: 8_500,
          defaultSetupMinutes: 20,
          secondsPerHole: 3,
        },
      }),
      201,
    );
    await json(
      api(t.path(`/rate-card/machines/${vmc.id}`), {
        method: "PATCH",
        as: t.userId,
        json: { drillFeedInPerMin: 4 },
      }),
    );
    const card = await json<{ machines: { id: string; drillFeedInPerMin: number | null }[] }>(
      api(t.path("/rate-card"), { as: t.userId }),
    );
    expect(card.machines.find((m) => m.id === vmc.id)?.drillFeedInPerMin).toBe(4);
    testFakes.geometry.set("BRK-1001.step", {
      format: "step",
      volumeIn3: null,
      boundingBoxIn: { xIn: 3.9, yIn: 1, zIn: 0.5 },
      surfaceAreaIn2: null,
      holes: [],
      holeLocations: [
        { diametersIn: [0.257], depthIn: 0.5 },
        { diametersIn: [0.257], depthIn: 1.5 },
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
        json: { confirmed: true },
      }),
    );
    const q = await json<QuoteDetailDto>(
      api(t.path("/quotes"), { method: "POST", as: t.userId, json: { rfqId: rfq.id } }),
      201,
    );
    // 2 × 3 s = 0.1 min; 0.5 + 1.5 = 2 in at 4 in/min = 0.5 min; 1.5 in > 3 × 0.257 is deep
    expect(q.lines[0]?.inputs.operations).toContainEqual({
      machineId: vmc.id,
      label: "Drill from CAD: 2 holes × 3 s + 2 in deep at 4 in/min (1 deep, over 3×D)",
      setupMinutes: 20,
      cycleMinutesPerPart: 0.6,
    });
  });

  it("adds peck time to deep holes from the machine's peck depth and seconds per peck", async () => {
    const t = await setupTenant();
    await seedRateCard(t);
    const vmc = await json<{ id: string }>(
      api(t.path("/rate-card/machines"), {
        method: "POST",
        as: t.userId,
        json: {
          name: "Drilling VMC",
          kind: "mill_3axis",
          hourlyRateCents: 8_500,
          defaultSetupMinutes: 20,
          secondsPerHole: 3,
        },
      }),
      201,
    );
    await json(
      api(t.path(`/rate-card/machines/${vmc.id}`), {
        method: "PATCH",
        as: t.userId,
        json: { drillFeedInPerMin: 4, peckDepthDiameters: 1, secondsPerPeck: 2 },
      }),
    );
    const card = await json<{
      machines: { id: string; peckDepthDiameters: number | null; secondsPerPeck: number | null }[];
    }>(api(t.path("/rate-card"), { as: t.userId }));
    expect(card.machines.find((m) => m.id === vmc.id)).toMatchObject({
      peckDepthDiameters: 1,
      secondsPerPeck: 2,
    });
    // a zero peck depth is refused, not stored
    await json(
      api(t.path(`/rate-card/machines/${vmc.id}`), {
        method: "PATCH",
        as: t.userId,
        json: { peckDepthDiameters: 0 },
      }),
      400,
    );
    testFakes.geometry.set("BRK-1001.step", {
      format: "step",
      volumeIn3: null,
      boundingBoxIn: { xIn: 3.9, yIn: 1, zIn: 0.5 },
      surfaceAreaIn2: null,
      holes: [],
      holeLocations: [
        { diametersIn: [0.257], depthIn: 0.5 },
        { diametersIn: [0.257], depthIn: 1.5 },
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
        json: { confirmed: true },
      }),
    );
    const q = await json<QuoteDetailDto>(
      api(t.path("/quotes"), { method: "POST", as: t.userId, json: { rfqId: rfq.id } }),
      201,
    );
    // 2 × 3 s = 0.1 min; 2 in at 4 in/min = 0.5 min; the 1.5 in hole is 5.84×D: six 1×D plunges,
    // 5 pecks × 2 s = 0.1667 min; 0.7667, up to 0.77
    expect(q.lines[0]?.inputs.operations).toContainEqual({
      machineId: vmc.id,
      label:
        "Drill from CAD: 2 holes × 3 s + 2 in deep at 4 in/min + 5 pecks × 2 s (1 deep, pecked every 1×D)",
      setupMinutes: 20,
      cycleMinutesPerPart: 0.77,
    });
  });

  it("adds a tapping operation for the hole sizes the estimator marks threaded", async () => {
    const t = await setupTenant();
    await seedRateCard(t);
    const vmc = await json<{ id: string; secondsPerTappedHole: number | null }>(
      api(t.path("/rate-card/machines"), {
        method: "POST",
        as: t.userId,
        json: {
          name: "Tapping VMC",
          kind: "mill_3axis",
          hourlyRateCents: 8_500,
          defaultSetupMinutes: 20,
          secondsPerHole: 3,
          secondsPerTappedHole: 6,
        },
      }),
      201,
    );
    expect(vmc.secondsPerTappedHole).toBe(6);
    testFakes.geometry.set("BRK-1001.step", {
      format: "step",
      volumeIn3: null,
      boundingBoxIn: { xIn: 3.9, yIn: 1, zIn: 0.5 },
      surfaceAreaIn2: null,
      holes: [],
      holeLocations: [
        { diametersIn: [0.201], depthIn: 0.5 },
        { diametersIn: [0.201], depthIn: 0.5 },
        { diametersIn: [0.201], depthIn: 0.5 },
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
    expect(brk?.tappedHoleDiametersIn).toEqual([]);
    const saved = await json<RfqDetailDto>(
      api(t.path(`/rfqs/${rfq.id}/parts/${brk?.id}`), {
        method: "PATCH",
        as: t.userId,
        json: { confirmed: true, tappedHoleDiametersIn: [0.201] },
      }),
    );
    expect(saved.parts.find((p) => p.id === brk?.id)?.tappedHoleDiametersIn).toEqual([0.201]);
    const q = await json<QuoteDetailDto>(
      api(t.path("/quotes"), { method: "POST", as: t.userId, json: { rfqId: rfq.id } }),
      201,
    );
    const ops = q.lines[0]?.inputs.operations ?? [];
    // drilling still times all four locations (the tap drills included); tapping adds 3 × 6 s and
    // shares the drilling op's setup on the same machine
    expect(ops).toContainEqual({
      machineId: vmc.id,
      label: "Drill from CAD: 4 holes × 3 s",
      setupMinutes: 20,
      cycleMinutesPerPart: 0.2,
    });
    expect(ops).toContainEqual({
      machineId: vmc.id,
      label: "Tap from CAD: 3 holes × 6 s (3× Ø0.201)",
      setupMinutes: 0,
      cycleMinutesPerPart: 0.3,
    });
    // a diameter outside the schema's range is refused
    await json(
      api(t.path(`/rfqs/${rfq.id}/parts/${brk?.id}`), {
        method: "PATCH",
        as: t.userId,
        json: { tappedHoleDiametersIn: [-1] },
      }),
      400,
    );
  });

  it("pre-fills a cut and a bend operation from a DXF flat pattern", async () => {
    const t = await setupTenant();
    await seedRateCard(t);
    const machine = (body: Record<string, unknown>) =>
      json<{ id: string; cutSpeedInPerMin: number | null }>(
        api(t.path("/rate-card/machines"), { method: "POST", as: t.userId, json: body }),
        201,
      );
    const laser = await machine({
      name: "Fiber laser",
      kind: "laser",
      hourlyRateCents: 15_000,
      defaultSetupMinutes: 15,
      cutSpeedInPerMin: 300,
      pierceSeconds: 1.5,
    });
    expect(laser.cutSpeedInPerMin).toBe(300);
    const brake = await machine({
      name: "Press brake",
      kind: "press_brake",
      hourlyRateCents: 8_500,
      defaultSetupMinutes: 20,
      secondsPerBend: 8,
    });
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
        bendLineCount: 2,
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
        json: { confirmed: true },
      }),
    );
    const q = await json<QuoteDetailDto>(
      api(t.path("/quotes"), { method: "POST", as: t.userId, json: { rfqId: rfq.id } }),
      201,
    );
    const line = q.lines[0];
    // A flat pattern has no thickness and this material has no sheet thickness: no blank is guessed.
    expect(line?.inputs.material?.blank ?? null).toBeNull();
    expect(line?.inputs.operations).toEqual([
      {
        machineId: laser.id,
        label: "Cut from DXF: 84.3 in at 300 in/min + 5 pierces × 1.5 s",
        setupMinutes: 15,
        cycleMinutesPerPart: 0.41,
      },
      {
        machineId: brake.id,
        label: "Bend from DXF: 2 bend lines × 8 s",
        setupMinutes: 20,
        cycleMinutesPerPart: 0.27,
      },
    ]);
  });

  it("sizes a sheet blank from a DXF flat pattern and the material's sheet thickness", async () => {
    const t = await setupTenant();
    await seedRateCard(t);
    const sheet = await json<{ id: string; sheetThicknessIn: number | null }>(
      api(t.path("/rate-card/materials"), {
        method: "POST",
        as: t.userId,
        json: {
          name: "6061-T6 sheet, 0.125",
          pricingBasis: "per_lb",
          pricePerLbCents: 500,
          densityLbPerIn3: 0.0975,
          sheetThicknessIn: 0.125,
          scrapBps: 2_000,
        },
      }),
      201,
    );
    expect(sheet.sheetThicknessIn).toBe(0.125);
    testFakes.geometry.set("BRK-1001.dxf", {
      format: "dxf",
      volumeIn3: null,
      boundingBoxIn: { xIn: 4.06, yIn: 2, zIn: 0 },
      surfaceAreaIn2: null,
      holes: [],
      flat: {
        blankIn: { widthIn: 4.06, heightIn: 2 },
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
        json: { confirmed: true, materialId: sheet.id },
      }),
    );
    const q = await json<QuoteDetailDto>(
      api(t.path("/quotes"), { method: "POST", as: t.userId, json: { rfqId: rfq.id } }),
      201,
    );
    const line = q.lines[0];
    expect(line?.inputs.material).toMatchObject({
      materialId: sheet.id,
      blank: { shape: "rect", lengthIn: 4.125, widthIn: 2, thicknessIn: 0.125 },
    });
    // The material no longer blocks pricing: the blank's weight comes from the card's density.
    expect(line?.issues.map((i) => i.code)).not.toContain("material_needs_blank");
  });
});
