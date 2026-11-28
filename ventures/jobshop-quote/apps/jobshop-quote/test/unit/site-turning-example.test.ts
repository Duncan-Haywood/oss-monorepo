// The marketing site's /how-to-quote-cnc-turning guide prints a worked example priced by its own small
// copy of this app's arithmetic (apps/jobshop-site/src/site/turning-example.ts). This test runs the
// same made-up turned pin through the real costing engine (round bar priced by the foot, bought in
// 12 ft bars with a remnant and a cut allowance, whole bars charged; typed operation times; fallout;
// an outside passivation), and again with the bar charged by the length used, so the page cannot
// drift from what the app would quote. The lathe times are the estimator's own arithmetic, which the
// app does not compute; they are checked here against the formulas the page prints.
import { barStockUse, type CostInputs, computeCost, type RateCard } from "@shared/costing";
import { describe, expect, it } from "vitest";
import {
  cutMinutes,
  EXAMPLE,
  partsPerBar,
  priceTurningExample,
  roughPasses,
  rpmFor,
} from "../../../jobshop-site/src/site/turning-example";

const e = EXAMPLE;
const ids = e.machines.map((_, i) => `m${i}`);

function card(bar: boolean): RateCard {
  return {
    laborMarkupBps: e.laborMarkupBps,
    materialMarkupBps: e.materialMarkupBps,
    outsideServiceMarkupBps: e.outsideServiceMarkupBps,
    minimumLineCents: e.minimumLineCents,
    machines: e.machines.map((m, i) => ({
      id: ids[i] as string,
      name: m.name,
      hourlyRateCents: m.hourlyRateCents,
      setupRateCents: null,
    })),
    materials: [
      {
        id: "bar",
        name: e.materialName,
        pricingBasis: "per_ft",
        pricePerLbCents: null,
        densityLbPerIn3: null,
        stockPriceCents: null,
        stockDescription: e.stockDescription,
        pricePerFootCents: e.pricePerFootCents,
        cutAllowanceIn: e.cutAllowanceIn,
        barLengthIn: bar ? e.barLengthIn : null,
        barRemnantIn: bar ? e.barRemnantIn : null,
        scrapBps: 0,
        minChargeCents: 0,
      },
    ],
    finishingOps: [
      {
        id: "passivate",
        name: e.finishingName,
        perPartCents: e.finishingPerPartCents,
        lotChargeCents: e.finishingLotChargeCents,
        outsideService: true,
      },
    ],
  };
}

describe("the site's CNC turning guide example", () => {
  const site = priceTurningExample(e);
  const inputs: CostInputs = {
    quantities: e.quantities,
    customerSuppliedMaterial: false,
    material: {
      materialId: "bar",
      blank: { shape: "round", diameterIn: e.barDiameterIn, lengthIn: e.partLengthIn },
      partsPerStock: null,
    },
    operations: site.operations.map((o) => ({
      machineId: ids[o.machine] as string,
      label: o.label,
      setupMinutes: o.setupMinutes,
      cycleMinutesPerPart: o.cycleMinutesPerPart,
    })),
    falloutBps: e.falloutBps,
    finishing: [{ opId: "passivate" }],
    extras: [],
  };

  it("times the lathe cuts by the formulas the page prints", () => {
    expect(rpmFor(400, 1.25)).toBeCloseTo((400 * 12) / (Math.PI * 1.25), 12);
    expect(roughPasses(1.25, 1, 0.01, 0.06)).toBe(2); // 0.115 in radial at 0.06 a pass
    expect(roughPasses(1.25, 1, 0.005, 0.06)).toBe(2); // exactly 0.12: no float-error third pass
    expect(roughPasses(1.25, 1.24, 0.01, 0.06)).toBe(0);
    for (const c of site.cuts) {
      expect(c.minutes).toBeCloseTo(cutMinutes(c), 12);
      expect(c.minutes).toBeCloseTo((c.passes * c.lengthIn) / (c.iprIn * c.rpm), 12);
    }
    const sum = site.cuts.reduce((s, c) => s + c.minutes, 0) + e.handlingMinutesPerPart;
    expect(site.cycleMinutesExact).toBeCloseTo(sum, 12);
    expect(site.cycleMinutes).toBeGreaterThanOrEqual(site.cycleMinutesExact);
    expect(site.cycleMinutes - site.cycleMinutesExact).toBeLessThan(0.01);
  });

  it("counts parts per bar the way the engine does", () => {
    const use = barStockUse(card(true).materials[0] as never, e.partLengthIn);
    expect(site.cutLengthIn).toBe(use.cutLengthIn);
    expect(site.partsPerBar).toBe(use.partsPerBar);
    expect(partsPerBar(144, 0, 2.875, 0.125)).toBe(48); // exact fit, no float loss
  });

  it("prices whole bars to the same cent as the costing engine", () => {
    const outcome = computeCost(card(true), inputs);
    if (!outcome.ok) throw new Error(JSON.stringify(outcome.issues));
    expect(site.breaks).toEqual(outcome.result.breaks);
  });

  it("prices the length used to the same cent as the costing engine", () => {
    const outcome = computeCost(card(false), inputs);
    if (!outcome.ok) throw new Error(JSON.stringify(outcome.issues));
    expect(site.lengthUsedBreaks).toEqual(outcome.result.breaks);
  });
});
