// The marketing site's /how-to-quote-cnc-machining guide prints a worked example priced by its own
// small copy of this app's arithmetic (apps/jobshop-site/src/site/quote-example.ts). This test prices
// the same made-up job with the real engine, so the page cannot drift from what the app would quote.
import { type CostInputs, computeCost, type RateCard } from "@shared/costing";
import { describe, expect, it } from "vitest";
import { EXAMPLE, priceExample } from "../../../jobshop-site/src/site/quote-example";

const e = EXAMPLE;
const card: RateCard = {
  laborMarkupBps: e.laborMarkupBps,
  materialMarkupBps: e.materialMarkupBps,
  outsideServiceMarkupBps: e.outsideServiceMarkupBps,
  minimumLineCents: e.minimumLineCents,
  machines: [
    { id: "mill", name: e.machineName, hourlyRateCents: e.hourlyRateCents, setupRateCents: null },
  ],
  materials: [
    {
      id: "al",
      name: e.materialName,
      pricingBasis: "per_lb",
      pricePerLbCents: e.pricePerLbCents,
      densityLbPerIn3: e.densityLbPerIn3,
      stockPriceCents: null,
      stockDescription: null,
      scrapBps: e.scrapBps,
      minChargeCents: e.materialMinChargeCents,
    },
  ],
  finishingOps: [
    {
      id: "anodize",
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
  material: { materialId: "al", blank: { shape: "rect", ...e.blank }, partsPerStock: null },
  operations: e.operations.map((o) => ({ machineId: "mill", ...o })),
  falloutBps: e.falloutBps,
  finishing: [{ opId: "anodize" }],
  extras: [],
};

describe("the site's quoting guide example", () => {
  it("prices to the same cent as the costing engine", () => {
    const outcome = computeCost(card, inputs);
    if (!outcome.ok) throw new Error(JSON.stringify(outcome.issues));
    const site = priceExample(e);
    expect(site.blankWeightLb).toBeCloseTo(outcome.result.blankWeightLb ?? 0, 9);
    expect(site.breaks).toEqual(
      outcome.result.breaks.map(({ extrasCents, ...rest }) => {
        expect(extrasCents).toBe(0);
        return rest;
      }),
    );
  });
});
