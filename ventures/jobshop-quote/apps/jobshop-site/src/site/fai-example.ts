// The arithmetic behind the /how-to-quote-first-article-inspection guide. The page prints a worked
// example whose figures come from here, so the prose, the table and the tests cannot disagree.
//
// It takes the bracket from the CNC quoting guide (./quote-example, EXAMPLE) and prices it three ways:
// as that guide quotes it (a first-piece check on the mill, no report), with a full AS9102 first
// article, and with a partial ("delta") first article after a revision change. The first-article work
// is priced the way Job Shop Quote's costing engine (apps/jobshop-quote/src/shared/costing.ts) prices
// a setup-only operation: setup minutes on an inspection machine with its own rate and no cycle time,
// so it is charged once per line, plus a lot-charge extra for a vendor's certificate. Extras carry the
// material markup in the engine, and this copy does the same.
//
// apps/jobshop-quote/test/unit/site-fai-example.test.ts prices every variant with the real engine and
// checks every figure to the cent. The inputs are made up for illustration (labelled so on the page),
// never presented as industry figures or as what AS9102 requires a shop to charge.

import { EXAMPLE as BRACKET, type QuoteExample, startsFor } from "./quote-example";

export interface InspectionOperation {
  label: string;
  /** Minutes, once per line (setup-only: no cycle time per part). */
  setupMinutes: number;
}

export interface LotExtra {
  label: string;
  lotCents: number;
}

export interface FaiVariant {
  key: "none" | "full" | "delta";
  label: string;
  inspection: InspectionOperation[];
  extras: LotExtra[];
}

export interface FaiExample {
  base: QuoteExample;
  inspectionMachineName: string;
  inspectionHourlyRateCents: number;
  variants: FaiVariant[];
}

export interface FaiBreak {
  quantity: number;
  starts: number;
  materialCents: number;
  setupCents: number;
  runCents: number;
  finishingCents: number;
  extrasCents: number;
  costCents: number;
  markupCents: number;
  minimumAdjustmentCents: number;
  unitPriceCents: number;
  totalCents: number;
}

export interface FaiVariantResult {
  key: FaiVariant["key"];
  /** Minutes of first-article inspection work on the line. */
  inspectionMinutes: number;
  /** Inspection setup cost plus extras, before markup. */
  faiCostCents: number;
  breaks: FaiBreak[];
}

const roundCents = (x: number) => Math.round(x + Number.EPSILON * Math.sign(x));
const pct = (bps: number) => bps / 10_000;

/** Prices one variant: the base line plus its inspection operations and lot extras. */
export function priceVariant(e: FaiExample, v: FaiVariant): FaiVariantResult {
  const b = e.base;
  if (b.falloutBps < 0 || b.falloutBps >= 10_000) throw new Error("fallout is below 100%");
  const blankWeightLb =
    b.blank.lengthIn * b.blank.widthIn * b.blank.thicknessIn * b.densityLbPerIn3;
  const inspectionMinutes = v.inspection.reduce((s, o) => s + o.setupMinutes, 0);
  const lotExtrasCents = v.extras.reduce((s, x) => s + x.lotCents, 0);
  let inspectionSetupCents = 0;
  for (const op of v.inspection)
    inspectionSetupCents += roundCents((op.setupMinutes / 60) * e.inspectionHourlyRateCents);
  const breaks = b.quantities.map((quantity) => {
    const starts = startsFor(quantity, b.falloutBps);
    const materialCents = Math.max(
      roundCents(blankWeightLb * starts * b.pricePerLbCents * (1 + pct(b.scrapBps))),
      b.materialMinChargeCents,
    );
    let setupCents = 0;
    let runCents = 0;
    for (const op of b.operations) {
      setupCents += roundCents((op.setupMinutes / 60) * b.hourlyRateCents);
      runCents += roundCents((op.cycleMinutesPerPart / 60) * b.hourlyRateCents * starts);
    }
    setupCents += inspectionSetupCents;
    const finishingCents = Math.max(b.finishingPerPartCents * starts, b.finishingLotChargeCents);
    const extrasCents = lotExtrasCents;
    const costCents = materialCents + setupCents + runCents + finishingCents + extrasCents;
    const markupCents =
      roundCents(materialCents * pct(b.materialMarkupBps)) +
      roundCents((setupCents + runCents) * pct(b.laborMarkupBps)) +
      roundCents(finishingCents * pct(b.outsideServiceMarkupBps)) +
      roundCents(extrasCents * pct(b.materialMarkupBps));
    const priced = costCents + markupCents;
    const minimumAdjustmentCents = Math.max(0, b.minimumLineCents - priced);
    const unitPriceCents = Math.ceil((priced + minimumAdjustmentCents) / quantity);
    return {
      quantity,
      starts,
      materialCents,
      setupCents,
      runCents,
      finishingCents,
      extrasCents,
      costCents,
      markupCents,
      minimumAdjustmentCents,
      unitPriceCents,
      totalCents: unitPriceCents * quantity,
    };
  });
  return {
    key: v.key,
    inspectionMinutes,
    faiCostCents: inspectionSetupCents + lotExtrasCents,
    breaks,
  };
}

export function priceFaiExample(e: FaiExample): FaiVariantResult[] {
  return e.variants.map((v) => priceVariant(e, v));
}

/**
 * The made-up job: the anodized bracket from the CNC quoting guide, now for an aerospace customer
 * whose PO calls for an AS9102 first article. The mill's first-piece check stays on the routing in
 * every variant: it is the setup check, not the report.
 */
export const EXAMPLE: FaiExample = {
  base: BRACKET,
  inspectionMachineName: "Inspection (CMM and bench)",
  inspectionHourlyRateCents: 9_500,
  variants: [
    { key: "none", label: "No first-article report", inspection: [], extras: [] },
    {
      key: "full",
      label: "Full AS9102 first article",
      inspection: [
        { label: "Balloon the drawing and plan the inspection", setupMinutes: 45 },
        { label: "Measure every characteristic on the first part", setupMinutes: 90 },
        { label: "Fill in Forms 1 to 3 and collect the certs", setupMinutes: 60 },
      ],
      extras: [{ label: "Anodizer's certificate for Form 2", lotCents: 2_500 }],
    },
    {
      key: "delta",
      label: "Partial (delta) first article after a revision",
      inspection: [
        { label: "Re-balloon the changed characteristics", setupMinutes: 15 },
        { label: "Measure the changed characteristics", setupMinutes: 30 },
        { label: "Update Forms 1 to 3", setupMinutes: 30 },
      ],
      extras: [],
    },
  ],
};
