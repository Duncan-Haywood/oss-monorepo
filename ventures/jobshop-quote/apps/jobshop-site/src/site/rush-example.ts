// The arithmetic behind the /how-to-price-a-rush-job guide. The page prints the CNC guide's made-up
// bracket (./quote-example) quoted twice, at the normal lead time and as a rush, and the figures come
// from here, so the prose, the table and the tests cannot disagree.
//
// A rush is priced the same way as any job, with the costs the rush adds typed in as their own lines:
// the machining run on overtime (a second rate for the same mill), the job it bumps off the machine
// torn down and set up again, the material sent same-day, and the anodizer's expedite. Job Shop Quote
// has no "rush" switch; the page says so and shows how those lines go on a quote.
//
// apps/jobshop-quote/test/unit/site-rush-example.test.ts prices both lines with the real costing
// engine (apps/jobshop-quote/src/shared/costing.ts) and checks every figure to the cent. The inputs are
// made up for illustration (labelled so on the page), never presented as industry figures.

import { EXAMPLE as BASE, startsFor } from "./quote-example";

export interface RushMachine {
  name: string;
  hourlyRateCents: number;
}

export interface RushOperation {
  label: string;
  /** Index into LineSpec.machines. */
  machine: number;
  setupMinutes: number;
  cycleMinutesPerPart: number;
}

export interface RushFinishing {
  name: string;
  perPartCents: number;
  lotChargeCents: number;
}

export interface RushExtra {
  label: string;
  perPartCents: number;
  lotCents: number;
}

/** One quote line in the subset of the costing engine this guide uses. */
export interface LineSpec {
  quantities: number[];
  blank: { lengthIn: number; widthIn: number; thicknessIn: number };
  materialName: string;
  densityLbPerIn3: number;
  pricePerLbCents: number;
  scrapBps: number;
  materialMinChargeCents: number;
  machines: RushMachine[];
  operations: RushOperation[];
  finishing: RushFinishing;
  extras: RushExtra[];
  falloutBps: number;
  laborMarkupBps: number;
  materialMarkupBps: number;
  outsideServiceMarkupBps: number;
  minimumLineCents: number;
}

export interface LineBreak {
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

const roundCents = (x: number) => Math.round(x + Number.EPSILON * Math.sign(x));
const pct = (bps: number) => bps / 10_000;

/** The engine's sum for one line, for the parts this guide uses. */
export function priceLine(s: LineSpec): LineBreak[] {
  if (s.falloutBps < 0 || s.falloutBps >= 10_000) throw new Error("fallout is below 100%");
  if (s.quantities.some((q) => !Number.isInteger(q) || q < 1))
    throw new Error("quantities are whole numbers of parts");
  const { lengthIn, widthIn, thicknessIn } = s.blank;
  const blankWeightLb = lengthIn * widthIn * thicknessIn * s.densityLbPerIn3;
  return s.quantities.map((quantity) => {
    const starts = startsFor(quantity, s.falloutBps);
    const materialCents = Math.max(
      roundCents(blankWeightLb * starts * s.pricePerLbCents * (1 + pct(s.scrapBps))),
      s.materialMinChargeCents,
    );
    let setupCents = 0;
    let runCents = 0;
    for (const op of s.operations) {
      const rate = s.machines[op.machine]?.hourlyRateCents;
      if (rate === undefined) throw new Error(`no machine ${op.machine}`);
      setupCents += roundCents((op.setupMinutes / 60) * rate);
      runCents += roundCents((op.cycleMinutesPerPart / 60) * rate * starts);
    }
    const finishingCents = Math.max(s.finishing.perPartCents * starts, s.finishing.lotChargeCents);
    // Extras go on the parts shipped (the quantity), not the parts started, as in the engine.
    const extrasCents = s.extras.reduce(
      (sum, x) => sum + x.perPartCents * quantity + x.lotCents,
      0,
    );
    const costCents = materialCents + setupCents + runCents + finishingCents + extrasCents;
    const markupCents =
      roundCents(materialCents * pct(s.materialMarkupBps)) +
      roundCents((setupCents + runCents) * pct(s.laborMarkupBps)) +
      roundCents(finishingCents * pct(s.outsideServiceMarkupBps)) +
      roundCents(extrasCents * pct(s.materialMarkupBps));
    const priced = costCents + markupCents;
    const minimumAdjustmentCents = Math.max(0, s.minimumLineCents - priced);
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

export interface RushAssumptions {
  /** Added to the mill's hourly rate for hours run on overtime (the operator's premium and its payroll costs). */
  overtimePremiumCents: number;
  /** Indexes into the base job's operations that run on overtime. */
  overtimeOperations: number[];
  /** Tearing the bumped job down now and setting it up again later, minutes at the normal rate. */
  bumpedJobMinutes: number;
  /** The supplier's same-day delivery for the plate, per order. */
  materialDeliveryCents: number;
  /** The anodizer's expedited service: its per-part price and lot minimum. */
  finishing: RushFinishing;
  /** A flat surcharge some shops add instead of costing the rush, basis points of the normal price. */
  flatSurchargeBps: number;
}

/**
 * The made-up rush: the customer needs the brackets in days, not weeks. Ops 1 and 2 and the deburr run
 * on overtime, another customer's job set up on the mill is pulled off and put back later, the plate
 * comes same-day, and the anodizer turns the lot in two days at its expedite price. Invented to show
 * the arithmetic.
 */
export const RUSH: RushAssumptions = {
  overtimePremiumCents: 2_400,
  overtimeOperations: [1, 2, 3],
  bumpedJobMinutes: 50,
  materialDeliveryCents: 8_500,
  finishing: {
    name: "Clear anodize, 2-day expedite (outside vendor)",
    perPartCents: 525,
    lotChargeCents: 30_000,
  },
  flatSurchargeBps: 2_500,
};

const NORMAL_MILL = 0;
const OVERTIME_MILL = 1;

/** The CNC guide's bracket as a LineSpec: one mill, no extras. Prices to the same cent as that guide. */
export function normalLine(): LineSpec {
  return {
    quantities: BASE.quantities,
    blank: BASE.blank,
    materialName: BASE.materialName,
    densityLbPerIn3: BASE.densityLbPerIn3,
    pricePerLbCents: BASE.pricePerLbCents,
    scrapBps: BASE.scrapBps,
    materialMinChargeCents: BASE.materialMinChargeCents,
    machines: [{ name: BASE.machineName, hourlyRateCents: BASE.hourlyRateCents }],
    operations: BASE.operations.map((o) => ({ ...o, machine: NORMAL_MILL })),
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
}

/** The same bracket as a rush: overtime rate on the chosen operations, the bumped job, expedites. */
export function rushLine(r: RushAssumptions = RUSH): LineSpec {
  const normal = normalLine();
  const millName = BASE.machineName;
  return {
    ...normal,
    machines: [
      { name: millName, hourlyRateCents: BASE.hourlyRateCents },
      {
        name: `${millName} (overtime)`,
        hourlyRateCents: BASE.hourlyRateCents + r.overtimePremiumCents,
      },
    ],
    operations: [
      ...normal.operations.map((o, i) => ({
        ...o,
        machine: r.overtimeOperations.includes(i) ? OVERTIME_MILL : NORMAL_MILL,
      })),
      {
        label: "Tear down and re-set the bumped job",
        machine: NORMAL_MILL,
        setupMinutes: r.bumpedJobMinutes,
        cycleMinutesPerPart: 0,
      },
    ],
    finishing: r.finishing,
    extras: [
      { label: "Same-day plate delivery", perPartCents: 0, lotCents: r.materialDeliveryCents },
    ],
  };
}

export interface RushComparison {
  quantity: number;
  normal: LineBreak;
  rush: LineBreak;
  /** Rush line total minus normal line total. */
  premiumCents: number;
  /** The premium as basis points of the normal total, rounded to the nearest. */
  premiumBps: number;
  /** The normal total with the flat surcharge added, rounded to the cent. */
  flatCents: number;
  /** Flat-surcharge total minus the costed rush total: below 0, the flat surcharge charges less than the rush costs. */
  flatMinusRushCents: number;
}

export function compareRush(r: RushAssumptions = RUSH): RushComparison[] {
  const normal = priceLine(normalLine());
  const rush = priceLine(rushLine(r));
  return normal.map((n, i) => {
    const h = rush[i];
    if (!h || h.quantity !== n.quantity) throw new Error("both lines quote the same quantities");
    const premiumCents = h.totalCents - n.totalCents;
    const flatCents = roundCents(n.totalCents * (1 + pct(r.flatSurchargeBps)));
    return {
      quantity: n.quantity,
      normal: n,
      rush: h,
      premiumCents,
      premiumBps: Math.round((premiumCents / n.totalCents) * 10_000),
      flatCents,
      flatMinusRushCents: flatCents - h.totalCents,
    };
  });
}
