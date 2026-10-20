// Pure pricing arithmetic for an independent vehicle wrap / graphics shop —
// one or a few install bays quoting a full or partial vinyl wrap on a car,
// van, or box truck, not a large fleet-branding contractor. No network, no
// state: every rate, hour, and square foot is an input the shop owner types
// in, so the result stays a transparent calculation they can check against
// their own supplier invoice and roll-usage log rather than a claim about
// what any job "should" cost.
//
// The method models the trap that erases margin silently: a shop quotes
// material cost from the vehicle's measured SURFACE AREA — the number a
// wrap-coverage chart or a customer's own measurement gives — but the vinyl
// actually gets bought and consumed by the LINEAR FOOT off a 60" roll, and
// cutting around mirrors, door handles, pillars, and compound curves wastes
// a real, non-trivial share of every roll. A flat "surface area × cost per
// square foot" quote prices the vehicle, not the roll, and quietly loses the
// waste share on every job:
//
//   1. `effectiveVinylSqFt` is what actually gets consumed once the waste
//      factor is applied — that is the number the material bill is really
//      based on, not the vehicle's bare surface area.
//   2. `wasteBlindLossPerJob` is what a shop loses per job if it prices
//      material at the bare surface area (ignoring waste) while still
//      paying for the waste-inclusive material it actually uses — the same
//      shape as an overage rate priced below a tipping fee elsewhere in this
//      portfolio's calculators, just on the material side instead of the
//      disposal side.

function number(value, name, { min = 0, allowZero = true } = {}) {
  const result = Number(value);
  if (!Number.isFinite(result)) throw new Error(`${name} must be a number`);
  if (result < min) throw new Error(`${name} must be at least ${min}`);
  if (!allowZero && result === 0) throw new Error(`${name} must be greater than zero`);
  return result;
}

export const DEFAULTS = {
  vehicleSurfaceAreaSqFt: 250,
  wasteFactorPct: 20,
  vinylCostPerSqFt: 2.75,
  laminateCostPerSqFt: 0.75,
  installRateSqFtPerHour: 12,
  complexityMultiplier: 1.25,
  installerHourlyRate: 35,
  removalHours: 0,
  designFee: 150,
  rushFeePct: 0,
  overheadRate: 12,
  targetMargin: 35,
  otherCostFlat: 0,
};

/**
 * Price one vehicle wrap install.
 *
 * @param {object} input
 * @param {number} input.vehicleSurfaceAreaSqFt Wrap coverage area from a
 *   vehicle chart or your own tape measure — the vehicle's bare surface
 *   area, before any waste is added.
 * @param {number} input.wasteFactorPct   Share of extra material consumed
 *   cutting around mirrors, handles, pillars, and compound curves and from
 *   roll overlap — typically 15-30% depending on vehicle shape and how much
 *   of the panel work is flat.
 * @param {number} input.vinylCostPerSqFt Wholesale cost of the wrap film per
 *   square foot of material actually used (not per square foot of vehicle).
 * @param {number} input.laminateCostPerSqFt Protective laminate cost per
 *   square foot of material used. Set to 0 for an unlaminated wrap.
 * @param {number} input.installRateSqFtPerHour Vehicle square feet one
 *   installer covers per hour on a straightforward panel at your shop's
 *   normal pace, before the complexity multiplier.
 * @param {number} input.complexityMultiplier Multiplier on install hours for
 *   this vehicle's actual difficulty — 1.0 for flat panel work (a box truck
 *   side), 1.2-1.6 for a sedan or SUV with mirrors, handles, and compound
 *   curves.
 * @param {number} input.installerHourlyRate Target labor rate per installer
 *   hour, applied to both install and removal time.
 * @param {number} input.removalHours     Hours to strip an existing wrap or
 *   old graphics before installing this one. 0 for a bare vehicle.
 * @param {number} input.designFee        Flat fee for design, proofing, and
 *   a print-ready file, charged once per job regardless of vehicle size.
 * @param {number} input.rushFeePct       Optional rush surcharge as a
 *   percent of the base price, for a job squeezed ahead of the queue.
 * @param {number} input.overheadRate  Business overhead as a percent of
 *   direct cost (shop rent, insurance, software, marketing).
 * @param {number} input.targetMargin  Net profit as a percent of the base
 *   price. Must be below 100.
 * @param {number} input.otherCostFlat    Any other flat cost — permitting
 *   film, extra proofs, a second install day fee.
 * @param {number|null} [input.actualVinylSqFtUsed] The material actually
 *   consumed off the roll once the job is done, to check real profit against
 *   this quote instead of the waste-factor estimate.
 * @param {number|null} [input.actualInstallHours] Actual hours the install
 *   took, if different from the estimate. Defaults to the estimated hours
 *   when omitted.
 */
export function calculateQuote(input) {
  const vehicleSurfaceAreaSqFt = number(input.vehicleSurfaceAreaSqFt, 'Vehicle surface area', { allowZero: false });
  const wasteFactorPct = number(input.wasteFactorPct, 'Waste factor');
  const vinylCostPerSqFt = number(input.vinylCostPerSqFt, 'Vinyl cost per sq ft');
  const laminateCostPerSqFt = number(input.laminateCostPerSqFt, 'Laminate cost per sq ft');
  const installRateSqFtPerHour = number(input.installRateSqFtPerHour, 'Install rate', { allowZero: false });
  const complexityMultiplier = number(input.complexityMultiplier, 'Complexity multiplier', { allowZero: false });
  const installerHourlyRate = number(input.installerHourlyRate, 'Installer hourly rate');
  const removalHours = number(input.removalHours, 'Removal hours');
  const designFee = number(input.designFee, 'Design fee');
  const rushFeePct = number(input.rushFeePct, 'Rush fee');
  const overheadRate = number(input.overheadRate, 'Overhead rate');
  const targetMargin = number(input.targetMargin, 'Target margin');
  if (targetMargin >= 100) throw new Error('Target margin must be less than 100%');
  const otherCostFlat = number(input.otherCostFlat, 'Other cost');

  // The material bill is driven by what actually leaves the roll, not the
  // vehicle's bare surface area.
  const effectiveVinylSqFt = vehicleSurfaceAreaSqFt * (1 + wasteFactorPct / 100);
  const vinylCost = effectiveVinylSqFt * vinylCostPerSqFt;
  const laminateCost = effectiveVinylSqFt * laminateCostPerSqFt;
  const materialCost = vinylCost + laminateCost;

  const installHours = (vehicleSurfaceAreaSqFt / installRateSqFtPerHour) * complexityMultiplier;
  const installLaborCost = installHours * installerHourlyRate;
  const removalLaborCost = removalHours * installerHourlyRate;

  const directCost = materialCost + installLaborCost + removalLaborCost + designFee + otherCostFlat;
  const overhead = directCost * (overheadRate / 100);
  const totalCost = directCost + overhead;
  const price = totalCost / (1 - targetMargin / 100);
  const profit = price - totalCost;
  const marginPct = price > 0 ? (profit / price) * 100 : null;
  const rushSurcharge = price * (rushFeePct / 100);
  const priceWithRush = price + rushSurcharge;

  // Waste-blind trap: what would this job price at if material were costed
  // from the bare vehicle area (no waste factor), while the shop still has
  // to buy and consume the waste-inclusive material to actually cover the
  // car? That gap is money lost on every job priced the naive way.
  const materialCostNaive = vehicleSurfaceAreaSqFt * (vinylCostPerSqFt + laminateCostPerSqFt);
  const directCostNaive = materialCostNaive + installLaborCost + removalLaborCost + designFee + otherCostFlat;
  const overheadNaive = directCostNaive * (overheadRate / 100);
  const totalCostNaive = directCostNaive + overheadNaive;
  const priceIfWasteIgnored = totalCostNaive / (1 - targetMargin / 100);
  const wasteBlindLossPerJob = totalCost - totalCostNaive;
  const wasteRiskTight = wasteFactorPct > 0 && wasteBlindLossPerJob > 0;

  const hasActualVinyl = input.actualVinylSqFtUsed !== null && input.actualVinylSqFtUsed !== undefined && input.actualVinylSqFtUsed !== '';
  let actual = null;
  if (hasActualVinyl) {
    const actualVinylSqFtUsed = number(input.actualVinylSqFtUsed, 'Actual vinyl used');
    const actualHoursRaw = input.actualInstallHours;
    const hasActualHours = actualHoursRaw !== null && actualHoursRaw !== undefined && actualHoursRaw !== '';
    const actualInstallHours = hasActualHours ? number(actualHoursRaw, 'Actual install hours') : installHours;

    const actualMaterialCost = actualVinylSqFtUsed * (vinylCostPerSqFt + laminateCostPerSqFt);
    const actualInstallLaborCost = actualInstallHours * installerHourlyRate;
    const actualDirectCost = actualMaterialCost + actualInstallLaborCost + removalLaborCost + designFee + otherCostFlat;
    const actualOverhead = actualDirectCost * (overheadRate / 100);
    const actualTotalCost = actualDirectCost + actualOverhead;
    const actualProfit = priceWithRush - actualTotalCost;

    actual = {
      materialCost: actualMaterialCost,
      installLaborCost: actualInstallLaborCost,
      totalCost: actualTotalCost,
      profit: actualProfit,
      marginPct: priceWithRush > 0 ? (actualProfit / priceWithRush) * 100 : null,
      belowBreakEven: actualProfit < 0,
    };
  }

  return {
    // Echoed inputs the customer proposal's scope templates read by name
    // (platform/proposal/trades.json) — the job's defining figures, not the
    // shop's own rate card.
    vehicleSurfaceAreaSqFt,
    wasteFactorPct,
    laminateCostPerSqFt,
    removalHours,
    effectiveVinylSqFt,
    vinylCost,
    laminateCost,
    materialCost,
    installHours,
    installLaborCost,
    removalLaborCost,
    directCost,
    overhead,
    totalCost,
    price,
    profit,
    marginPct,
    breakEvenPrice: totalCost,
    rushSurcharge,
    priceWithRush,
    materialCostNaive,
    priceIfWasteIgnored,
    wasteBlindLossPerJob,
    wasteRiskTight,
    actual,
  };
}
