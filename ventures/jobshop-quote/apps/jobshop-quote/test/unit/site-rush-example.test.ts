// The marketing site's /how-to-price-a-rush-job guide prints the CNC guide's made-up bracket quoted
// normal and rush, priced by its own small copy of this app's arithmetic
// (apps/jobshop-site/src/site/rush-example.ts). This test runs both lines through the real costing
// engine (an overtime rate as a second machine, the bumped job as a setup-only operation, an expedited
// outside service with its own lot minimum, same-day delivery as a per-order extra), so the page
// cannot drift from what the app would quote.
import { type CostInputs, computeCost, type RateCard } from "@shared/costing";
import { describe, expect, it } from "vitest";
import { EXAMPLE as BASE, priceExample } from "../../../jobshop-site/src/site/quote-example";
import {
  type LineSpec,
  normalLine,
  priceLine,
  rushLine,
} from "../../../jobshop-site/src/site/rush-example";

function engine(s: LineSpec) {
  const ids = s.machines.map((_, i) => `m${i}`);
  const card: RateCard = {
    laborMarkupBps: s.laborMarkupBps,
    materialMarkupBps: s.materialMarkupBps,
    outsideServiceMarkupBps: s.outsideServiceMarkupBps,
    minimumLineCents: s.minimumLineCents,
    machines: s.machines.map((m, i) => ({
      id: ids[i] as string,
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
      machineId: ids[o.machine] as string,
      label: o.label,
      setupMinutes: o.setupMinutes,
      cycleMinutesPerPart: o.cycleMinutesPerPart,
    })),
    falloutBps: s.falloutBps,
    finishing: [{ opId: "finish" }],
    extras: s.extras.map((x) => ({ ...x })),
  };
  const outcome = computeCost(card, inputs);
  if (!outcome.ok) throw new Error(JSON.stringify(outcome.issues));
  return outcome.result.breaks;
}

describe("the site's rush guide example", () => {
  it("prices the normal line to the same cent as the engine and as the CNC guide", () => {
    const site = priceLine(normalLine());
    expect(site).toEqual(engine(normalLine()));
    expect(site.map(({ extrasCents, ...rest }) => rest)).toEqual(priceExample(BASE).breaks);
  });

  it("prices the rush line to the same cent as the engine", () => {
    const site = priceLine(rushLine());
    expect(site).toEqual(engine(rushLine()));
    expect(site.every((b) => b.extrasCents > 0)).toBe(true);
  });
});
