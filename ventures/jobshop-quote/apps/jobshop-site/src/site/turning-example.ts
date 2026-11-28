// The arithmetic behind the /how-to-quote-cnc-turning guide. The page prints a worked example whose
// figures come from here, so the prose, the table and the tests cannot disagree. Two parts:
//
// 1. The estimator's own lathe times, worked out before anything is typed into a quote: spindle speed
//    from the surface speed and the diameter cut, minutes per pass from the length and the feed per
//    revolution, the number of roughing passes from the stock to remove and the depth of cut, plus a
//    typed allowance for indexing, rapids and the bar pull. Job Shop Quote does not compute lathe
//    times (its roughing suggestion is for mills); the page says so.
// 2. The price, following Job Shop Quote's costing engine (apps/jobshop-quote/src/shared/costing.ts)
//    for a turned part: round bar priced by the foot, bought in fixed bars with a remnant, each part
//    taking its blank length plus a cut allowance, whole bars charged (barStockUse); one machine rate
//    per operation, fallout, an outside passivation, markups and a line minimum.
//
// apps/jobshop-quote/test/unit/site-turning-example.test.ts prices EXAMPLE with the real engine and
// checks every figure to the cent, both with whole bars and charged by the length used. The inputs are
// made up for illustration (labelled so on the page), never presented as industry figures.

import { startsFor } from "./quote-example";

export interface TurnMachine {
  name: string;
  hourlyRateCents: number;
}

/** One kind of lathe cut, timed at a constant surface speed on one diameter. */
export interface TurnCut {
  label: string;
  /** Diameter the speed is worked out on, inches (the larger one for a facing or part-off cut). */
  diameterIn: number;
  /** Surface feet per minute. */
  sfm: number;
  /** Feed per revolution, inches. */
  iprIn: number;
  /** Length of one pass along the feed direction, inches (radial for facing and part-off). */
  lengthIn: number;
  passes: number;
}

export interface TurnOperation {
  label: string;
  /** Index into TurningExample.machines. */
  machine: number;
  setupMinutes: number;
  cycleMinutesPerPart: number;
}

export interface TurningExample {
  partName: string;
  quantities: number[];
  barDiameterIn: number;
  /** Finished turned diameter, inches. */
  finishDiameterIn: number;
  /** Length of the turned diameter, inches. */
  turnLengthIn: number;
  /** Finished part length, inches: the blank length the quote line carries. */
  partLengthIn: number;
  /** Radial stock left on for the finishing pass, inches. */
  finishStockIn: number;
  /** Radial depth of each roughing pass, inches. */
  roughDepthIn: number;
  roughSfm: number;
  roughIprIn: number;
  finishSfm: number;
  finishIprIn: number;
  faceSfm: number;
  faceIprIn: number;
  partOffSfm: number;
  partOffIprIn: number;
  /** Tool indexes, rapids and the bar pull per part, minutes (typed from the shop's own timing). */
  handlingMinutesPerPart: number;
  lathe: { machine: number; setupMinutes: number };
  /** Operations after the lathe, in quote order. */
  otherOperations: TurnOperation[];
  machines: TurnMachine[];
  materialName: string;
  stockDescription: string;
  pricePerFootCents: number;
  /** Part-off tool width plus facing, added to each part's length, inches. */
  cutAllowanceIn: number;
  barLengthIn: number;
  /** The end of each bar the chuck or feeder cannot use, inches. */
  barRemnantIn: number;
  finishingName: string;
  finishingPerPartCents: number;
  finishingLotChargeCents: number;
  falloutBps: number;
  laborMarkupBps: number;
  materialMarkupBps: number;
  outsideServiceMarkupBps: number;
  minimumLineCents: number;
}

export interface TurnBreak {
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

export interface TimedCut extends TurnCut {
  rpm: number;
  minutes: number;
}

export interface TurnResult {
  cuts: TimedCut[];
  /** Cutting minutes plus handling, before rounding up to the hundredth. */
  cycleMinutesExact: number;
  cycleMinutes: number;
  /** Part length plus the cut allowance: what one part takes off the bar. */
  cutLengthIn: number;
  partsPerBar: number;
  /** Bars pulled at each break (starts ÷ parts per bar, rounded up). */
  bars: number[];
  operations: TurnOperation[];
  breaks: TurnBreak[];
  /** The same quote with the material charged by the length used (no bar length, no scrap). */
  lengthUsedBreaks: TurnBreak[];
}

const roundCents = (x: number) => Math.round(x + Number.EPSILON * Math.sign(x));
const pct = (bps: number) => bps / 10_000;
/** The app's rule for typed times shown here: minutes rounded UP to the hundredth. */
export const upToHundredth = (min: number) => Math.ceil(min * 100 - 1e-9) / 100;

/** Spindle speed for a surface speed on a diameter: rpm = sfm × 12 ÷ (π × D). */
export const rpmFor = (sfm: number, diameterIn: number) => (sfm * 12) / (Math.PI * diameterIn);

/** Minutes for one cut: passes × length ÷ (feed per rev × rpm). */
export function cutMinutes(c: TurnCut): number {
  return (c.passes * c.lengthIn) / (c.iprIn * rpmFor(c.sfm, c.diameterIn));
}

/** Roughing passes to take a diameter down, leaving the finish stock: radial stock ÷ depth, rounded up. */
export function roughPasses(barD: number, finishD: number, finishStock: number, depth: number) {
  const radial = (barD - finishD) / 2 - finishStock;
  if (radial <= 0) return 0;
  return Math.ceil(radial / depth - 1e-9);
}

/** Parts per bar the way the app counts them: floor((bar − remnant) ÷ (length + allowance)). */
export function partsPerBar(barIn: number, remnantIn: number, partIn: number, allowanceIn: number) {
  return Math.floor((barIn - remnantIn) / (partIn + allowanceIn) + 1e-9);
}

export function turningCuts(e: TurningExample): TurnCut[] {
  const passes = roughPasses(e.barDiameterIn, e.finishDiameterIn, e.finishStockIn, e.roughDepthIn);
  return [
    {
      label: "Face the end",
      diameterIn: e.barDiameterIn,
      sfm: e.faceSfm,
      iprIn: e.faceIprIn,
      lengthIn: e.barDiameterIn / 2,
      passes: 1,
    },
    {
      label: "Rough the diameter",
      diameterIn: e.barDiameterIn,
      sfm: e.roughSfm,
      iprIn: e.roughIprIn,
      lengthIn: e.turnLengthIn,
      passes,
    },
    {
      label: "Finish the diameter",
      diameterIn: e.finishDiameterIn,
      sfm: e.finishSfm,
      iprIn: e.finishIprIn,
      lengthIn: e.turnLengthIn,
      passes: 1,
    },
    {
      label: "Part off",
      diameterIn: e.barDiameterIn,
      sfm: e.partOffSfm,
      iprIn: e.partOffIprIn,
      lengthIn: e.barDiameterIn / 2,
      passes: 1,
    },
  ];
}

function priceBreaks(
  e: TurningExample,
  operations: TurnOperation[],
  material: (starts: number) => number,
): TurnBreak[] {
  return e.quantities.map((quantity) => {
    const starts = startsFor(quantity, e.falloutBps);
    const materialCents = roundCents(material(starts));
    let setupCents = 0;
    let runCents = 0;
    for (const op of operations) {
      const rate = e.machines[op.machine]?.hourlyRateCents;
      if (rate === undefined) throw new Error(`no machine ${op.machine}`);
      setupCents += roundCents((op.setupMinutes / 60) * rate);
      runCents += roundCents((op.cycleMinutesPerPart / 60) * rate * starts);
    }
    const finishingCents = Math.max(e.finishingPerPartCents * starts, e.finishingLotChargeCents);
    const extrasCents = 0;
    const costCents = materialCents + setupCents + runCents + finishingCents + extrasCents;
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
      extrasCents,
      costCents,
      markupCents,
      minimumAdjustmentCents,
      unitPriceCents,
      totalCents: unitPriceCents * quantity,
    };
  });
}

export function priceTurningExample(e: TurningExample): TurnResult {
  if (e.finishDiameterIn >= e.barDiameterIn)
    throw new Error("the part is turned down from the bar");
  if (e.partLengthIn < e.turnLengthIn) throw new Error("the turned length fits in the part");
  const cuts = turningCuts(e).map((c) => ({
    ...c,
    rpm: rpmFor(c.sfm, c.diameterIn),
    minutes: cutMinutes(c),
  }));
  const cycleMinutesExact = cuts.reduce((s, c) => s + c.minutes, 0) + e.handlingMinutesPerPart;
  const cycleMinutes = upToHundredth(cycleMinutesExact);
  const cutLengthIn = e.partLengthIn + e.cutAllowanceIn;
  const perBar = partsPerBar(e.barLengthIn, e.barRemnantIn, e.partLengthIn, e.cutAllowanceIn);
  if (perBar < 1) throw new Error("a part is longer than the usable bar");
  const operations: TurnOperation[] = [
    {
      label: "Turn, face and part off",
      machine: e.lathe.machine,
      setupMinutes: e.lathe.setupMinutes,
      cycleMinutesPerPart: cycleMinutes,
    },
    ...e.otherOperations,
  ];
  const bars = e.quantities.map((q) => Math.ceil(startsFor(q, e.falloutBps) / perBar));
  const breaks = priceBreaks(
    e,
    operations,
    (starts) => Math.ceil(starts / perBar) * (e.barLengthIn / 12) * e.pricePerFootCents,
  );
  const lengthUsedBreaks = priceBreaks(
    e,
    operations,
    (starts) => starts * (cutLengthIn / 12) * e.pricePerFootCents,
  );
  return {
    cuts,
    cycleMinutesExact,
    cycleMinutes,
    cutLengthIn,
    partsPerBar: perBar,
    bars,
    operations,
    breaks,
    lengthUsedBreaks,
  };
}

/**
 * The made-up job on the page: a stainless pin turned from 1-1/4 in round bar on a CNC lathe with a
 * bar feeder, faced, roughed and finished to 1 in over 2.5 in, parted off at 2.875 in, deburred,
 * inspected and passivated by a vendor, quoted at 10, 100 and 500. Every rate, speed, feed and price
 * here is invented to show the arithmetic; labor markup is 0 because the shop rates are taken to hold
 * the margin already.
 */
export const EXAMPLE: TurningExample = {
  partName: "stainless pin",
  quantities: [10, 100, 500],
  barDiameterIn: 1.25,
  finishDiameterIn: 1,
  turnLengthIn: 2.5,
  partLengthIn: 2.875,
  finishStockIn: 0.01,
  roughDepthIn: 0.06,
  roughSfm: 400,
  roughIprIn: 0.008,
  finishSfm: 500,
  finishIprIn: 0.004,
  faceSfm: 400,
  faceIprIn: 0.006,
  partOffSfm: 250,
  partOffIprIn: 0.002,
  handlingMinutesPerPart: 0.5,
  lathe: { machine: 0, setupMinutes: 75 },
  otherOperations: [
    { label: "Deburr and inspect", machine: 1, setupMinutes: 0, cycleMinutesPerPart: 0.75 },
    { label: "First-article check", machine: 1, setupMinutes: 30, cycleMinutesPerPart: 0 },
  ],
  machines: [
    { name: "CNC lathe with bar feeder", hourlyRateCents: 8_500 },
    { name: "Bench", hourlyRateCents: 5_500 },
  ],
  materialName: "303 stainless round bar, 1-1/4 in",
  stockDescription: "1-1/4 in round bar, 12 ft",
  pricePerFootCents: 980,
  cutAllowanceIn: 0.125,
  barLengthIn: 144,
  barRemnantIn: 6,
  finishingName: "Passivation (outside vendor)",
  finishingPerPartCents: 45,
  finishingLotChargeCents: 12_500,
  falloutBps: 200,
  laborMarkupBps: 0,
  materialMarkupBps: 2_000,
  outsideServiceMarkupBps: 1_500,
  minimumLineCents: 25_000,
};
