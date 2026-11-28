// The arithmetic behind the /machine-shop-minimum-charge guide. The page prints a small made-up part
// quoted at quantities from 1 to 100, shows which of the three minimums on a quote (the material
// minimum, the outside vendor's lot charge and the line minimum) sets the price at each quantity, and
// works out a line minimum from the per-order work a machine-hour rate does not see. Every figure comes
// from here, so the prose, the tables and the tests cannot disagree.
//
// Lines are priced with ./rush-example's priceLine, the same subset of the costing engine the rush
// guide uses; apps/jobshop-quote/test/unit/site-minimum-charge-example.test.ts prices the same inputs
// with the real engine (apps/jobshop-quote/src/shared/costing.ts) and checks every break to the cent.
// The inputs are made up for illustration (labelled so on the page), never presented as industry
// figures.

import { EXAMPLE as BASE } from "./quote-example";
import { type LineBreak, type LineSpec, priceLine } from "./rush-example";

/** The quantities the main table quotes. */
export const TABLE_QUANTITIES = [1, 2, 5, 10, 25, 50, 100] as const;

/**
 * The made-up part: a small anodized 6061 spacer cut from plate, one setup and a deburr, on the same
 * mill, at the same rate and with the same anodizer as the CNC guide's bracket. Small parts are where
 * minimums decide the price, so the example is deliberately a cheap part.
 */
export const SPACER: LineSpec = {
  quantities: [...TABLE_QUANTITIES],
  blank: { lengthIn: 1.75, widthIn: 1.75, thicknessIn: 0.625 },
  materialName: BASE.materialName,
  densityLbPerIn3: BASE.densityLbPerIn3,
  pricePerLbCents: BASE.pricePerLbCents,
  scrapBps: BASE.scrapBps,
  materialMinChargeCents: BASE.materialMinChargeCents,
  machines: [{ name: BASE.machineName, hourlyRateCents: BASE.hourlyRateCents }],
  operations: [
    {
      label: "Program and first-piece check",
      machine: 0,
      setupMinutes: 20,
      cycleMinutesPerPart: 0,
    },
    {
      label: "Op 1: face, profile, drill and chamfer",
      machine: 0,
      setupMinutes: 25,
      cycleMinutesPerPart: 3,
    },
    { label: "Deburr and inspect", machine: 0, setupMinutes: 0, cycleMinutesPerPart: 1 },
  ],
  finishing: {
    name: BASE.finishingName,
    perPartCents: BASE.finishingPerPartCents,
    lotChargeCents: BASE.finishingLotChargeCents,
  },
  extras: [],
  falloutBps: BASE.falloutBps,
  laborMarkupBps: BASE.laborMarkupBps,
  materialMarkupBps: BASE.materialMarkupBps,
  outsideServiceMarkupBps: BASE.outsideServiceMarkupBps,
  minimumLineCents: BASE.minimumLineCents,
};

/** The same spacer shipped as machined: no outside service, so no vendor lot charge to hide behind. */
export const BARE_SPACER: LineSpec = {
  ...SPACER,
  finishing: { name: "None (shipped as machined)", perPartCents: 0, lotChargeCents: 0 },
};

/** One piece of per-order work a machine-hour rate does not carry, in minutes of office time. */
export interface OrderTask {
  label: string;
  minutes: number;
}

/**
 * The made-up office work one order of the bare spacer takes whatever its size (a line with outside
 * processing adds sending the lot out and receiving it back): the time a shop spends on a line before
 * and after the spindle turns. Invented to show the arithmetic; time your own.
 */
export const ORDER_TASKS: readonly OrderTask[] = [
  { label: "Read the RFQ and drawing, quote it", minutes: 20 },
  { label: "Enter the order, check the PO against the quote", minutes: 10 },
  { label: "Buy the material, receive it, file the cert", minutes: 15 },
  { label: "Final paperwork (packing slip, certificate of conformance)", minutes: 10 },
  { label: "Pack and ship", minutes: 15 },
  { label: "Invoice, and chase the payment", minutes: 10 },
];

/** The made-up loaded cost of an hour of office time (wage, payroll costs and the desk). */
export const OFFICE_RATE_CENTS = 5_500;

/** The line minimum a shop might round up to from the floor, in whole dollars. Made up. */
export const ROUND_TO_CENTS = 5_000;

const roundCents = (x: number) => Math.round(x + Number.EPSILON * Math.sign(x));

/** Which minimum sets each component of a break, and what the line would cost without any of them. */
export interface MinimumBreak extends LineBreak {
  /** The material line is the supplier's minimum, not the weight. */
  materialAtMinimum: boolean;
  /** The outside service is the vendor's lot charge, not the per-part price. */
  finishingAtLotCharge: boolean;
  /** The line minimum topped the price up. */
  lineAtMinimum: boolean;
  /** The same line priced with all three minimums at zero, rounded the same way. */
  noMinimumsTotalCents: number;
  /** What the three minimums add over noMinimumsTotalCents. */
  minimumsAddCents: number;
}

function withoutMinimums(s: LineSpec): LineSpec {
  return {
    ...s,
    materialMinChargeCents: 0,
    finishing: { ...s.finishing, lotChargeCents: 0 },
    minimumLineCents: 0,
  };
}

export function priceWithMinimums(s: LineSpec = SPACER): MinimumBreak[] {
  const breaks = priceLine(s);
  const bare = priceLine(withoutMinimums(s));
  return breaks.map((b, i) => {
    const n = bare[i];
    if (!n || n.quantity !== b.quantity) throw new Error("both lines quote the same quantities");
    return {
      ...b,
      materialAtMinimum: s.materialMinChargeCents > 0 && n.materialCents < s.materialMinChargeCents,
      finishingAtLotCharge:
        s.finishing.lotChargeCents > 0 && n.finishingCents < s.finishing.lotChargeCents,
      lineAtMinimum: b.minimumAdjustmentCents > 0,
      noMinimumsTotalCents: n.totalCents,
      minimumsAddCents: b.totalCents - n.totalCents,
    };
  });
}

export interface MinimumReach {
  /** The smallest quantity at which this minimum no longer sets the price (null: not within the limit). */
  material: number | null;
  finishing: number | null;
  line: number | null;
}

/**
 * The first quantity, from 1 up to `limit`, at which each minimum stops binding. Each one binds on the
 * smallest lots and lets go as the quantity grows (more weight, more parts, a bigger price), so the
 * first quantity it lets go is where the guide says "from N parts on".
 */
export function minimumReach(s: LineSpec = SPACER, limit = 500): MinimumReach {
  const quantities = Array.from({ length: limit }, (_, i) => i + 1);
  const rows = priceWithMinimums({ ...s, quantities });
  const first = (pred: (b: MinimumBreak) => boolean) => rows.find(pred)?.quantity ?? null;
  return {
    material: first((b) => !b.materialAtMinimum),
    finishing: first((b) => !b.finishingAtLotCharge),
    line: first((b) => !b.lineAtMinimum),
  };
}

export interface MinimumFloor {
  officeMinutes: number;
  officeCents: number;
  /** The smallest order of the example part: its quantity-1 price with no line minimum. */
  smallestLineCents: number;
  /** Office time + the smallest line: the least a one-off line of this part costs the shop. */
  floorCents: number;
  /** floorCents rounded up to ROUND_TO_CENTS. */
  suggestedMinimumCents: number;
}

/**
 * A line minimum worked out instead of guessed: the per-order office work (which the machine-hour
 * rate spreads over spindle hours, so a one-off barely pays for it) added to the cheapest version of
 * the job the shop actually makes, rounded up.
 */
export function minimumFloor(
  s: LineSpec = BARE_SPACER,
  tasks: readonly OrderTask[] = ORDER_TASKS,
  officeRateCents = OFFICE_RATE_CENTS,
  roundTo = ROUND_TO_CENTS,
): MinimumFloor {
  const officeMinutes = tasks.reduce((sum, t) => sum + t.minutes, 0);
  const officeCents = roundCents((officeMinutes / 60) * officeRateCents);
  const [one] = priceLine({ ...s, quantities: [1], minimumLineCents: 0 });
  if (!one) throw new Error("no quantity-1 break");
  const floorCents = officeCents + one.totalCents;
  return {
    officeMinutes,
    officeCents,
    smallestLineCents: one.totalCents,
    floorCents,
    suggestedMinimumCents: Math.ceil(floorCents / roundTo) * roundTo,
  };
}
