// The arithmetic behind the /quantity-price-breaks guide. It takes the CNC guide's made-up bracket
// (./quote-example, so the two guides tell one story) and prices it at eight quantities, the most one
// Job Shop Quote line carries (MAX_QUANTITY_BREAKS in apps/jobshop-quote/src/shared/costing.ts). The
// page then reads off what a shop needs to set its breaks: what each part pays for setup, run time,
// material and the vendor's lot charge at each break, the price each a long run tends to, the quantities
// where each minimum stops applying, and what happens to an order that falls between two breaks.
//
// apps/jobshop-quote/test/unit/site-quantity-breaks.test.ts prices EXAMPLE and the in-between order
// with the real costing engine and checks every break to the cent. The inputs are made up (labelled so
// on the page), never presented as industry figures.

import {
  EXAMPLE as BRACKET,
  priceExample,
  type QuoteBreak,
  type QuoteExample,
} from "./quote-example";

/** Eight breaks: the most one quote line in the app carries. */
export const BREAK_QUANTITIES = [1, 5, 10, 25, 50, 100, 250, 500] as const;

export const EXAMPLE: QuoteExample = { ...BRACKET, quantities: [...BREAK_QUANTITIES] };

/** An order that lands between two quoted breaks (25 and 50), used to show the in-between rule. */
export const IN_BETWEEN_QUANTITY = 40;

const pct = (bps: number) => bps / 10_000;

export interface BreakShare {
  quantity: number;
  /** Each component per part shipped, cents, unrounded (the page rounds for display). */
  setupEach: number;
  runEach: number;
  materialEach: number;
  finishingEach: number;
  markupEach: number;
  minimumEach: number;
  unitPriceCents: number;
  /** Setup (marked up at the labor rate) as a share of the price each, 0 to 1. */
  setupShare: number;
  /** How far the price each sits above the long-run floor, 0 = at it. */
  overFloor: number;
}

export interface InBetween {
  quantity: number;
  /** The breaks either side. */
  lower: QuoteBreak;
  upper: QuoteBreak;
  /** The order priced on its own, as the app would price a new break at that quantity. */
  own: QuoteBreak;
  /** The order at the lower break's price each. */
  atLowerTotalCents: number;
  /** The order at the upper break's price each (what a buyer asks for). */
  atUpperTotalCents: number;
}

export interface QuantityBreaksResult {
  breaks: QuoteBreak[];
  shares: BreakShare[];
  /** Setup cost for the lot, marked up at the labor rate: the part of the price that does not grow with quantity. */
  fixedCents: number;
  /** Price each as the quantity grows without end: run, material and per-part finishing, marked up, over the good share. */
  floorEachCents: number;
  /** Smallest order whose parts started pay more per part than the vendor's lot charge. */
  lotChargeEndsAt: number;
  /** Smallest order whose material passes the supplier's minimum charge. */
  materialMinimumEndsAt: number;
  /** Breaks lifted to the line minimum. */
  lineMinimumBreaks: number[];
  /** Order size at which setup falls to a tenth of the price each (the curve has mostly flattened). */
  setupTenthAt: number;
  inBetween: InBetween;
}

/** Smallest quantity q ≥ 1 for which test(q) holds (searching up to 1,000,000). */
function firstQuantity(test: (q: number) => boolean): number {
  for (let q = 1; q <= 1_000_000; q++) if (test(q)) return q;
  throw new Error("no quantity up to 1,000,000 passes");
}

export function quantityBreaks(e: QuoteExample = EXAMPLE): QuantityBreaksResult {
  const priced = priceExample(e);
  const breaks = priced.breaks;
  const good = 1 - pct(e.falloutBps);
  const runPerStart = (priced.cycleMinutesPerPart / 60) * e.hourlyRateCents;
  const materialPerStart = priced.blankWeightLb * e.pricePerLbCents * (1 + pct(e.scrapBps));
  const floorEachCents =
    (runPerStart * (1 + pct(e.laborMarkupBps)) +
      materialPerStart * (1 + pct(e.materialMarkupBps)) +
      e.finishingPerPartCents * (1 + pct(e.outsideServiceMarkupBps))) /
    good;
  const setupCents = breaks[0]?.setupCents ?? 0;
  const fixedCents = setupCents * (1 + pct(e.laborMarkupBps));

  const shares = breaks.map((b): BreakShare => {
    const q = b.quantity;
    return {
      quantity: q,
      setupEach: b.setupCents / q,
      runEach: b.runCents / q,
      materialEach: b.materialCents / q,
      finishingEach: b.finishingCents / q,
      markupEach: b.markupCents / q,
      minimumEach: b.minimumAdjustmentCents / q,
      unitPriceCents: b.unitPriceCents,
      setupShare: (b.setupCents * (1 + pct(e.laborMarkupBps))) / q / b.unitPriceCents,
      overFloor: b.unitPriceCents / floorEachCents - 1,
    };
  });

  const one = (q: number) => {
    const b = priceExample({ ...e, quantities: [q] }).breaks[0];
    if (!b) throw new Error("no break");
    return b;
  };
  const lotChargeEndsAt = firstQuantity(
    (q) => e.finishingPerPartCents * one(q).starts > e.finishingLotChargeCents,
  );
  const materialMinimumEndsAt = firstQuantity((q) => {
    const b = one(q);
    return (
      Math.round(priced.blankWeightLb * b.starts * e.pricePerLbCents * (1 + pct(e.scrapBps))) >
      e.materialMinChargeCents
    );
  });
  const lineMinimumBreaks = breaks
    .filter((b) => b.minimumAdjustmentCents > 0)
    .map((b) => b.quantity);
  const setupTenthAt = firstQuantity((q) => fixedCents / q <= one(q).unitPriceCents / 10);

  const iq = IN_BETWEEN_QUANTITY;
  const lower = [...breaks].reverse().find((b) => b.quantity < iq);
  const upper = breaks.find((b) => b.quantity > iq);
  if (!lower || !upper) throw new Error("the in-between order must sit between two breaks");
  const inBetween: InBetween = {
    quantity: iq,
    lower,
    upper,
    own: one(iq),
    atLowerTotalCents: lower.unitPriceCents * iq,
    atUpperTotalCents: upper.unitPriceCents * iq,
  };

  return {
    breaks,
    shares,
    fixedCents,
    floorEachCents,
    lotChargeEndsAt,
    materialMinimumEndsAt,
    lineMinimumBreaks,
    setupTenthAt,
    inBetween,
  };
}
