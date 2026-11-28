// The arithmetic behind the /how-to-quote-welding guide. The page prints a worked example whose
// figures come from here, so the prose, the table and the tests cannot disagree. Two parts:
//
// 1. The estimator's own times, worked out before anything is typed into a quote: arc time from the
//    weld length and travel speed, welder time from the arc time and the operator factor, saw time
//    from the cut count, and the filler wire and shielding gas from the fillet size. Job Shop Quote
//    does not compute these (it has no weld-length reader); the page says so.
// 2. The price, following Job Shop Quote's costing engine (apps/jobshop-quote/src/shared/costing.ts)
//    for what a weldment uses: tube priced by the foot with a scrap allowance, one machine rate per
//    operation, consumables as a per-part extra (marked up at the material rate), an outside powder
//    coat, markups and a line minimum.
//
// apps/jobshop-quote/test/unit/site-welding-example.test.ts prices EXAMPLE with the real engine and
// checks every figure to the cent. The inputs are made up for illustration (labelled so on the page),
// never presented as industry figures. The one physical constant is the density of carbon steel.

import { startsFor } from "./quote-example";

export interface WeldMachine {
  name: string;
  hourlyRateCents: number;
}

export interface WeldOperation {
  label: string;
  /** Index into WeldingExample.machines. */
  machine: number;
  setupMinutes: number;
  cycleMinutesPerPart: number;
}

export interface WeldingExample {
  partName: string;
  quantities: number[];
  /** One tube size: the cut list's total length per frame, inches. */
  tube: { description: string; pieces: number; totalLengthIn: number };
  materialName: string;
  pricePerFootCents: number;
  /** Kerf, squaring cuts and the drop at the end of each stick, basis points of the length used. */
  scrapBps: number;
  saw: { machine: number; setupMinutes: number; minutesPerCut: number };
  weld: {
    machine: number;
    /** Total fillet weld length per frame, inches, from the drawing's weld symbols. */
    lengthIn: number;
    /** Equal-leg fillet size, inches. */
    legIn: number;
    /** The same size as the drawing writes it ("3/16"). */
    legLabel: string;
    travelInPerMin: number;
    /** Share of the welder's time with the arc lit, basis points (the rest is positioning, chipping, moving). */
    operatorFactorBps: number;
    /** Building the fixture, once per job. */
    fixtureSetupMinutes: number;
    /** Loading, fitting and tacking one frame in the fixture. */
    fitUpMinutesPerPart: number;
  };
  /** Weld metal deposited over wire bought, basis points. */
  depositionEfficiencyBps: number;
  wirePricePerLbCents: number;
  /** Shielding gas flow, cubic feet per hour of arc time. */
  gasCfh: number;
  gasPricePerCfCents: number;
  /** Operations after the weld, in quote order. */
  otherOperations: WeldOperation[];
  machines: WeldMachine[];
  finishingName: string;
  finishingPerPartCents: number;
  finishingLotChargeCents: number;
  falloutBps: number;
  laborMarkupBps: number;
  materialMarkupBps: number;
  outsideServiceMarkupBps: number;
  minimumLineCents: number;
}

export interface WeldBreak {
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

export interface WeldResult {
  /** Arc-on minutes per frame: weld length ÷ travel speed. */
  arcMinutes: number;
  /** Welder minutes per frame (arc time ÷ operator factor), before rounding up to the hundredth. */
  weldMinutesExact: number;
  sawMinutes: number;
  weldMinutes: number;
  /** Weld metal per frame, lb: fillet cross-section × length × steel density. */
  weldMetalLb: number;
  wireLb: number;
  gasCf: number;
  wireCents: number;
  gasCents: number;
  /** Wire plus gas per frame, rounded to the cent: the quote's consumables extra. */
  consumablesCents: number;
  operations: WeldOperation[];
  breaks: WeldBreak[];
}

/** Carbon steel, lb per cubic inch (the same figure the CNC guide's rate card uses for 1018). */
export const STEEL_LB_PER_IN3 = 0.284;

const roundCents = (x: number) => Math.round(x + Number.EPSILON * Math.sign(x));
const pct = (bps: number) => bps / 10_000;
/** The app's rule for typed times shown here: minutes rounded UP to the hundredth. */
export const upToHundredth = (min: number) => Math.ceil(min * 100 - 1e-9) / 100;

/** Cross-section of an equal-leg fillet weld with no reinforcement: a right triangle, leg² ÷ 2. */
export const filletAreaIn2 = (legIn: number) => (legIn * legIn) / 2;

export function priceWeldingExample(e: WeldingExample): WeldResult {
  const w = e.weld;
  if (w.operatorFactorBps <= 0 || w.operatorFactorBps > 10_000)
    throw new Error("operator factor is above 0 and at most 100%");
  if (e.depositionEfficiencyBps <= 0 || e.depositionEfficiencyBps > 10_000)
    throw new Error("deposition efficiency is above 0 and at most 100%");
  const arcMinutes = w.lengthIn / w.travelInPerMin;
  const weldMinutesExact = arcMinutes / pct(w.operatorFactorBps);
  const weldMinutes = upToHundredth(weldMinutesExact);
  const sawMinutes = upToHundredth(e.tube.pieces * e.saw.minutesPerCut);
  const weldMetalLb = filletAreaIn2(w.legIn) * w.lengthIn * STEEL_LB_PER_IN3;
  const wireLb = weldMetalLb / pct(e.depositionEfficiencyBps);
  const gasCf = (e.gasCfh * arcMinutes) / 60;
  const wireCents = wireLb * e.wirePricePerLbCents;
  const gasCents = gasCf * e.gasPricePerCfCents;
  const consumablesCents = roundCents(wireCents + gasCents);

  const operations: WeldOperation[] = [
    {
      label: "Saw cut the tube",
      machine: e.saw.machine,
      setupMinutes: e.saw.setupMinutes,
      cycleMinutesPerPart: sawMinutes,
    },
    {
      label: "Build fixture, fit and tack",
      machine: w.machine,
      setupMinutes: w.fixtureSetupMinutes,
      cycleMinutesPerPart: w.fitUpMinutesPerPart,
    },
    {
      label: "Weld out",
      machine: w.machine,
      setupMinutes: 0,
      cycleMinutesPerPart: weldMinutes,
    },
    ...e.otherOperations,
  ];

  const breaks = e.quantities.map((quantity) => {
    const starts = startsFor(quantity, e.falloutBps);
    const materialCents = roundCents(
      starts * (e.tube.totalLengthIn / 12) * e.pricePerFootCents * (1 + pct(e.scrapBps)),
    );
    let setupCents = 0;
    let runCents = 0;
    for (const op of operations) {
      const rate = e.machines[op.machine]?.hourlyRateCents;
      if (rate === undefined) throw new Error(`no machine ${op.machine}`);
      setupCents += roundCents((op.setupMinutes / 60) * rate);
      runCents += roundCents((op.cycleMinutesPerPart / 60) * rate * starts);
    }
    const finishingCents = Math.max(e.finishingPerPartCents * starts, e.finishingLotChargeCents);
    // The engine charges an extra per part shipped (the quantity), not per part started.
    const extrasCents = consumablesCents * quantity;
    const costCents = materialCents + setupCents + runCents + finishingCents + extrasCents;
    const markupCents =
      roundCents(materialCents * pct(e.materialMarkupBps)) +
      roundCents((setupCents + runCents) * pct(e.laborMarkupBps)) +
      roundCents(finishingCents * pct(e.outsideServiceMarkupBps)) +
      roundCents(extrasCents * pct(e.materialMarkupBps));
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
      extrasCents,
      costCents,
      markupCents,
      minimumAdjustmentCents,
      unitPriceCents,
      totalCents: unitPriceCents * quantity,
    };
  });
  return {
    arcMinutes,
    weldMinutesExact,
    sawMinutes,
    weldMinutes,
    weldMetalLb,
    wireLb,
    gasCf,
    wireCents,
    gasCents,
    consumablesCents,
    operations,
    breaks,
  };
}

/**
 * The made-up job on the page: a square-tube steel cart frame, eight pieces sawn, fitted and tacked in
 * a fixture, MIG welded, ground and powder coated by a vendor, quoted at 1, 10 and 50. Every rate,
 * speed and price here is invented to show the arithmetic; labor markup is 0 because the shop rates
 * are taken to hold the margin already.
 */
export const EXAMPLE: WeldingExample = {
  partName: "cart frame",
  quantities: [1, 10, 50],
  tube: { description: "2 × 2 × 1/8 in square tube", pieces: 8, totalLengthIn: 216 },
  materialName: "A500 steel square tube, 2 × 2 × 1/8 in",
  pricePerFootCents: 450,
  scrapBps: 1_000,
  saw: { machine: 0, setupMinutes: 15, minutesPerCut: 1.5 },
  weld: {
    machine: 1,
    lengthIn: 64,
    legIn: 0.1875,
    legLabel: "3/16",
    travelInPerMin: 10,
    operatorFactorBps: 3_500,
    fixtureSetupMinutes: 90,
    fitUpMinutesPerPart: 12,
  },
  depositionEfficiencyBps: 9_000,
  wirePricePerLbCents: 350,
  gasCfh: 35,
  gasPricePerCfCents: 12,
  otherOperations: [
    { label: "Grind, clean and inspect", machine: 2, setupMinutes: 0, cycleMinutesPerPart: 10 },
    { label: "First-article check", machine: 2, setupMinutes: 30, cycleMinutesPerPart: 0 },
  ],
  machines: [
    { name: "Band saw", hourlyRateCents: 7_500 },
    { name: "MIG welding cell", hourlyRateCents: 9_500 },
    { name: "Bench", hourlyRateCents: 6_500 },
  ],
  finishingName: "Black powder coat (outside vendor)",
  finishingPerPartCents: 3_500,
  finishingLotChargeCents: 22_500,
  falloutBps: 0,
  laborMarkupBps: 0,
  materialMarkupBps: 2_000,
  outsideServiceMarkupBps: 1_500,
  minimumLineCents: 25_000,
};
