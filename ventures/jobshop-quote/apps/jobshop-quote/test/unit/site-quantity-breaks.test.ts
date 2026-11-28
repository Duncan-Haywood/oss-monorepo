// The marketing site's /quantity-price-breaks guide prints the CNC guide's made-up bracket at eight
// quantities, plus an order between two breaks, from its own small copy of this app's arithmetic
// (apps/jobshop-site/src/site/quantity-breaks.ts). This test prices the same inputs with the real
// engine, so the page cannot drift from what the app would quote, and checks the figures the page reads
// off the table (where each minimum ends, the floor, the in-between order) against the engine too.
import { type CostInputs, computeCost, MAX_QUANTITY_BREAKS, type RateCard } from "@shared/costing";
import { describe, expect, it } from "vitest";
import {
  BREAK_QUANTITIES,
  EXAMPLE,
  IN_BETWEEN_QUANTITY,
  quantityBreaks,
} from "../../../jobshop-site/src/site/quantity-breaks";

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
const inputsFor = (quantities: number[]): CostInputs => ({
  quantities,
  customerSuppliedMaterial: false,
  material: { materialId: "al", blank: { shape: "rect", ...e.blank }, partsPerStock: null },
  operations: e.operations.map((o) => ({ machineId: "mill", ...o })),
  falloutBps: e.falloutBps,
  finishing: [{ opId: "anodize" }],
  extras: [],
});
const engine = (quantities: number[]) => {
  const outcome = computeCost(card, inputsFor(quantities));
  if (!outcome.ok) throw new Error(JSON.stringify(outcome.issues));
  return outcome.result.breaks.map(({ extrasCents, ...rest }) => {
    expect(extrasCents).toBe(0);
    return rest;
  });
};

describe("the site's quantity breaks guide", () => {
  const site = quantityBreaks();

  it("uses as many breaks as one quote line carries", () => {
    expect(BREAK_QUANTITIES.length).toBe(MAX_QUANTITY_BREAKS);
  });

  it("prices every break to the same cent as the costing engine", () => {
    expect(site.breaks).toEqual(engine([...BREAK_QUANTITIES]));
  });

  it("prices the in-between order as the engine would", () => {
    const [own] = engine([IN_BETWEEN_QUANTITY]);
    expect(site.inBetween.own).toEqual(own);
    expect(site.inBetween.lower.quantity).toBeLessThan(IN_BETWEEN_QUANTITY);
    expect(site.inBetween.upper.quantity).toBeGreaterThan(IN_BETWEEN_QUANTITY);
    // The page's story: the lower break's price over-recovers, the upper break's under-recovers.
    expect(site.inBetween.atLowerTotalCents).toBeGreaterThan(site.inBetween.own.totalCents);
    expect(site.inBetween.atUpperTotalCents).toBeLessThan(site.inBetween.own.totalCents);
  });

  it("finds where the lot charge and the material minimum stop applying, as the engine prices them", () => {
    const lot = site.lotChargeEndsAt;
    const [before, at] = engine([lot - 1, lot]);
    expect(before?.finishingCents).toBe(e.finishingLotChargeCents);
    expect(at?.finishingCents).toBeGreaterThan(e.finishingLotChargeCents);
    const mat = site.materialMinimumEndsAt;
    const [mBefore, mAt] = mat > 1 ? engine([mat - 1, mat]) : [undefined, engine([mat])[0]];
    if (mBefore) expect(mBefore.materialCents).toBe(e.materialMinChargeCents);
    expect(mAt?.materialCents).toBeGreaterThan(e.materialMinChargeCents);
  });

  it("puts the floor below every break, with the price each falling towards it", () => {
    const units = site.breaks.map((b) => b.unitPriceCents);
    for (let i = 1; i < units.length; i++) expect(units[i]).toBeLessThan(units[i - 1] ?? 0);
    for (const u of units) expect(u).toBeGreaterThan(site.floorEachCents);
    // A very long run lands within a cent or two of the floor.
    const [huge] = engine([1_000_000]);
    expect(Math.abs((huge?.unitPriceCents ?? 0) - site.floorEachCents)).toBeLessThan(2);
  });

  it("never prices more parts for less money", () => {
    const totals = site.breaks.map((b) => b.totalCents);
    for (let i = 1; i < totals.length; i++) expect(totals[i]).toBeGreaterThan(totals[i - 1] ?? 0);
  });

  it("finds the order size where setup falls to a tenth of the price each", () => {
    const q = site.setupTenthAt;
    const [before, at] = engine([q - 1, q]);
    expect(site.fixedCents / (q - 1)).toBeGreaterThan((before?.unitPriceCents ?? 0) / 10);
    expect(site.fixedCents / q).toBeLessThanOrEqual((at?.unitPriceCents ?? 0) / 10);
  });
});
