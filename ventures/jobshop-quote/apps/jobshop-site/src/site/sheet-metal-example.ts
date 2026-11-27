// The arithmetic behind the /how-to-quote-sheet-metal guide. The page prints a worked example whose
// figures come from here, so the prose, the table and the tests cannot disagree. It follows Job Shop
// Quote's costing engine (apps/jobshop-quote/src/shared/costing.ts) for the parts a laser-cut and
// bent part uses: the "Cut from DXF" and "Bend from DXF" times (suggestCuttingOperation,
// suggestBendingOperation), sheets bought whole (a per_stock material), one machine rate per
// operation, an outside powder coat, fallout, markups and a line minimum.
// apps/jobshop-quote/test/unit/site-sheet-metal-example.test.ts prices EXAMPLE with the real engine
// and checks every figure to the cent. The inputs are made up for illustration (labelled so on the
// page), never presented as industry figures.

import { startsFor } from "./quote-example";

export interface SheetMachine {
  name: string;
  hourlyRateCents: number;
}

export interface SheetOperation {
  label: string;
  /** Index into SheetMetalExample.machines. */
  machine: number;
  setupMinutes: number;
  cycleMinutesPerPart: number;
}

export interface SheetMetalExample {
  partName: string;
  quantities: number[];
  /** What the flat-pattern DXF measures (inches). */
  flat: {
    widthIn: number;
    heightIn: number;
    cutLengthIn: number;
    pierceCount: number;
    bendLines: number;
  };
  materialName: string;
  sheetDescription: string;
  sheetPriceCents: number;
  /** The sheet and the gap the rate card's material row nests on (inches). */
  sheet: { widthIn: number; lengthIn: number; gapIn: number };
  /**
   * The app's rectangular nest of the flat blank (rounded up to 1/8 in) on that sheet
   * (apps/jobshop-quote/src/shared/nest.ts); the parity test checks this count.
   */
  partsPerSheet: number;
  laser: { cutSpeedInPerMin: number; pierceSeconds: number; setupMinutes: number };
  brake: { secondsPerBend: number; setupMinutes: number };
  machines: SheetMachine[];
  /** Index of the laser and the press brake in `machines`. */
  laserMachine: number;
  brakeMachine: number;
  /** Operations the estimator adds by hand (programming, deburr), in quote order after cut and bend. */
  otherOperations: SheetOperation[];
  finishingName: string;
  finishingPerPartCents: number;
  finishingLotChargeCents: number;
  falloutBps: number;
  laborMarkupBps: number;
  materialMarkupBps: number;
  outsideServiceMarkupBps: number;
  minimumLineCents: number;
}

export interface SheetBreak {
  quantity: number;
  starts: number;
  sheets: number;
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

export interface SheetResult {
  /** Laser minutes per part, before rounding up to the hundredth. */
  cutMinutesExact: number;
  cutMinutes: number;
  bendMinutes: number;
  operations: SheetOperation[];
  breaks: SheetBreak[];
}

const roundCents = (x: number) => Math.round(x + Number.EPSILON * Math.sign(x));
const pct = (bps: number) => bps / 10_000;
/** The app's rule: cycle minutes rounded UP to the hundredth, so a short cut is never lost. */
export const upToHundredth = (min: number) => Math.ceil(min * 100 - 1e-9) / 100;

/** The flat blank the app sizes from the DXF: each side rounded up to the next 1/8 in. */
export function flatBlank(e: SheetMetalExample): { widthIn: number; lengthIn: number } {
  const up = (v: number) => Math.ceil(v * 8 - 1e-9) / 8;
  const [widthIn, lengthIn] = [up(e.flat.widthIn), up(e.flat.heightIn)].sort((a, b) => a - b) as [
    number,
    number,
  ];
  return { widthIn, lengthIn };
}

/** The laser's minutes per part: cut length at the cut speed plus every pierce. */
export function cutMinutes(e: SheetMetalExample): number {
  return (
    e.flat.cutLengthIn / e.laser.cutSpeedInPerMin +
    (e.flat.pierceCount * e.laser.pierceSeconds) / 60
  );
}

export function priceSheetExample(e: SheetMetalExample): SheetResult {
  if (e.falloutBps < 0 || e.falloutBps >= 10_000) throw new Error("fallout is below 100%");
  if (!Number.isInteger(e.partsPerSheet) || e.partsPerSheet < 1)
    throw new Error("parts per sheet is a whole number");
  const cutMinutesExact = cutMinutes(e);
  const cut = upToHundredth(cutMinutesExact);
  const bend = upToHundredth((e.flat.bendLines * e.brake.secondsPerBend) / 60);
  const operations: SheetOperation[] = [
    {
      label: "Laser cut from the DXF",
      machine: e.laserMachine,
      setupMinutes: e.laser.setupMinutes,
      cycleMinutesPerPart: cut,
    },
    {
      label: "Press brake from the bend lines",
      machine: e.brakeMachine,
      setupMinutes: e.brake.setupMinutes,
      cycleMinutesPerPart: bend,
    },
    ...e.otherOperations,
  ];
  const breaks = e.quantities.map((quantity) => {
    const starts = startsFor(quantity, e.falloutBps);
    const sheets = Math.ceil(starts / e.partsPerSheet);
    const materialCents = roundCents(sheets * e.sheetPriceCents);
    let setupCents = 0;
    let runCents = 0;
    for (const op of operations) {
      const rate = e.machines[op.machine]?.hourlyRateCents;
      if (rate === undefined) throw new Error(`no machine ${op.machine}`);
      setupCents += roundCents((op.setupMinutes / 60) * rate);
      runCents += roundCents((op.cycleMinutesPerPart / 60) * rate * starts);
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
      sheets,
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
  return { cutMinutesExact, cutMinutes: cut, bendMinutes: bend, operations, breaks };
}

/**
 * The made-up job on the page: a powder-coated 14 gauge steel mounting bracket, laser cut, bent
 * twice and deburred, quoted at 10, 100 and 500. Every rate, speed and price here is invented to show
 * the arithmetic; labor markup is 0 because the machine rates are taken to hold the margin already.
 */
export const EXAMPLE: SheetMetalExample = {
  partName: "mounting bracket",
  quantities: [10, 100, 500],
  flat: { widthIn: 6.3, heightIn: 9.1, cutLengthIn: 41.8, pierceCount: 7, bendLines: 2 },
  materialName: "14 ga (0.075 in) cold-rolled steel",
  sheetDescription: "48 × 120 in sheet",
  sheetPriceCents: 9_800,
  sheet: { widthIn: 48, lengthIn: 120, gapIn: 0.25 },
  partsPerSheet: 90,
  laser: { cutSpeedInPerMin: 160, pierceSeconds: 0.8, setupMinutes: 15 },
  brake: { secondsPerBend: 9, setupMinutes: 20 },
  machines: [
    { name: "Fiber laser", hourlyRateCents: 16_500 },
    { name: "Press brake", hourlyRateCents: 9_500 },
    { name: "Bench", hourlyRateCents: 6_500 },
  ],
  laserMachine: 0,
  brakeMachine: 1,
  otherOperations: [
    { label: "Program and nest", machine: 0, setupMinutes: 30, cycleMinutesPerPart: 0 },
    { label: "Deburr and inspect", machine: 2, setupMinutes: 0, cycleMinutesPerPart: 0.75 },
  ],
  finishingName: "Black powder coat (outside vendor)",
  finishingPerPartCents: 275,
  finishingLotChargeCents: 17_500,
  falloutBps: 200,
  laborMarkupBps: 0,
  materialMarkupBps: 2_000,
  outsideServiceMarkupBps: 1_500,
  minimumLineCents: 15_000,
};
