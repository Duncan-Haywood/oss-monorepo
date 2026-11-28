// The arithmetic behind the /how-to-quote-outside-processing guide (heat treat, anodize, plating,
// black oxide and other work sent to a vendor). The page prints a worked example whose figures come
// from here, so the prose, the tables and the tests cannot disagree.
//
// It follows Job Shop Quote's costing engine (apps/jobshop-quote/src/shared/costing.ts) for one
// machined steel part with two outside services: material per lb on the blank weight plus scrap, at
// least the material minimum; one machine rate per operation; fallout (parts started so the good ones
// ship); each outside service priced max(per-part charge × starts, lot minimum) and marked up at the
// outside-service rate; extras (freight to and from the vendors, a certificate) per lot, marked up at
// the material rate; a line minimum.
//
// Two more things the page needs and the engine does not do:
// - A per-lb heat-treat price turned into the per-part charge a rate card holds (finished weight ×
//   $/lb, rounded to the cent). The engine's finishing ops are per part with a lot minimum.
// - The "naive" quote an estimator gets by multiplying the vendor's per-part price by the quantity:
//   no lot minimums, no freight or certificate, no markup on the outside work. It is priced by the
//   same engine with those removed, so the shortfall printed on the page is exact.
//
// apps/jobshop-quote/test/unit/site-outside-processing-example.test.ts prices EXAMPLE and the naive
// variant with the real engine and checks every figure to the cent. The inputs are made up for
// illustration (labelled so on the page), never presented as industry prices.

import { startsFor } from "./quote-example";

export interface OpMachine {
  name: string;
  hourlyRateCents: number;
}

export interface OpOperation {
  label: string;
  /** Index into OutsideExample.machines. */
  machine: number;
  setupMinutes: number;
  cycleMinutesPerPart: number;
}

export interface OutsideService {
  name: string;
  /** What the vendor charges per part, cents (for a per-lb service, from perLbPrice()). */
  perPartCents: number;
  /** The vendor's minimum charge per batch (lot charge), cents. */
  lotChargeCents: number;
}

export interface OutsideExtra {
  label: string;
  lotCents: number;
}

export interface OutsideExample {
  partName: string;
  quantities: number[];
  materialName: string;
  blank: { lengthIn: number; widthIn: number; thicknessIn: number };
  densityLbPerIn3: number;
  pricePerLbCents: number;
  scrapBps: number;
  materialMinChargeCents: number;
  /** The machined part's weight, from the CAD model: what the heat treater weighs and charges for. */
  finishedWeightLb: number;
  /** The heat treater's price per pound of parts, cents. */
  heatTreatPerLbCents: number;
  heatTreatLotChargeCents: number;
  heatTreatName: string;
  coatingName: string;
  coatingPerPartCents: number;
  coatingLotChargeCents: number;
  extras: OutsideExtra[];
  machines: OpMachine[];
  operations: OpOperation[];
  falloutBps: number;
  laborMarkupBps: number;
  materialMarkupBps: number;
  outsideServiceMarkupBps: number;
  minimumLineCents: number;
}

export interface OutsideBreak {
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

export interface ServiceCharge {
  name: string;
  /** Per break: what the vendor bills for the parts started. */
  cents: number[];
  /** Per break: true where the lot minimum, not the per-part price, sets the charge. */
  atMinimum: boolean[];
  /** Fewest parts started for which the per-part price reaches the lot minimum. */
  crossoverStarts: number;
}

export interface OutsideResult {
  blankWeightLb: number;
  services: OutsideService[];
  charges: ServiceCharge[];
  breaks: OutsideBreak[];
  /** Vendor per-part price × parts, no lot minimums, no extras, no outside markup. */
  naiveBreaks: OutsideBreak[];
}

const roundCents = (x: number) => Math.round(x + Number.EPSILON * Math.sign(x));
const pct = (bps: number) => bps / 10_000;

/** A per-lb vendor price as the per-part charge a rate card holds: weight × $/lb, to the cent. */
export const perLbPrice = (weightLb: number, perLbCents: number) =>
  roundCents(weightLb * perLbCents);

/** Parts started at which per-part × starts first reaches the lot minimum. */
export const crossoverStarts = (perPartCents: number, lotChargeCents: number) =>
  perPartCents <= 0 ? Number.POSITIVE_INFINITY : Math.ceil(lotChargeCents / perPartCents - 1e-9);

export function outsideServices(e: OutsideExample): OutsideService[] {
  return [
    {
      name: e.heatTreatName,
      perPartCents: perLbPrice(e.finishedWeightLb, e.heatTreatPerLbCents),
      lotChargeCents: e.heatTreatLotChargeCents,
    },
    {
      name: e.coatingName,
      perPartCents: e.coatingPerPartCents,
      lotChargeCents: e.coatingLotChargeCents,
    },
  ];
}

interface PriceOptions {
  services: OutsideService[];
  extras: OutsideExtra[];
  outsideServiceMarkupBps: number;
}

function priceBreaks(e: OutsideExample, blankWeightLb: number, o: PriceOptions): OutsideBreak[] {
  return e.quantities.map((quantity) => {
    const starts = startsFor(quantity, e.falloutBps);
    const materialCents = Math.max(
      roundCents(blankWeightLb * starts * e.pricePerLbCents * (1 + pct(e.scrapBps))),
      e.materialMinChargeCents,
    );
    let setupCents = 0;
    let runCents = 0;
    for (const op of e.operations) {
      const rate = e.machines[op.machine]?.hourlyRateCents;
      if (rate === undefined) throw new Error(`no machine ${op.machine}`);
      setupCents += roundCents((op.setupMinutes / 60) * rate);
      runCents += roundCents((op.cycleMinutesPerPart / 60) * rate * starts);
    }
    const finishingCents = o.services.reduce(
      (s, v) => s + Math.max(v.perPartCents * starts, v.lotChargeCents),
      0,
    );
    const extrasCents = o.extras.reduce((s, x) => s + x.lotCents, 0);
    const costCents = materialCents + setupCents + runCents + finishingCents + extrasCents;
    const markupCents =
      roundCents(materialCents * pct(e.materialMarkupBps)) +
      roundCents((setupCents + runCents) * pct(e.laborMarkupBps)) +
      roundCents(finishingCents * pct(o.outsideServiceMarkupBps)) +
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
}

export function priceOutsideExample(e: OutsideExample): OutsideResult {
  if (e.quantities.some((q) => !Number.isInteger(q) || q < 1))
    throw new Error("quantities are whole numbers of parts");
  const { lengthIn, widthIn, thicknessIn } = e.blank;
  const blankWeightLb = lengthIn * widthIn * thicknessIn * e.densityLbPerIn3;
  if (e.finishedWeightLb >= blankWeightLb) throw new Error("the part weighs less than its blank");
  const services = outsideServices(e);
  const startsList = e.quantities.map((q) => startsFor(q, e.falloutBps));
  const charges = services.map((v) => ({
    name: v.name,
    cents: startsList.map((s) => Math.max(v.perPartCents * s, v.lotChargeCents)),
    atMinimum: startsList.map((s) => v.perPartCents * s < v.lotChargeCents),
    crossoverStarts: crossoverStarts(v.perPartCents, v.lotChargeCents),
  }));
  const breaks = priceBreaks(e, blankWeightLb, {
    services,
    extras: e.extras,
    outsideServiceMarkupBps: e.outsideServiceMarkupBps,
  });
  const naiveBreaks = priceBreaks(e, blankWeightLb, {
    services: services.map((v) => ({ ...v, lotChargeCents: 0 })),
    extras: [],
    outsideServiceMarkupBps: 0,
  });
  return { blankWeightLb, services, charges, breaks, naiveBreaks };
}

/**
 * The made-up job on the page: a 4140 steel clamp block milled from a 4 × 2 × 1-1/4 in blank in two
 * setups, deburred and inspected, then hardened and tempered by a heat treater who charges by the
 * pound, and black oxided by a second vendor, with freight both ways and a heat-treat certificate,
 * quoted at 5, 50 and 250. Every rate and price here is invented to show the arithmetic; labor markup
 * is 0 because the shop rates are taken to hold the margin already.
 */
export const EXAMPLE: OutsideExample = {
  partName: "steel clamp block",
  quantities: [5, 50, 250],
  materialName: "4140 steel plate",
  blank: { lengthIn: 4, widthIn: 2, thicknessIn: 1.25 },
  densityLbPerIn3: 0.284,
  pricePerLbCents: 240,
  scrapBps: 1_000,
  materialMinChargeCents: 2_500,
  finishedWeightLb: 2.1,
  heatTreatPerLbCents: 85,
  heatTreatLotChargeCents: 17_500,
  heatTreatName: "Harden and temper (outside heat treater)",
  coatingName: "Black oxide (outside vendor)",
  coatingPerPartCents: 120,
  coatingLotChargeCents: 8_500,
  extras: [
    { label: "Freight to and from both vendors", lotCents: 9_000 },
    { label: "Heat-treat certificate", lotCents: 2_500 },
  ],
  machines: [
    { name: "Vertical machining center", hourlyRateCents: 9_500 },
    { name: "Bench", hourlyRateCents: 5_500 },
  ],
  operations: [
    { label: "Mill, two setups", machine: 0, setupMinutes: 90, cycleMinutesPerPart: 14 },
    { label: "Deburr and inspect", machine: 1, setupMinutes: 0, cycleMinutesPerPart: 3 },
    { label: "First-article check", machine: 1, setupMinutes: 30, cycleMinutesPerPart: 0 },
  ],
  falloutBps: 300,
  laborMarkupBps: 0,
  materialMarkupBps: 2_000,
  outsideServiceMarkupBps: 1_500,
  minimumLineCents: 30_000,
};
