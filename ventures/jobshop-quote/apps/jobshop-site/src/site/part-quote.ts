// The arithmetic behind the /how-to-quote-cnc-machining guide: one machined part priced at several
// quantity breaks. It follows the same model as the app's costing engine
// (apps/jobshop-quote/src/shared/costing.ts, per_lb material, operations, finishing, markup, line
// minimum), cut down to what the page shows, and test/unit/part-quote.test.ts checks the two agree on
// the worked example. The inputs are made up for illustration (labelled so on the page), never
// presented as typical prices.

export interface PartQuoteInputs {
  /** Rectangular blank, inches. */
  blank: { lengthIn: number; widthIn: number; thicknessIn: number };
  /** lb per cubic inch (6061 aluminum about 0.0975). */
  densityLbPerIn3: number;
  pricePerLbCents: number;
  /** Saw kerf, facing and drop, as a fraction of the blank weight (0.1 = 10%). */
  scrap: number;
  /** Smallest material charge per line. */
  materialMinCents: number;
  /** One machine for every operation, billed at one hourly rate for setup and run. */
  hourlyRateCents: number;
  operations: readonly { label: string; setupMinutes: number; cycleMinutesPerPart: number }[];
  /** An outside finish (anodize, plating): a per-part price and the vendor's lot minimum. */
  finish: { label: string; perPartCents: number; lotChargeCents: number };
  /** Expected fallout as a fraction of parts started (0.02 = 2%). */
  fallout: number;
  laborMarkup: number;
  materialMarkup: number;
  outsideMarkup: number;
  minimumLineCents: number;
  quantities: readonly number[];
}

export interface PartQuoteBreak {
  quantity: number;
  starts: number;
  materialCents: number;
  setupCents: number;
  runCents: number;
  finishCents: number;
  costCents: number;
  markupCents: number;
  minimumAdjustmentCents: number;
  unitPriceCents: number;
  totalCents: number;
  /** Setup's share of each part's price before markup, in cents (setup ÷ quantity). */
  setupPerPartCents: number;
}

export interface PartQuote {
  blankWeightLb: number;
  cycleMinutesPerPart: number;
  setupMinutes: number;
  breaks: PartQuoteBreak[];
}

const roundCents = (x: number) => Math.round(x + Number.EPSILON * Math.sign(x));

/** Parts to start so `quantity` good ones ship: ceil(q / (1 − fallout)). */
export function startsFor(quantity: number, fallout: number): number {
  if (fallout <= 0) return quantity;
  return Math.ceil(quantity / (1 - fallout) - 1e-9);
}

export function partQuote(i: PartQuoteInputs): PartQuote {
  if (i.fallout < 0 || i.fallout >= 0.5) throw new Error("fallout is a fraction below 0.5");
  if (i.quantities.some((q) => !Number.isInteger(q) || q < 1))
    throw new Error("quantities are whole numbers of parts");
  const { lengthIn, widthIn, thicknessIn } = i.blank;
  const blankWeightLb = lengthIn * widthIn * thicknessIn * i.densityLbPerIn3;
  const setupMinutes = i.operations.reduce((s, o) => s + o.setupMinutes, 0);
  const cycleMinutesPerPart = i.operations.reduce((s, o) => s + o.cycleMinutesPerPart, 0);
  const breaks = i.quantities.map((q): PartQuoteBreak => {
    const starts = startsFor(q, i.fallout);
    const materialCents = Math.max(
      roundCents(blankWeightLb * starts * i.pricePerLbCents * (1 + i.scrap)),
      i.materialMinCents,
    );
    let setupCents = 0;
    let runCents = 0;
    for (const op of i.operations) {
      setupCents += roundCents((op.setupMinutes / 60) * i.hourlyRateCents);
      runCents += roundCents((op.cycleMinutesPerPart / 60) * i.hourlyRateCents * starts);
    }
    const finishCents = Math.max(i.finish.perPartCents * starts, i.finish.lotChargeCents);
    const costCents = materialCents + setupCents + runCents + finishCents;
    const markupCents =
      roundCents(materialCents * i.materialMarkup) +
      roundCents((setupCents + runCents) * i.laborMarkup) +
      roundCents(finishCents * i.outsideMarkup);
    const priced = costCents + markupCents;
    const minimumAdjustmentCents = Math.max(0, i.minimumLineCents - priced);
    const unitPriceCents = Math.ceil((priced + minimumAdjustmentCents) / q);
    return {
      quantity: q,
      starts,
      materialCents,
      setupCents,
      runCents,
      finishCents,
      costCents,
      markupCents,
      minimumAdjustmentCents,
      unitPriceCents,
      totalCents: unitPriceCents * q,
      setupPerPartCents: roundCents(setupCents / q),
    };
  });
  return { blankWeightLb, cycleMinutesPerPart, setupMinutes, breaks };
}

/**
 * The made-up part on the page: a 6061 aluminum bracket milled in two setups on a 3-axis mill,
 * then anodized by a vendor. The $100 hourly rate is the cost-based rate from the hourly-rate
 * guide's example ($99.08), rounded; the markup is added on top, as the app does.
 */
export const BRACKET: PartQuoteInputs = {
  blank: { lengthIn: 4.25, widthIn: 3.25, thicknessIn: 1 },
  densityLbPerIn3: 0.0975,
  pricePerLbCents: 450,
  scrap: 0.1,
  materialMinCents: 2_500,
  hourlyRateCents: 10_000,
  operations: [
    { label: "Op 10: first side", setupMinutes: 60, cycleMinutesPerPart: 7 },
    { label: "Op 20: flip, second side", setupMinutes: 30, cycleMinutesPerPart: 4 },
  ],
  finish: { label: "Anodize, clear (outside vendor)", perPartCents: 300, lotChargeCents: 12_500 },
  fallout: 0.02,
  laborMarkup: 0.2,
  materialMarkup: 0.15,
  outsideMarkup: 0.15,
  minimumLineCents: 25_000,
  quantities: [1, 10, 50, 250],
};
