// The marketing site's /machining-material-cost guide prints a worked example priced by its own small
// copy of this app's material arithmetic (apps/jobshop-site/src/site/material-cost-example.ts). This
// test prices the same made-up bracket through the real engine, one rate-card material per way of
// buying it (plate per cwt, flat bar by the foot, flat bar in whole bars, a precut blank per piece),
// so the page's material charges and markups cannot drift from what the app would quote.
import {
  blankFromBoundingBox,
  type CostInputs,
  computeCost,
  type RateCard,
  type RateMaterial,
  startsFor,
} from "@shared/costing";
import { describe, expect, it } from "vitest";
import {
  blankFromBox,
  EXAMPLE,
  LB_PER_IN3_PER_G_PER_CM3,
  type MaterialMethod,
  METHODS,
  markupCents,
  materialCostExample,
  startsFor as siteStartsFor,
} from "../../../jobshop-site/src/site/material-cost-example";

const e = EXAMPLE;
const site = materialCostExample(e);

const base = {
  pricePerLbCents: null,
  densityLbPerIn3: null,
  stockPriceCents: null,
  stockDescription: null,
  pricePerFootCents: null,
  pricePerCwtCents: null,
  pricePerMetreCents: null,
  cutAllowanceIn: null,
  barLengthIn: null,
  barRemnantIn: null,
  scrapBps: 0,
  minChargeCents: 0,
};
const materials: Record<MaterialMethod, RateMaterial> = {
  plate: {
    ...base,
    id: "plate",
    name: e.plate.name,
    pricingBasis: "per_lb",
    densityLbPerIn3: e.plate.densityLbPerIn3,
    pricePerCwtCents: e.plate.pricePerCwtCents,
    scrapBps: e.plate.scrapBps,
    minChargeCents: e.plate.minChargeCents,
  },
  barByFoot: {
    ...base,
    id: "barByFoot",
    name: e.bar.name,
    pricingBasis: "per_ft",
    pricePerFootCents: e.bar.pricePerFootCents,
    cutAllowanceIn: e.bar.cutAllowanceIn,
    scrapBps: e.bar.scrapBps,
    minChargeCents: e.bar.minChargeCents,
  },
  wholeBars: {
    ...base,
    id: "wholeBars",
    name: e.bar.name,
    pricingBasis: "per_ft",
    pricePerFootCents: e.bar.pricePerFootCents,
    cutAllowanceIn: e.bar.cutAllowanceIn,
    barLengthIn: e.bar.barLengthIn,
    barRemnantIn: e.bar.barRemnantIn,
    scrapBps: e.bar.scrapBps,
    minChargeCents: e.bar.minChargeCents,
  },
  blankPiece: {
    ...base,
    id: "blankPiece",
    name: e.blankPiece.name,
    pricingBasis: "per_stock",
    stockPriceCents: e.blankPiece.priceCents,
    minChargeCents: e.blankPiece.minChargeCents,
  },
};
const card: RateCard = {
  laborMarkupBps: 0,
  materialMarkupBps: e.materialMarkupBps,
  outsideServiceMarkupBps: 0,
  minimumLineCents: 0,
  // The engine needs one operation on a line; a $0-an-hour one keeps labor out of the totals.
  machines: [{ id: "saw", name: "Saw", hourlyRateCents: 0, setupRateCents: null }],
  materials: Object.values(materials),
  finishingOps: [],
};
const blank = blankFromBoundingBox(e.bbox, e.allowancePerSideIn);

function engine(method: MaterialMethod) {
  const inputs: CostInputs = {
    quantities: e.quantities,
    customerSuppliedMaterial: false,
    material: {
      materialId: method,
      blank,
      partsPerStock: method === "blankPiece" ? e.blankPiece.partsPerPiece : null,
    },
    operations: [{ machineId: "saw", label: "", setupMinutes: 1, cycleMinutesPerPart: 0 }],
    falloutBps: e.falloutBps,
    finishing: [],
    extras: [],
  };
  const outcome = computeCost(card, inputs);
  if (!outcome.ok) throw new Error(JSON.stringify(outcome.issues));
  return outcome.result;
}

describe("the site's material cost guide example", () => {
  it("sizes the blank and counts starts the way the engine does", () => {
    expect(blank).toEqual({ shape: "rect", ...blankFromBox(e.bbox, e.allowancePerSideIn) });
    expect(site.blank).toEqual({ lengthIn: 4.125, widthIn: 3.125, thicknessIn: 0.625 });
    for (const q of [1, 10, 33, 100, 1000])
      expect(siteStartsFor(q, e.falloutBps)).toBe(startsFor(q, e.falloutBps));
    expect(site.breaks.map((b) => b.starts)).toEqual([2, 11, 104]);
    expect(engine("plate").blankWeightLb).toBeCloseTo(site.blankWeightLb, 12);
    expect(site.partsPerBar).toBe(33);
  });

  it("charges every way of buying the material to the same cent as the engine", () => {
    for (const m of METHODS) {
      const breaks = engine(m).breaks;
      site.breaks.forEach((b, i) => {
        expect(breaks[i]?.starts).toBe(b.starts);
        expect(breaks[i]?.materialCents, `${m} at ${b.quantity}`).toBe(b.materialCents[m]);
        // No labor, finishing or extras on these lines: the markup is the material markup alone.
        expect(breaks[i]?.costCents).toBe(b.materialCents[m]);
        expect(breaks[i]?.markupCents, `${m} markup at ${b.quantity}`).toBe(
          markupCents(e, b.materialCents[m]),
        );
      });
    }
  });

  it("keeps the page's story true: the minimum, the whole bar and the cheapest way at volume", () => {
    const [one, , hundred] = site.breaks;
    if (!one || !hundred) throw new Error("three quantities");
    expect(one.rawCents.plate).toBeLessThan(e.plate.minChargeCents);
    expect(one.materialCents.plate).toBe(e.plate.minChargeCents);
    expect(one.materialCents.wholeBars).toBe((e.bar.barLengthIn / 12) * e.bar.pricePerFootCents);
    const cheapest = METHODS.reduce((a, m) =>
      hundred.materialCents[m] < hundred.materialCents[a] ? m : a,
    );
    expect(cheapest).toBe("plate");
    expect(hundred.bars).toBe(4);
  });

  it("converts g/cm³ to lb/in³ exactly", () => {
    expect(LB_PER_IN3_PER_G_PER_CM3).toBeCloseTo(0.0361273, 7);
  });
});
