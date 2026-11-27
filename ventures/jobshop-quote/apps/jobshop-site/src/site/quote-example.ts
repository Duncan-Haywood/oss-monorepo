// The arithmetic behind the /how-to-quote-cnc-machining guide. The page prints a worked example whose
// figures come from here, so the prose, the table and the tests cannot disagree. It follows the same
// model as Job Shop Quote's costing engine (apps/jobshop-quote/src/shared/costing.ts) for the parts
// the example uses (a material priced by the pound, machine operations, one outside service, fallout,
// markups and a line minimum), and apps/jobshop-quote/test/unit/site-quote-example.test.ts checks that
// the engine prices EXAMPLE to the same cent. The inputs are made up for illustration (labelled so on
// the page), never presented as industry figures.

export interface QuoteExampleOperation {
  label: string;
  setupMinutes: number;
  cycleMinutesPerPart: number;
}

export interface QuoteExample {
  partName: string;
  quantities: number[];
  /** Rectangular blank, inches. */
  blank: { lengthIn: number; widthIn: number; thicknessIn: number };
  materialName: string;
  densityLbPerIn3: number;
  pricePerLbCents: number;
  /** Saw kerf and facing, basis points of the blank weight. */
  scrapBps: number;
  materialMinChargeCents: number;
  machineName: string;
  /** One machine at one rate: setups bill at the hourly rate. */
  hourlyRateCents: number;
  operations: QuoteExampleOperation[];
  finishingName: string;
  finishingPerPartCents: number;
  finishingLotChargeCents: number;
  /** Expected scrap parts, basis points of the parts started. */
  falloutBps: number;
  laborMarkupBps: number;
  materialMarkupBps: number;
  outsideServiceMarkupBps: number;
  minimumLineCents: number;
}

export interface QuoteBreak {
  quantity: number;
  starts: number;
  materialCents: number;
  setupCents: number;
  runCents: number;
  finishingCents: number;
  costCents: number;
  markupCents: number;
  minimumAdjustmentCents: number;
  unitPriceCents: number;
  totalCents: number;
}

export interface QuoteResult {
  blankWeightLb: number;
  setupMinutes: number;
  cycleMinutesPerPart: number;
  breaks: QuoteBreak[];
}

const roundCents = (x: number) => Math.round(x + Number.EPSILON * Math.sign(x));
const pct = (bps: number) => bps / 10_000;

/** Parts to start so `quantity` good parts ship at `falloutBps` expected fallout. */
export function startsFor(quantity: number, falloutBps: number): number {
  if (falloutBps <= 0) return quantity;
  return Math.ceil((quantity * 10_000) / (10_000 - falloutBps) - 1e-9);
}

export function priceExample(e: QuoteExample): QuoteResult {
  if (e.falloutBps < 0 || e.falloutBps >= 10_000) throw new Error("fallout is below 100%");
  if (e.quantities.some((q) => !Number.isInteger(q) || q < 1))
    throw new Error("quantities are whole numbers of parts");
  const { lengthIn, widthIn, thicknessIn } = e.blank;
  const blankWeightLb = lengthIn * widthIn * thicknessIn * e.densityLbPerIn3;
  const setupMinutes = e.operations.reduce((s, o) => s + o.setupMinutes, 0);
  const cycleMinutesPerPart = e.operations.reduce((s, o) => s + o.cycleMinutesPerPart, 0);
  const breaks = e.quantities.map((quantity) => {
    const starts = startsFor(quantity, e.falloutBps);
    const materialCents = Math.max(
      roundCents(blankWeightLb * starts * e.pricePerLbCents * (1 + pct(e.scrapBps))),
      e.materialMinChargeCents,
    );
    let setupCents = 0;
    let runCents = 0;
    for (const op of e.operations) {
      setupCents += roundCents((op.setupMinutes / 60) * e.hourlyRateCents);
      runCents += roundCents((op.cycleMinutesPerPart / 60) * e.hourlyRateCents * starts);
    }
    const finishingCents = Math.max(e.finishingPerPartCents * starts, e.finishingLotChargeCents);
    const costCents = materialCents + setupCents + runCents + finishingCents;
    const markupCents =
      roundCents(materialCents * pct(e.materialMarkupBps)) +
      roundCents((setupCents + runCents) * pct(e.laborMarkupBps)) +
      roundCents(finishingCents * pct(e.outsideServiceMarkupBps));
    const priced = costCents + markupCents;
    const minimumAdjustmentCents = Math.max(0, e.minimumLineCents - priced);
    const unitPriceCents = Math.ceil((priced + minimumAdjustmentCents) / quantity);
    return {
      quantity,
      starts,
      materialCents,
      setupCents,
      runCents,
      finishingCents,
      costCents,
      markupCents,
      minimumAdjustmentCents,
      unitPriceCents,
      totalCents: unitPriceCents * quantity,
    };
  });
  return { blankWeightLb, setupMinutes, cycleMinutesPerPart, breaks };
}

/**
 * The made-up job on the page: an anodized 6061 bracket, two milling setups and a deburr, quoted at
 * 1, 10 and 100. The mill's rate is the margin rate the /machine-shop-hourly-rate guide works out
 * ($123.85), so the two guides tell one story; labor markup is 0 because that rate already holds the
 * margin.
 */
export const EXAMPLE: QuoteExample = {
  partName: "mounting bracket",
  quantities: [1, 10, 100],
  blank: { lengthIn: 4.25, widthIn: 3.25, thicknessIn: 1 },
  materialName: "6061-T6 aluminum plate",
  densityLbPerIn3: 0.0975,
  pricePerLbCents: 500,
  scrapBps: 1_000,
  materialMinChargeCents: 2_500,
  machineName: "3-axis mill",
  hourlyRateCents: 12_385,
  operations: [
    { label: "Program and first-article check", setupMinutes: 60, cycleMinutesPerPart: 0 },
    { label: "Op 1: face, profile, pockets", setupMinutes: 45, cycleMinutesPerPart: 14 },
    {
      label: "Op 2: flip, face to thickness, drill and tap",
      setupMinutes: 30,
      cycleMinutesPerPart: 8,
    },
    { label: "Deburr and inspect", setupMinutes: 0, cycleMinutesPerPart: 4 },
  ],
  finishingName: "Clear anodize (outside vendor)",
  finishingPerPartCents: 350,
  finishingLotChargeCents: 15_000,
  falloutBps: 300,
  laborMarkupBps: 0,
  materialMarkupBps: 1_500,
  outsideServiceMarkupBps: 1_500,
  minimumLineCents: 25_000,
};

/** "$1,234.56" from integer cents. */
export function usdCents(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
