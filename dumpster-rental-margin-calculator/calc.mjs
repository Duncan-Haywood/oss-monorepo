// Pure pricing arithmetic for an independent roll-off dumpster rental
// operator (one or a few trucks and containers, not a full waste-hauling
// fleet) — the business that drops an empty container at a job site, comes
// back days later, and hauls it to a transfer station or landfill to be
// weighed. No network, no state: every rate, ton, and day is an input, so
// the result stays a transparent calculation the operator can check against
// their own scale tickets and mileage log rather than a claim about what any
// job "should" cost.
//
// The method is the one that erases margin silently: the rental price is set
// once, up front, from an *included weight allowance* — but disposal is
// billed by the ton at the transfer station, and the customer's own fill
// (a roofing tear-off, a concrete tear-out, wet dirt) decides the actual
// weight, not the operator. Two failure modes follow from that gap, and both
// are modeled here rather than assumed away:
//
//   1. The included allowance can be priced too generously for what it
//      actually costs to dispose of — so a job that stays *within* the
//      allowance the operator promised still loses money once the tipping
//      fee is paid.
//   2. The per-ton overage rate charged for going over the allowance can be
//      set below the operator's own tipping fee per ton — so the fee meant
//      to protect the margin instead loses money on every excess ton, and
//      the loss grows without limit as the load gets heavier.

function number(value, name, { min = 0, allowZero = true } = {}) {
  const result = Number(value);
  if (!Number.isFinite(result)) throw new Error(`${name} must be a number`);
  if (result < min) throw new Error(`${name} must be at least ${min}`);
  if (!allowZero && result === 0) throw new Error(`${name} must be greater than zero`);
  return result;
}

export const DEFAULTS = {
  dumpsterSizeYards: 20,
  includedWeightTons: 2,
  expectedWeightTons: 3,
  tippingFeePerTon: 65,
  overageRatePerTon: 75,
  includedRentalDays: 7,
  expectedRentalDays: 7,
  extraDayRate: 10,
  driverHours: 2,
  driverHourlyRate: 28,
  roundTripMiles: 30,
  mileageRate: 0.67,
  dumpFeeFlat: 10,
  equipmentCostPerHaul: 20,
  overheadRate: 10,
  targetMargin: 30,
  otherCost: 0,
};

/**
 * Price one roll-off dumpster rental.
 *
 * @param {object} input
 * @param {number} input.dumpsterSizeYards   Container size in cubic yards —
 *   descriptive only; it does not drive the arithmetic (weight, not volume,
 *   is what disposal and overage are billed on).
 * @param {number} input.includedWeightTons  Weight allowance included in the
 *   quoted rental price before overage applies.
 * @param {number} input.expectedWeightTons  Your best estimate of what this
 *   job will actually weigh on the scale, from the material and container
 *   size (a shingle tear-off runs far heavier per yard than a light
 *   cleanout).
 * @param {number} input.tippingFeePerTon    What the transfer station or
 *   landfill actually charges you per ton hauled — your real cost.
 * @param {number} input.overageRatePerTon   What you charge the customer per
 *   ton over the included allowance.
 * @param {number} input.includedRentalDays  Rental days included in the
 *   quoted price before an extra-day fee applies.
 * @param {number} input.expectedRentalDays  How long you expect the customer
 *   to actually keep the container on site.
 * @param {number} input.extraDayRate        Per-day fee charged beyond the
 *   included rental days — pure revenue: the container sitting longer adds
 *   no disposal cost of its own.
 * @param {number} input.driverHours         Combined driver time for
 *   delivery, pickup, and the dump run.
 * @param {number} input.driverHourlyRate    Target hourly pay for driver
 *   time.
 * @param {number} input.roundTripMiles      Combined vehicle miles for
 *   delivery, pickup, and the dump run.
 * @param {number} input.mileageRate         Reimbursement rate per mile for
 *   fuel and vehicle wear.
 * @param {number} input.dumpFeeFlat         Flat gate/environmental fee per
 *   haul at the transfer station, separate from the per-ton tipping fee.
 * @param {number} input.equipmentCostPerHaul Container and truck wear
 *   amortized per haul (replacement cost spread over its useful life and
 *   expected hauls).
 * @param {number} input.overheadRate     Business overhead as a percent
 *   of direct cost (insurance, permits, software, marketing).
 * @param {number} input.targetMargin     Net profit as a percent of the
 *   rental price at the included allowance. Must be below 100.
 * @param {number} input.otherCost           Any other flat cost — a permit
 *   fee, a second container swap, a locked-lid surcharge.
 * @param {number|null} [input.actualWeightTons] The scale ticket weight once
 *   the container is actually hauled, to check the real profit against this
 *   quote instead of the estimate.
 * @param {number|null} [input.actualRentalDays] How long the container was
 *   actually on site, if different from expectedRentalDays. Defaults to
 *   expectedRentalDays when omitted.
 */
export function calculateQuote(input) {
  const dumpsterSizeYards = number(input.dumpsterSizeYards, 'Dumpster size', { allowZero: false });
  const includedWeightTons = number(input.includedWeightTons, 'Included weight allowance');
  const expectedWeightTons = number(input.expectedWeightTons, 'Expected weight');
  const tippingFeePerTon = number(input.tippingFeePerTon, 'Tipping fee per ton');
  const overageRatePerTon = number(input.overageRatePerTon, 'Overage rate per ton');
  const includedRentalDays = number(input.includedRentalDays, 'Included rental days', { allowZero: false });
  const expectedRentalDays = number(input.expectedRentalDays, 'Expected rental days', { allowZero: false });
  const extraDayRate = number(input.extraDayRate, 'Extra day rate');
  const driverHours = number(input.driverHours, 'Driver hours');
  const driverHourlyRate = number(input.driverHourlyRate, 'Driver hourly rate');
  const roundTripMiles = number(input.roundTripMiles, 'Round-trip miles');
  const mileageRate = number(input.mileageRate, 'Mileage rate');
  const dumpFeeFlat = number(input.dumpFeeFlat, 'Flat dump/gate fee');
  const equipmentCostPerHaul = number(input.equipmentCostPerHaul, 'Equipment cost per haul');
  const overheadRate = number(input.overheadRate, 'Overhead rate');
  const targetMargin = number(input.targetMargin, 'Target margin');
  if (targetMargin >= 100) throw new Error('Target margin must be less than 100%');
  const otherCost = number(input.otherCost, 'Other cost');

  const laborCost = driverHours * driverHourlyRate;
  const mileageCost = roundTripMiles * mileageRate;
  const nonDisposalDirectCost = laborCost + mileageCost + equipmentCostPerHaul + otherCost;
  // Overhead is charged on the business's own fixed costs, not on disposal —
  // the tipping fee already is a pass-through cost set by the transfer
  // station, not something overhead should mark up a second time.
  const overhead = nonDisposalDirectCost * (overheadRate / 100);

  // The rental price you quote is built to cover the INCLUDED allowance,
  // not your estimate of the actual weight — anything the job weighs beyond
  // the allowance is billed separately as overage, which is why the two are
  // computed from different weight figures below.
  const disposalCostAtAllowance = includedWeightTons * tippingFeePerTon + dumpFeeFlat;
  const totalCostAtAllowance = nonDisposalDirectCost + overhead + disposalCostAtAllowance;
  const basePrice = totalCostAtAllowance / (1 - targetMargin / 100);
  const baseProfit = basePrice - totalCostAtAllowance;
  const baseMarginPct = basePrice > 0 ? (baseProfit / basePrice) * 100 : null;

  // The sharpest risk in this business: does the overage fee even cover what
  // an extra ton costs you to dispose of? If not, every ton over the
  // allowance loses money regardless of how well the base price was priced,
  // and maxOverageTonsBeforeLoss says how many such tons erase this job's
  // entire built-in profit.
  const profitPerOverageTon = overageRatePerTon - tippingFeePerTon;
  const overageRateCoversDisposal = profitPerOverageTon >= 0;
  const maxOverageTonsBeforeLoss = overageRateCoversDisposal
    ? null
    : baseProfit / (tippingFeePerTon - overageRatePerTon);

  const expectedOverageTons = Math.max(0, expectedWeightTons - includedWeightTons);
  const expectedOverageRevenue = expectedOverageTons * overageRatePerTon;
  const expectedOverageDisposalCost = expectedOverageTons * tippingFeePerTon;
  const expectedOverageProfit = expectedOverageRevenue - expectedOverageDisposalCost;

  const expectedExtraDays = Math.max(0, expectedRentalDays - includedRentalDays);
  const expectedExtraDayRevenue = expectedExtraDays * extraDayRate;

  const expectedDisposalCost = expectedWeightTons * tippingFeePerTon + dumpFeeFlat;
  const expectedTotalRevenue = basePrice + expectedOverageRevenue + expectedExtraDayRevenue;
  const expectedTotalCost = nonDisposalDirectCost + overhead + expectedDisposalCost;
  const expectedProfit = expectedTotalRevenue - expectedTotalCost;
  const expectedMarginPct = expectedTotalRevenue > 0 ? (expectedProfit / expectedTotalRevenue) * 100 : null;

  // Flag the job, not just the pricing structure: the overage rate is
  // mispriced AND this specific job is actually expected to hit overage
  // territory, so the mispricing is about to be realized rather than
  // theoretical.
  const weightRiskTight = !overageRateCoversDisposal && expectedOverageTons > 0;

  const hasActualWeight = input.actualWeightTons !== null && input.actualWeightTons !== undefined && input.actualWeightTons !== '';
  let actual = null;
  if (hasActualWeight) {
    const actualWeightTons = number(input.actualWeightTons, 'Actual weight ticket');
    const actualDaysRaw = input.actualRentalDays;
    const hasActualDays = actualDaysRaw !== null && actualDaysRaw !== undefined && actualDaysRaw !== '';
    const actualRentalDays = hasActualDays ? number(actualDaysRaw, 'Actual rental days') : expectedRentalDays;

    const actualOverageTons = Math.max(0, actualWeightTons - includedWeightTons);
    const actualOverageRevenue = actualOverageTons * overageRatePerTon;
    const actualExtraDays = Math.max(0, actualRentalDays - includedRentalDays);
    const actualExtraDayRevenue = actualExtraDays * extraDayRate;
    const actualDisposalCost = actualWeightTons * tippingFeePerTon + dumpFeeFlat;
    const actualTotalRevenue = basePrice + actualOverageRevenue + actualExtraDayRevenue;
    const actualTotalCost = nonDisposalDirectCost + overhead + actualDisposalCost;
    const actualProfit = actualTotalRevenue - actualTotalCost;

    actual = {
      overageTons: actualOverageTons,
      overageRevenue: actualOverageRevenue,
      extraDays: actualExtraDays,
      extraDayRevenue: actualExtraDayRevenue,
      disposalCost: actualDisposalCost,
      totalRevenue: actualTotalRevenue,
      totalCost: actualTotalCost,
      profit: actualProfit,
      marginPct: actualTotalRevenue > 0 ? (actualProfit / actualTotalRevenue) * 100 : null,
      belowBreakEven: actualProfit < 0,
    };
  }

  return {
    dumpsterSizeYards,
    laborCost,
    mileageCost,
    equipmentCostPerHaul,
    otherCost,
    nonDisposalDirectCost,
    overhead,
    disposalCostAtAllowance,
    totalCostAtAllowance,
    basePrice,
    baseProfit,
    baseMarginPct,
    breakEvenPrice: totalCostAtAllowance,
    profitPerOverageTon,
    overageRateCoversDisposal,
    maxOverageTonsBeforeLoss,
    expectedOverageTons,
    expectedOverageRevenue,
    expectedOverageDisposalCost,
    expectedOverageProfit,
    expectedExtraDays,
    expectedExtraDayRevenue,
    expectedDisposalCost,
    expectedTotalRevenue,
    expectedTotalCost,
    expectedProfit,
    expectedMarginPct,
    weightRiskTight,
    actual,
  };
}
