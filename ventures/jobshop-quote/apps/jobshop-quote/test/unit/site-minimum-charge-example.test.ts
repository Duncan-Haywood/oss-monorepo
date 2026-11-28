// The marketing site's /machine-shop-minimum-charge guide prints a made-up spacer, anodized and bare,
// priced by its own small copy of this app's arithmetic (apps/jobshop-site/src/site/rush-example.ts's
// priceLine). This test runs both lines through the real costing engine, so the page's material
// minimum, lot charge and line-minimum top-up cannot drift from what the app would quote.
import { type CostInputs, computeCost, type RateCard } from "@shared/costing";
import { describe, expect, it } from "vitest";
import { BARE_SPACER, SPACER } from "../../../jobshop-site/src/site/minimum-charge-example";
import { type LineSpec, priceLine } from "../../../jobshop-site/src/site/rush-example";

function engine(s: LineSpec, withFinish: boolean) {
  const card: RateCard = {
    laborMarkupBps: s.laborMarkupBps,
    materialMarkupBps: s.materialMarkupBps,
    outsideServiceMarkupBps: s.outsideServiceMarkupBps,
    minimumLineCents: s.minimumLineCents,
    machines: s.machines.map((m, i) => ({
      id: `m${i}`,
      name: m.name,
      hourlyRateCents: m.hourlyRateCents,
      setupRateCents: null,
    })),
    materials: [
      {
        id: "al",
        name: s.materialName,
        pricingBasis: "per_lb",
        pricePerLbCents: s.pricePerLbCents,
        densityLbPerIn3: s.densityLbPerIn3,
        stockPriceCents: null,
        stockDescription: null,
        scrapBps: s.scrapBps,
        minChargeCents: s.materialMinChargeCents,
      },
    ],
    finishingOps: [
      {
        id: "finish",
        name: s.finishing.name,
        perPartCents: s.finishing.perPartCents,
        lotChargeCents: s.finishing.lotChargeCents,
        outsideService: true,
      },
    ],
  };
  const inputs: CostInputs = {
    quantities: s.quantities,
    customerSuppliedMaterial: false,
    material: { materialId: "al", blank: { shape: "rect", ...s.blank }, partsPerStock: null },
    operations: s.operations.map((o) => ({
      machineId: `m${o.machine}`,
      label: o.label,
      setupMinutes: o.setupMinutes,
      cycleMinutesPerPart: o.cycleMinutesPerPart,
    })),
    falloutBps: s.falloutBps,
    finishing: withFinish ? [{ opId: "finish" }] : [],
    extras: [],
  };
  const outcome = computeCost(card, inputs);
  if (!outcome.ok) throw new Error(JSON.stringify(outcome.issues));
  return outcome.result.breaks;
}

describe("the site's minimum-charge guide example", () => {
  it("prices the anodized spacer to the same cent as the engine", () => {
    expect(priceLine(SPACER)).toEqual(engine(SPACER, true));
  });
  it("prices the bare spacer, line-minimum top-ups included, to the same cent as the engine", () => {
    const site = priceLine(BARE_SPACER);
    expect(site).toEqual(engine(BARE_SPACER, false));
    expect(site.some((b) => b.minimumAdjustmentCents > 0)).toBe(true);
  });
});
