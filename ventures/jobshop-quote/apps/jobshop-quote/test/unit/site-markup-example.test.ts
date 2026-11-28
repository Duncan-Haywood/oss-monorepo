// The marketing site's /machine-shop-markup guide prices the CNC guide's made-up bracket under four
// markup policies with its own small copy of this app's arithmetic
// (apps/jobshop-site/src/site/markup-example.ts). This test prices every policy with the real costing
// engine, so the page cannot drift from what the app would quote, and checks the markup split and the
// markup/margin conversions the page prints.
import { type CostInputs, computeCost, type RateCard } from "@shared/costing";
import { describe, expect, it } from "vitest";
import {
  jobFor,
  marginFromMarkup,
  markupFromMargin,
  POLICIES,
  pricePolicy,
  RATE_COST_CENTS,
  TABLE_MARGINS,
  TABLE_MARKUPS,
} from "../../../jobshop-site/src/site/markup-example";

describe("the site's markup guide", () => {
  it("converts markup and margin both ways", () => {
    expect(marginFromMarkup(0.25)).toBeCloseTo(0.2, 12);
    expect(markupFromMargin(0.2)).toBeCloseTo(0.25, 12);
    for (const m of TABLE_MARKUPS) expect(markupFromMargin(marginFromMarkup(m))).toBeCloseTo(m, 12);
    for (const g of TABLE_MARGINS) expect(marginFromMarkup(markupFromMargin(g))).toBeCloseTo(g, 12);
    expect(TABLE_MARKUPS.length).toBe(TABLE_MARGINS.length);
  });

  it("uses the hourly-rate guide's cost of a billable hour", () => {
    // $123.85 is that guide's rate at a 20% margin; its cost is the rate × 0.8 to the cent.
    expect(RATE_COST_CENTS).toBe(9_908);
  });

  for (const policy of POLICIES) {
    it(`prices "${policy.label}" to the same cent as the costing engine`, () => {
      const e = jobFor(policy);
      const card: RateCard = {
        laborMarkupBps: e.laborMarkupBps,
        materialMarkupBps: e.materialMarkupBps,
        outsideServiceMarkupBps: e.outsideServiceMarkupBps,
        minimumLineCents: e.minimumLineCents,
        machines: [
          {
            id: "mill",
            name: e.machineName,
            hourlyRateCents: e.hourlyRateCents,
            setupRateCents: null,
          },
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
      const outcome = computeCost(card, inputs);
      if (!outcome.ok) throw new Error(JSON.stringify(outcome.issues));
      const site = pricePolicy(policy);
      site.breaks.forEach((b, i) => {
        const engine = outcome.result.breaks[i];
        if (!engine) throw new Error("missing break");
        expect(engine.extrasCents).toBe(0);
        const { extrasCents: _x, ...rest } = engine;
        expect({
          quantity: b.quantity,
          starts: b.starts,
          materialCents: b.materialCents,
          setupCents: b.setupCents,
          runCents: b.runCents,
          finishingCents: b.finishingCents,
          costCents: b.costCents,
          markupCents: b.markupCents,
          minimumAdjustmentCents: b.minimumAdjustmentCents,
          unitPriceCents: b.unitPriceCents,
          totalCents: b.totalCents,
        }).toEqual(rest);
        // The page's split of the markup adds up to the engine's markup.
        expect(b.materialMarkupCents + b.laborMarkupCents + b.outsideMarkupCents).toBe(
          engine.markupCents,
        );
        expect(b.fullCostCents).toBeLessThanOrEqual(b.costCents);
      });
    });
  }

  it("prices the rate-at-cost policy within a cent a part of the guide's card", () => {
    const [split, atCost] = POLICIES.map((p) => pricePolicy(p));
    split?.breaks.forEach((b, i) => {
      const other = atCost?.breaks[i];
      expect(Math.abs((other?.unitPriceCents ?? 0) - b.unitPriceCents)).toBeLessThanOrEqual(1);
    });
  });
});
