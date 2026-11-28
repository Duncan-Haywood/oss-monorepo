// The marketing site's /how-to-quote-welding guide prints a worked example priced by its own small
// copy of this app's arithmetic (apps/jobshop-site/src/site/welding-example.ts). This test runs the
// same made-up weldment through the real costing engine (tube priced by the foot with scrap, typed
// operation times, consumables as an extra, an outside powder coat), so the page cannot drift from
// what the app would quote. The weld, saw and consumables times are the estimator's own arithmetic,
// which the app does not compute; they are checked here against the formulas the page prints.
import { type CostInputs, computeCost, type RateCard } from "@shared/costing";
import { describe, expect, it } from "vitest";
import {
  EXAMPLE,
  filletAreaIn2,
  priceWeldingExample,
  STEEL_LB_PER_IN3,
} from "../../../jobshop-site/src/site/welding-example";

const e = EXAMPLE;
const ids = e.machines.map((_, i) => `m${i}`);

describe("the site's welding guide example", () => {
  const site = priceWeldingExample(e);

  it("times the weld, the saw and the consumables by the formulas the page prints", () => {
    expect(site.arcMinutes).toBeCloseTo(e.weld.lengthIn / e.weld.travelInPerMin, 12);
    expect(site.weldMinutesExact).toBeCloseTo(
      site.arcMinutes / (e.weld.operatorFactorBps / 10_000),
      12,
    );
    expect(site.weldMinutes).toBeGreaterThanOrEqual(site.weldMinutesExact);
    expect(site.weldMinutes - site.weldMinutesExact).toBeLessThan(0.01);
    expect(site.sawMinutes).toBe(e.tube.pieces * e.saw.minutesPerCut);
    expect(filletAreaIn2(0.25)).toBe(0.03125);
    expect(site.weldMetalLb).toBeCloseTo(
      ((e.weld.legIn * e.weld.legIn) / 2) * e.weld.lengthIn * STEEL_LB_PER_IN3,
      12,
    );
    expect(site.wireLb).toBeGreaterThan(site.weldMetalLb);
    expect(site.consumablesCents).toBe(Math.round(site.wireCents + site.gasCents));
  });

  it("prices to the same cent as the costing engine", () => {
    const card: RateCard = {
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
          id: "tube",
          name: e.materialName,
          pricingBasis: "per_ft",
          pricePerLbCents: null,
          densityLbPerIn3: null,
          stockPriceCents: null,
          stockDescription: e.tube.description,
          pricePerFootCents: e.pricePerFootCents,
          cutAllowanceIn: 0,
          barLengthIn: null,
          barRemnantIn: null,
          scrapBps: e.scrapBps,
          minChargeCents: 0,
        },
      ],
      finishingOps: [
        {
          id: "powder",
          name: e.finishingName,
          perPartCents: e.finishingPerPartCents,
          lotChargeCents: e.finishingLotChargeCents,
          outsideService: true,
        },
      ],
    };
    const inputs: CostInputs = {
      quantities: e.quantities,
      customerSuppliedMaterial: false,
      // The frame's whole cut list as one length: the engine prices per_ft on the blank's length.
      material: {
        materialId: "tube",
        blank: { shape: "rect", lengthIn: e.tube.totalLengthIn, widthIn: 2, thicknessIn: 2 },
        partsPerStock: null,
      },
      operations: site.operations.map((o) => ({
        machineId: ids[o.machine] as string,
        label: o.label,
        setupMinutes: o.setupMinutes,
        cycleMinutesPerPart: o.cycleMinutesPerPart,
      })),
      falloutBps: e.falloutBps,
      finishing: [{ opId: "powder" }],
      extras: [{ label: "Wire and gas", perPartCents: site.consumablesCents, lotCents: 0 }],
    };
    const outcome = computeCost(card, inputs);
    if (!outcome.ok) throw new Error(JSON.stringify(outcome.issues));
    expect(site.breaks).toEqual(outcome.result.breaks);
  });
});
