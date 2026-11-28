// The marketing site's /how-to-quote-first-article-inspection guide prints a worked example priced by
// its own small copy of this app's arithmetic (apps/jobshop-site/src/site/fai-example.ts). This test
// prices every variant of the same made-up job with the real engine (inspection as setup-only
// operations on a second machine, the vendor certificate as a lot extra), so the page cannot drift
// from what the app would quote.
import { type CostInputs, computeCost, type RateCard } from "@shared/costing";
import { describe, expect, it } from "vitest";
import { EXAMPLE, priceFaiExample } from "../../../jobshop-site/src/site/fai-example";

const e = EXAMPLE;
const b = e.base;
const card: RateCard = {
  laborMarkupBps: b.laborMarkupBps,
  materialMarkupBps: b.materialMarkupBps,
  outsideServiceMarkupBps: b.outsideServiceMarkupBps,
  minimumLineCents: b.minimumLineCents,
  machines: [
    { id: "mill", name: b.machineName, hourlyRateCents: b.hourlyRateCents, setupRateCents: null },
    {
      id: "cmm",
      name: e.inspectionMachineName,
      hourlyRateCents: e.inspectionHourlyRateCents,
      setupRateCents: null,
    },
  ],
  materials: [
    {
      id: "al",
      name: b.materialName,
      pricingBasis: "per_lb",
      pricePerLbCents: b.pricePerLbCents,
      densityLbPerIn3: b.densityLbPerIn3,
      stockPriceCents: null,
      stockDescription: null,
      scrapBps: b.scrapBps,
      minChargeCents: b.materialMinChargeCents,
    },
  ],
  finishingOps: [
    {
      id: "anodize",
      name: b.finishingName,
      perPartCents: b.finishingPerPartCents,
      lotChargeCents: b.finishingLotChargeCents,
      outsideService: true,
    },
  ],
};

describe("the site's first-article guide example", () => {
  const site = priceFaiExample(e);
  for (const [i, v] of e.variants.entries()) {
    it(`prices "${v.label}" to the same cent as the costing engine`, () => {
      const inputs: CostInputs = {
        quantities: b.quantities,
        customerSuppliedMaterial: false,
        material: { materialId: "al", blank: { shape: "rect", ...b.blank }, partsPerStock: null },
        operations: [
          ...b.operations.map((o) => ({ machineId: "mill", ...o })),
          ...v.inspection.map((o) => ({
            machineId: "cmm",
            label: o.label,
            setupMinutes: o.setupMinutes,
            cycleMinutesPerPart: 0,
          })),
        ],
        falloutBps: b.falloutBps,
        finishing: [{ opId: "anodize" }],
        extras: v.extras.map((x) => ({ label: x.label, perPartCents: 0, lotCents: x.lotCents })),
      };
      const outcome = computeCost(card, inputs);
      if (!outcome.ok) throw new Error(JSON.stringify(outcome.issues));
      expect(site[i]?.breaks).toEqual(outcome.result.breaks);
    });
  }

  it("charges the first article once per line, so it shrinks per part as quantity grows", () => {
    const none = site.find((r) => r.key === "none");
    const full = site.find((r) => r.key === "full");
    if (!none || !full) throw new Error("variants missing");
    const added = full.breaks.map(
      (br, j) => br.unitPriceCents - (none.breaks[j]?.unitPriceCents ?? 0),
    );
    for (let j = 1; j < added.length; j++) expect(added[j]).toBeLessThan(added[j - 1] ?? 0);
  });
});
