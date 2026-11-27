// The arithmetic behind the /how-to-quote-sheet-metal guide. The page prints a worked example whose
// figures come from here, so the prose, the table and the tests cannot disagree. It follows Job Shop
// Quote's costing engine (apps/jobshop-quote/src/shared/costing.ts) for what a laser-cut and bent part
// uses: sheet material bought by the sheet, parts per sheet from a nest, a cut time from the flat
// pattern's cut length and pierces, a bend time from its bend lines, several machines at their own
// rates, one outside service, purchased hardware, fallout, markups and a line minimum.
// apps/jobshop-quote/test/unit/site-sheet-metal-example.test.ts checks that the engine (and its nest
// and DXF suggestions) gives the same numbers. The inputs are made up for illustration (labelled so on
// the page), never presented as industry figures.

export interface SheetOperation {
  label: string;
  machine: string;
  hourlyRateCents: number;
  setupMinutes: number;
  cycleMinutesPerPart: number;
}

export interface SheetMetalExample {
  partName: string;
  quantities: number[];
  /** The DXF flat pattern: overall size, cut path, closed contours (pierces) and bend lines. */
  flat: { widthIn: number; heightIn: number; cutLengthIn: number; pierces: number; bends: number };
  materialName: string;
  sheet: { widthIn: number; lengthIn: number; gapIn: number };
  sheetPriceCents: number;
  /** Parts per sheet from the app's rectangular nest (checked against nestYield by the app's test). */
  partsPerSheet: number;
  materialMinChargeCents: number;
  laser: { name: string; hourlyRateCents: number; cutSpeedInPerMin: number; pierceSeconds: number };
  brake: { name: string; hourlyRateCents: number; secondsPerBend: number };
  /** Setup-only and hand operations entered by the estimator. */
  laserSetupMinutes: number;
  programMinutes: number;
  brakeSetupMinutes: number;
  bench: { name: string; hourlyRateCents: number; minutesPerPart: number };
  finishingName: string;
  finishingPerPartCents: number;
  finishingLotChargeCents: number;
  hardwareLabel: string;
  hardwarePerPartCents: number;
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
  extrasCents: number;
  costCents: number;
  markupCents: number;
  minimumAdjustmentCents: number;
  unitPriceCents: number;
  totalCents: number;
}

export interface SheetResult {
  cutMinutesPerPart: number;
  bendMinutesPerPart: number;
  operations: SheetOperation[];
  breaks: SheetBreak[];
}

const roundCents = (x: number) => Math.round(x + Number.EPSILON * Math.sign(x));
const pct = (bps: number) => bps / 10_000;
/** Minutes rounded UP to the hundredth, as the app's DXF suggestions do. */
const upToHundredth = (min: number) => Math.ceil(min * 100 - 1e-9) / 100;

export function startsFor(quantity: number, falloutBps: number): number {
  if (falloutBps <= 0) return quantity;
  return Math.ceil((quantity * 10_000) / (10_000 - falloutBps) - 1e-9);
}

/** Cut time per part: cut length ÷ cut speed + pierces × pierce seconds. */
export function cutMinutes(e: SheetMetalExample): number {
  return upToHundredth(
    e.flat.cutLengthIn / e.laser.cutSpeedInPerMin + (e.flat.pierces * e.laser.pierceSeconds) / 60,
  );
}

/** Bend time per part: bend lines × seconds per bend. */
export function bendMinutes(e: SheetMetalExample): number {
  return upToHundredth((e.flat.bends * e.brake.secondsPerBend) / 60);
}

/** The operations in the order the app lists them on the line. */
export function operationsOf(e: SheetMetalExample): SheetOperation[] {
  return [
    {
      label: "Program and nest",
      machine: e.laser.name,
      hourlyRateCents: e.laser.hourlyRateCents,
      setupMinutes: e.programMinutes,
      cycleMinutesPerPart: 0,
    },
    {
      label: "Laser cut",
      machine: e.laser.name,
      hourlyRateCents: e.laser.hourlyRateCents,
      setupMinutes: e.laserSetupMinutes,
      cycleMinutesPerPart: cutMinutes(e),
    },
    {
      label: "Bend",
      machine: e.brake.name,
      hourlyRateCents: e.brake.hourlyRateCents,
      setupMinutes: e.brakeSetupMinutes,
      cycleMinutesPerPart: bendMinutes(e),
    },
    {
      label: "Deburr, insert hardware, inspect",
      machine: e.bench.name,
      hourlyRateCents: e.bench.hourlyRateCents,
      setupMinutes: 0,
      cycleMinutesPerPart: e.bench.minutesPerPart,
    },
  ];
}

export function priceSheetExample(e: SheetMetalExample): SheetResult {
  if (e.falloutBps < 0 || e.falloutBps >= 10_000) throw new Error("fallout is below 100%");
  if (e.quantities.some((q) => !Number.isInteger(q) || q < 1))
    throw new Error("quantities are whole numbers of parts");
  if (!Number.isInteger(e.partsPerSheet) || e.partsPerSheet < 1)
    throw new Error("at least one part fits a sheet");
  const operations = operationsOf(e);
  const breaks = e.quantities.map((quantity) => {
    const starts = startsFor(quantity, e.falloutBps);
    const sheets = Math.ceil(starts / e.partsPerSheet);
    const materialCents = Math.max(
      roundCents(sheets * e.sheetPriceCents),
      e.materialMinChargeCents,
    );
    let setupCents = 0;
    let runCents = 0;
    for (const op of operations) {
      setupCents += roundCents((op.setupMinutes / 60) * op.hourlyRateCents);
      runCents += roundCents((op.cycleMinutesPerPart / 60) * op.hourlyRateCents * starts);
    }
    const finishingCents = Math.max(e.finishingPerPartCents * starts, e.finishingLotChargeCents);
    // Hardware goes on the parts shipped, not the parts started (the engine's extras).
    const extrasCents = e.hardwarePerPartCents * quantity;
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
      sheets,
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
    cutMinutesPerPart: cutMinutes(e),
    bendMinutesPerPart: bendMinutes(e),
    operations,
    breaks,
  };
}

/**
 * The made-up job on the page: a 14 gauge steel mounting bracket, laser cut from a 4 × 10 ft sheet,
 * three bends, four press-in nuts, powder coated by a vendor, quoted at 10, 100 and 500. Labor markup
 * is 0 because each machine rate already holds the margin (the /machine-shop-hourly-rate method).
 */
export const SHEET_EXAMPLE: SheetMetalExample = {
  partName: "electrical box mounting bracket",
  quantities: [10, 100, 500],
  flat: { widthIn: 6.5, heightIn: 9.25, cutLengthIn: 62.4, pierces: 9, bends: 3 },
  materialName: "14 ga (0.075 in) cold-rolled steel",
  sheet: { widthIn: 48, lengthIn: 120, gapIn: 0.25 },
  sheetPriceCents: 18_000,
  partsPerSheet: 88,
  materialMinChargeCents: 4_000,
  laser: {
    name: "Fiber laser",
    hourlyRateCents: 18_000,
    cutSpeedInPerMin: 200,
    pierceSeconds: 0.5,
  },
  brake: { name: "Press brake", hourlyRateCents: 9_500, secondsPerBend: 8 },
  laserSetupMinutes: 10,
  programMinutes: 20,
  brakeSetupMinutes: 25,
  bench: { name: "Bench", hourlyRateCents: 7_000, minutesPerPart: 1.5 },
  finishingName: "Black powder coat (outside vendor)",
  finishingPerPartCents: 450,
  finishingLotChargeCents: 17_500,
  hardwareLabel: "Press-in nuts, 4 per part",
  hardwarePerPartCents: 72,
  falloutBps: 200,
  laborMarkupBps: 0,
  materialMarkupBps: 1_500,
  outsideServiceMarkupBps: 1_500,
  minimumLineCents: 15_000,
};
