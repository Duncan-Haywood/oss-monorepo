// The arithmetic behind the /machining-material-cost guide. The page prints a worked example whose
// figures come from here, so the prose, the table and the tests cannot disagree.
//
// One made-up aluminum bracket is costed for material four ways, the four ways Job Shop Quote's
// costing engine (apps/jobshop-quote/src/shared/costing.ts) can price a rate-card material:
//   1. plate by the pound: blank weight × starts × $/lb × (1 + scrap%), at least the minimum;
//   2. flat bar by the foot used: starts × (blank length + cut allowance) ÷ 12 × $/ft × (1 + scrap%);
//   3. flat bar in whole bars: ceil(starts ÷ parts per bar) × bar length ÷ 12 × $/ft, where parts per
//      bar = floor((bar length − remnant) ÷ (blank length + cut allowance));
//   4. a precut blank bought per piece: ceil(starts ÷ parts per piece) × piece price.
// The blank comes from the part's bounding box the way the app suggests it from a STEP model
// (blankFromBoundingBox: allowance on each side, rounded up to the next 1/8 in), and starts from the
// expected fallout (startsFor). Material markup is the rate card's one percentage on material.
//
// apps/jobshop-quote/test/unit/site-material-cost-example.test.ts prices EXAMPLE through the real
// engine and checks every material charge and markup to the cent. Every price, allowance and scrap
// share here is made up for illustration (labelled so on the page), never presented as a market price.

export interface MaterialCostExample {
  partName: string;
  /** The finished part's bounding box, inches, as a STEP model measures it. */
  bbox: { xIn: number; yIn: number; zIn: number };
  /** Stock left on each side for facing and clamping, inches. */
  allowancePerSideIn: number;
  quantities: number[];
  /** Expected scrap parts, basis points of the parts started. */
  falloutBps: number;
  materialMarkupBps: number;
  plate: {
    name: string;
    densityLbPerIn3: number;
    /** Kept as the supplier quotes it: per hundredweight (100 lb). */
    pricePerCwtCents: number;
    scrapBps: number;
    minChargeCents: number;
  };
  bar: {
    name: string;
    /** The flat bar's cross-section, which must cover the blank's width and thickness. */
    sizeLabel: string;
    pricePerFootCents: number;
    /** Saw kerf and facing added to each part's length, inches. */
    cutAllowanceIn: number;
    /** Scrap share when bar is billed by the length used (not used for whole bars). */
    scrapBps: number;
    barLengthIn: number;
    /** The end of each bar that cannot become parts, inches. */
    barRemnantIn: number;
    minChargeCents: number;
  };
  blankPiece: {
    name: string;
    priceCents: number;
    partsPerPiece: number;
    minChargeCents: number;
  };
}

export type MaterialMethod = "plate" | "barByFoot" | "wholeBars" | "blankPiece";

export interface MaterialBreak {
  quantity: number;
  starts: number;
  /** Material charge for the line, cents, before markup, at least the material's minimum. */
  materialCents: Record<MaterialMethod, number>;
  /** The charge before the minimum was applied, cents, rounded. */
  rawCents: Record<MaterialMethod, number>;
  /** Whole bars bought for the wholeBars method. */
  bars: number;
}

export interface MaterialCostResult {
  blank: { lengthIn: number; widthIn: number; thicknessIn: number };
  blankVolumeIn3: number;
  blankWeightLb: number;
  /** $/lb in cents, exact (a cwt price ÷ 100). */
  pricePerLbCents: number;
  /** Blank length plus cut allowance, inches. */
  cutLengthIn: number;
  partsPerBar: number;
  breaks: MaterialBreak[];
}

export const METHODS: readonly MaterialMethod[] = ["plate", "barByFoot", "wholeBars", "blankPiece"];

/** 1 g/cm³ in lb/in³: 16.387064 cm³ per in³ ÷ 453.59237 g per lb (both exact definitions). */
export const LB_PER_IN3_PER_G_PER_CM3 = 16.387064 / 453.59237;

const roundCents = (x: number) => Math.round(x + Number.EPSILON * Math.sign(x));
const pct = (bps: number) => bps / 10_000;

/** The engine's starts: parts started so `quantity` good ones ship at `falloutBps` fallout. */
export function startsFor(quantity: number, falloutBps: number): number {
  if (falloutBps <= 0) return quantity;
  return Math.ceil((quantity * 10_000) / (10_000 - falloutBps) - 1e-9);
}

/** The engine's suggested blank: bounding box plus the allowance each side, up to the next 1/8 in. */
export function blankFromBox(
  bbox: { xIn: number; yIn: number; zIn: number },
  allowancePerSideIn: number,
): { lengthIn: number; widthIn: number; thicknessIn: number } {
  const up = (v: number) => Math.ceil((v + 2 * allowancePerSideIn) * 8 - 1e-9) / 8;
  const [thicknessIn, widthIn, lengthIn] = [bbox.xIn, bbox.yIn, bbox.zIn]
    .map(up)
    .sort((a, b) => a - b) as [number, number, number];
  return { lengthIn, widthIn, thicknessIn };
}

export function materialCostExample(e: MaterialCostExample): MaterialCostResult {
  const blank = blankFromBox(e.bbox, e.allowancePerSideIn);
  const blankVolumeIn3 = blank.lengthIn * blank.widthIn * blank.thicknessIn;
  const blankWeightLb = blankVolumeIn3 * e.plate.densityLbPerIn3;
  const pricePerLbCents = e.plate.pricePerCwtCents / 100;
  const cutLengthIn = blank.lengthIn + e.bar.cutAllowanceIn;
  const usable = e.bar.barLengthIn - e.bar.barRemnantIn;
  const partsPerBar = Math.floor(usable / cutLengthIn + 1e-9);
  if (partsPerBar < 1) throw new Error("the example's blank must fit one bar");

  const breaks = e.quantities.map((quantity): MaterialBreak => {
    const starts = startsFor(quantity, e.falloutBps);
    const bars = Math.ceil(starts / partsPerBar);
    const rawCents: Record<MaterialMethod, number> = {
      plate: roundCents(blankWeightLb * starts * pricePerLbCents * (1 + pct(e.plate.scrapBps))),
      barByFoot: roundCents(
        starts * (cutLengthIn / 12) * e.bar.pricePerFootCents * (1 + pct(e.bar.scrapBps)),
      ),
      wholeBars: roundCents(bars * (e.bar.barLengthIn / 12) * e.bar.pricePerFootCents),
      blankPiece: roundCents(
        Math.ceil(starts / e.blankPiece.partsPerPiece) * e.blankPiece.priceCents,
      ),
    };
    const min: Record<MaterialMethod, number> = {
      plate: e.plate.minChargeCents,
      barByFoot: e.bar.minChargeCents,
      wholeBars: e.bar.minChargeCents,
      blankPiece: e.blankPiece.minChargeCents,
    };
    const materialCents = Object.fromEntries(
      METHODS.map((m) => [m, Math.max(rawCents[m], min[m])]),
    ) as Record<MaterialMethod, number>;
    return { quantity, starts, materialCents, rawCents, bars };
  });
  return {
    blank,
    blankVolumeIn3,
    blankWeightLb,
    pricePerLbCents,
    cutLengthIn,
    partsPerBar,
    breaks,
  };
}

/** Material markup on a charge, cents, the engine's way (rounded once). */
export const markupCents = (e: MaterialCostExample, cents: number) =>
  roundCents(cents * pct(e.materialMarkupBps));

/**
 * The made-up job on the page: a 6061 aluminum bracket whose model measures 4 × 3 × 1/2 in, quoted
 * at 1, 10 and 100 with 3% expected fallout. Every price, allowance and scrap share is invented to
 * show the arithmetic; the density is the 6061 figure the CNC guide's rate card uses.
 */
export const EXAMPLE: MaterialCostExample = {
  partName: "bracket",
  bbox: { xIn: 4, yIn: 3, zIn: 0.5 },
  allowancePerSideIn: 0.0625,
  quantities: [1, 10, 100],
  falloutBps: 300,
  materialMarkupBps: 2_000,
  plate: {
    name: "6061-T6 aluminum plate, 5/8 in",
    densityLbPerIn3: 0.0975,
    pricePerCwtCents: 52_500,
    scrapBps: 2_500,
    minChargeCents: 4_000,
  },
  bar: {
    name: "6061-T6 aluminum flat bar",
    sizeLabel: "5/8 × 3-1/4 in",
    pricePerFootCents: 1_480,
    cutAllowanceIn: 0.125,
    scrapBps: 1_000,
    barLengthIn: 144,
    barRemnantIn: 2,
    minChargeCents: 0,
  },
  blankPiece: {
    name: "6061-T6 precut blank, 5/8 × 3-1/8 × 4-1/8 in",
    priceCents: 1_350,
    partsPerPiece: 1,
    minChargeCents: 0,
  },
};
