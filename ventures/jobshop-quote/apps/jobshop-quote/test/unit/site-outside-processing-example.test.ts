// The marketing site's /how-to-quote-outside-processing guide prints a worked example priced by its
// own small copy of this app's arithmetic (apps/jobshop-site/src/site/outside-processing-example.ts).
// This test runs the same made-up steel block through the real costing engine (4140 per lb on the
// blank weight with scrap and a minimum; typed operation times; fallout; a per-lb heat treat turned
// into a per-part charge with a lot minimum, a black oxide with its own lot minimum, both marked up as
// outside services; freight and a certificate as extras), and again as the "naive" quote (per-part
// vendor prices only), so the page cannot drift from what the app would quote.
import { type CostInputs, computeCost, type RateCard } from "@shared/costing";
import { describe, expect, it } from "vitest";
import {
  crossoverStarts,
  EXAMPLE,
  perLbPrice,
  priceOutsideExample,
} from "../../../jobshop-site/src/site/outside-processing-example";

const e = EXAMPLE;
const ids = e.machines.map((_, i) => `m${i}`);
const site = priceOutsideExample(e);

function card(naive: boolean): RateCard {
  return {
    laborMarkupBps: e.laborMarkupBps,
    materialMarkupBps: e.materialMarkupBps,
    outsideServiceMarkupBps: naive ? 0 : e.outsideServiceMarkupBps,
    minimumLineCents: e.minimumLineCents,
    machines: e.machines.map((m, i) => ({
      id: ids[i] as string,
      name: m.name,
      hourlyRateCents: m.hourlyRateCents,
      setupRateCents: null,
    })),
    materials: [
      {
        id: "plate",
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
    finishingOps: site.services.map((v, i) => ({
      id: `out${i}`,
      name: v.name,
      perPartCents: v.perPartCents,
      lotChargeCents: naive ? 0 : v.lotChargeCents,
      outsideService: true,
    })),
  };
}

function inputs(naive: boolean): CostInputs {
  return {
    quantities: e.quantities,
    customerSuppliedMaterial: false,
    material: { materialId: "plate", blank: { shape: "rect", ...e.blank }, partsPerStock: null },
    operations: e.operations.map((o) => ({
      machineId: ids[o.machine] as string,
      label: o.label,
      setupMinutes: o.setupMinutes,
      cycleMinutesPerPart: o.cycleMinutesPerPart,
    })),
    falloutBps: e.falloutBps,
    finishing: site.services.map((_, i) => ({ opId: `out${i}` })),
    extras: naive
      ? []
      : e.extras.map((x) => ({ label: x.label, perPartCents: 0, lotCents: x.lotCents })),
  };
}

describe("the site's outside processing guide example", () => {
  it("turns the per-lb heat treat into a per-part charge", () => {
    expect(perLbPrice(2.1, 85)).toBe(179);
    expect(site.services[0]?.perPartCents).toBe(
      perLbPrice(e.finishedWeightLb, e.heatTreatPerLbCents),
    );
  });

  it("finds where each lot minimum stops binding", () => {
    expect(crossoverStarts(179, 17_500)).toBe(98);
    expect(crossoverStarts(100, 10_000)).toBe(100); // exact: no float-error extra part
    for (const c of site.charges) {
      const v = site.services.find((s) => s.name === c.name);
      if (!v) throw new Error(c.name);
      expect(v.perPartCents * c.crossoverStarts).toBeGreaterThanOrEqual(v.lotChargeCents);
      expect(v.perPartCents * (c.crossoverStarts - 1)).toBeLessThan(v.lotChargeCents);
    }
    // The page's story: both minimums bind at the two small quantities, neither at the large one.
    expect(site.charges.map((c) => c.atMinimum)).toEqual([
      [true, true, false],
      [true, true, false],
    ]);
  });

  it("prices the full quote to the same cent as the costing engine", () => {
    const outcome = computeCost(card(false), inputs(false));
    if (!outcome.ok) throw new Error(JSON.stringify(outcome.issues));
    expect(site.breaks).toEqual(outcome.result.breaks);
    expect(outcome.result.blankWeightLb).toBeCloseTo(site.blankWeightLb, 12);
    for (const [i, b] of site.breaks.entries())
      expect(b.finishingCents).toBe(site.charges.reduce((s, c) => s + (c.cents[i] ?? 0), 0));
  });

  it("prices the naive quote to the same cent as the costing engine", () => {
    const outcome = computeCost(card(true), inputs(true));
    if (!outcome.ok) throw new Error(JSON.stringify(outcome.issues));
    expect(site.naiveBreaks).toEqual(outcome.result.breaks);
    for (const [i, b] of site.naiveBreaks.entries())
      expect(b.totalCents).toBeLessThan(site.breaks[i]?.totalCents ?? 0);
  });
});
