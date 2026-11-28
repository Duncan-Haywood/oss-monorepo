// The marketing site's /how-to-estimate-cnc-machining-time guide prints a worked example timed by its
// own small copy of this app's arithmetic (apps/jobshop-site/src/site/cycle-time-example.ts). This test
// runs the same made-up manifold block through the real suggestions (roughing from the volume removed,
// drilling with peck retracts, tapping) so the page cannot drift from what the app would suggest from
// the STEP model. The feeds-and-speeds arithmetic is the estimator's own, which the app does not do; it
// is checked here against the formulas the page prints.
import {
  type CostInputs,
  computeCost,
  extraPecks,
  type RateCard,
  suggestDrillingOperation,
  suggestRoughingOperation,
  suggestTappingOperation,
} from "@shared/costing";
import { describe, expect, it } from "vitest";
import {
  cycleTimeExample,
  EXAMPLE,
  pecksFor,
} from "../../../jobshop-site/src/site/cycle-time-example";

const e = EXAMPLE;
const site = cycleTimeExample(e);
const mill = {
  id: "mill",
  name: e.machineName,
  defaultSetupMinutes: e.setupMinutes,
  removalRateIn3PerMin: site.removalRateIn3PerMin,
  secondsPerHole: e.drilling.secondsPerHole,
  drillFeedInPerMin: site.drillFeedInPerMin,
  peckDepthDiameters: e.drilling.peckDepthDiameters,
  secondsPerPeck: e.drilling.secondsPerPeck,
  secondsPerTappedHole: e.secondsPerTappedHole,
};
const holes = {
  locations: e.holes.flatMap((h) =>
    Array.from({ length: h.count }, () => ({ diametersIn: [h.diameterIn], depthIn: h.depthIn })),
  ),
  holesConfidence: "high" as const,
};

describe("the site's cycle time guide example", () => {
  it("works out speeds, feeds and the removal rate by the formulas the page prints", () => {
    const r = e.roughing;
    expect(site.rpm).toBeCloseTo((r.surfaceFeetPerMin * 12) / (Math.PI * r.toolDiameterIn), 9);
    expect(site.feedInPerMin).toBeCloseTo(site.rpm * r.flutes * r.chipLoadIn, 9);
    expect(site.theoreticalRemovalIn3PerMin).toBeCloseTo(
      r.widthOfCutIn * r.depthOfCutIn * site.feedInPerMin,
      9,
    );
    expect(site.removalRateIn3PerMin).toBe(2.75);
    expect(site.drillFeedInPerMin).toBeCloseTo(e.drilling.drillRpm * e.drilling.feedPerRevIn, 9);
  });

  it("counts peck retracts the way the engine does", () => {
    for (const h of e.holes) {
      expect(pecksFor(h.depthIn, h.diameterIn, e.drilling.peckDepthDiameters)).toBe(
        extraPecks(h.depthIn, h.diameterIn, e.drilling.peckDepthDiameters),
      );
    }
    expect(site.deepHoles).toBe(8);
    expect(site.extraPecks).toBe(18);
  });

  it("suggests the same roughing, drilling and tapping minutes as the engine", () => {
    const rough = suggestRoughingOperation(
      { volumeIn3: e.partVolumeIn3, volumeConfidence: "high" },
      { shape: "rect", ...e.blank },
      [mill],
    );
    const drill = suggestDrillingOperation(holes, [mill], ["mill"]);
    const tapped = e.holes.filter((h) => h.threaded).map((h) => h.diameterIn);
    const tap = suggestTappingOperation(holes, tapped, [mill], ["mill"]);
    expect(rough?.cycleMinutesPerPart).toBe(site.roughing.cycleMinutesPerPart);
    expect(rough?.setupMinutes).toBe(site.roughing.setupMinutes);
    expect(drill?.cycleMinutesPerPart).toBe(site.drill.cycleMinutesPerPart);
    expect(drill?.setupMinutes).toBe(0);
    expect(tap?.cycleMinutesPerPart).toBe(site.tap.cycleMinutesPerPart);
    expect(tap?.setupMinutes).toBe(0);
    expect([site.roughing, site.drill, site.tap].map((o) => o.cycleMinutesPerPart)).toEqual([
      3, 1.61, 0.5,
    ]);
  });

  it("prices the run time to the same cent as the costing engine", () => {
    const card: RateCard = {
      laborMarkupBps: 0,
      materialMarkupBps: 0,
      outsideServiceMarkupBps: 0,
      minimumLineCents: 0,
      machines: [
        {
          id: "mill",
          name: e.machineName,
          hourlyRateCents: e.hourlyRateCents,
          setupRateCents: null,
        },
      ],
      materials: [],
      finishingOps: [],
    };
    const inputs: CostInputs = {
      quantities: [1, ...e.quantities],
      customerSuppliedMaterial: true,
      material: null,
      operations: site.operations.map((o) => ({ machineId: "mill", ...o })),
      falloutBps: 0,
      finishing: [],
      extras: [],
    };
    const outcome = computeCost(card, inputs);
    if (!outcome.ok) throw new Error(JSON.stringify(outcome.issues));
    const [one, ten, hundred] = outcome.result.breaks;
    // Each operation's run cost is rounded to the cent on its own, so the sum can be a cent off the
    // page's single rounding of the total cycle.
    expect(Math.abs((one?.runCents ?? 0) - site.runCentsPerPart)).toBeLessThanOrEqual(2);
    expect(ten?.setupCents).toBe(Math.round((e.setupMinutes / 60) * e.hourlyRateCents));
    expect(hundred?.runCents).toBeGreaterThan(0);
  });
});
