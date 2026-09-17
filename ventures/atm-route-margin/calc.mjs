// Deterministic profitability arithmetic for an independent ATM route
// operator (deploying owned or leased cash machines into third-party
// locations under a placement agreement — a bar, convenience store, or
// laundromat, not a bank branch network and not a marketplace). Two
// distinct calculations, the same two-layer shape as this portfolio's other
// route-pricing calculators (`pool-route-pricing`, `dog-walking-route-pricing`,
// `vending-machine-route-margin`):
//
//   calculate(input)         — monthly profit for ONE location, from the
//                               month's withdrawal count, the surcharge fee
//                               charged to the cardholder, the location's
//                               commission split and/or flat placement fee,
//                               the per-transaction processor fee, the cost
//                               of capital on the vault cash sitting in the
//                               machine, refill/service labor and travel,
//                               an optional armored-transport cost per
//                               refill, and the machine's own monthly cost.
//   computeRouteProfit(locs) — roll a list of locations' monthly profit up
//                               into total route profit.
//   incomeGap(...)           — compare that route profit to a target monthly
//                               income and say how many more locations, at
//                               the same average profit, close the gap.

export const DEFAULTS = {
  monthlyWithdrawals: 220,
  surchargeFee: 2.75,
  locationCommissionPct: 40,
  locationFlatFee: 0,
  processingFeePerTxn: 0.3,
  cashCostAnnualRatePct: 8,
  averageCashLoad: 3000,
  refillVisitsPerMonth: 4,
  refillMinutes: 15,
  driveMinutes: 25,
  mileage: 10,
  mileageRate: 0.67,
  targetHourlyRate: 25,
  machineMonthlyCost: 60,
  armoredCostPerVisit: 0,
  // Not read by calculate() itself -- it feeds incomeGap() below, against the
  // route-wide "Your route this month" summary. It lives here anyway because
  // DEFAULTS is also the one source share.mjs and index.html derive their
  // persisted/shareable field list from, and this is an ordinary numeric
  // assumption (not one of the per-location rows), so a shared or restored
  // link should carry it too -- see CLAUDE.md's "168 became 169" note on the
  // cost of a copied field list going stale instead of being imported.
  targetMonthlyIncome: 1200,
};

function number(value, label, { min = 0, max = null, exclusiveMax = false } = {}) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min) {
    throw new Error(min === 0 ? `${label} must be zero or greater.` : `${label} must be at least ${min}.`);
  }
  if (max !== null) {
    if (exclusiveMax && parsed >= max) throw new Error(`${label} must be below ${max}.`);
    if (!exclusiveMax && parsed > max) throw new Error(`${label} must be ${max} or less.`);
  }
  return parsed;
}

/**
 * Monthly profit for a single ATM location.
 *
 * @param {object} input
 * @param {number} input.monthlyWithdrawals Cash withdrawals at this machine
 *   in a typical month (read off the machine's or processor's report).
 * @param {number} input.surchargeFee Surcharge fee charged to the cardholder
 *   per withdrawal — the operator's revenue line.
 * @param {number} input.locationCommissionPct Percentage of surcharge
 *   revenue paid to the location owner. 0 for a location paid only a flat
 *   placement fee.
 * @param {number} input.locationFlatFee Flat monthly amount paid to the
 *   location owner regardless of transaction volume — some placement
 *   agreements use this instead of, or alongside, a commission split. 0 if
 *   not applicable.
 * @param {number} input.processingFeePerTxn Fee paid to the processor or
 *   network per withdrawal to route and settle it.
 * @param {number} input.cashCostAnnualRatePct Annual cost-of-capital rate
 *   applied to the vault cash sitting in the machine — your own opportunity
 *   cost of capital, or a cash-servicing provider's vault cash fee.
 * @param {number} input.averageCashLoad Average dollar balance of vault
 *   cash loaded in the machine between refills.
 * @param {number} input.refillVisitsPerMonth Cash refill/service visits you
 *   make to this location in a typical month.
 * @param {number} input.refillMinutes Minutes on-site per refill visit.
 * @param {number} input.driveMinutes Round-trip drive minutes per refill
 *   visit, from the previous stop or home base.
 * @param {number} input.mileage Round-trip vehicle miles per refill visit.
 * @param {number} input.mileageRate Reimbursement rate per mile for fuel
 *   and vehicle wear.
 * @param {number} input.targetHourlyRate The hourly rate you want to earn
 *   for your own refill and drive time.
 * @param {number} input.machineMonthlyCost Monthly cost of the machine —
 *   lease payment, or purchase price amortized over its useful life, plus
 *   wireless/telecom and monitoring software.
 * @param {number} input.armoredCostPerVisit Cost per refill visit if cash is
 *   serviced by an armored-transport or cash-in-transit company instead of
 *   the operator's own labor. 0 for a self-serviced route.
 */
export function calculate(input) {
  const monthlyWithdrawals = number(input.monthlyWithdrawals, 'Monthly withdrawals');
  const surchargeFee = number(input.surchargeFee, 'Surcharge fee');
  const locationCommissionPct = number(input.locationCommissionPct, 'Location commission', { max: 100 });
  const locationFlatFee = number(input.locationFlatFee, 'Location flat fee');
  const processingFeePerTxn = number(input.processingFeePerTxn, 'Processing fee per transaction');
  const cashCostAnnualRatePct = number(input.cashCostAnnualRatePct, 'Cash cost of capital rate', { max: 100 });
  const averageCashLoad = number(input.averageCashLoad, 'Average cash load');
  const refillVisitsPerMonth = number(input.refillVisitsPerMonth, 'Refill visits per month');
  const refillMinutes = number(input.refillMinutes, 'Refill minutes');
  const driveMinutes = number(input.driveMinutes, 'Drive minutes');
  const mileage = number(input.mileage, 'Mileage');
  const mileageRate = number(input.mileageRate, 'Mileage rate');
  const targetHourlyRate = number(input.targetHourlyRate, 'Target hourly rate');
  const machineMonthlyCost = number(input.machineMonthlyCost, 'Machine monthly cost');
  const armoredCostPerVisit = number(input.armoredCostPerVisit, 'Armored transport cost per visit');

  const grossSurcharge = monthlyWithdrawals * surchargeFee;
  const commissionAmount = grossSurcharge * (locationCommissionPct / 100) + locationFlatFee;
  const processingCost = monthlyWithdrawals * processingFeePerTxn;
  const cashCost = averageCashLoad * (cashCostAnnualRatePct / 100 / 12);
  const mileageCost = mileage * mileageRate * refillVisitsPerMonth;
  const armoredCost = armoredCostPerVisit * refillVisitsPerMonth;
  const laborMinutes = (refillMinutes + driveMinutes) * refillVisitsPerMonth;
  const laborHours = laborMinutes / 60;
  const laborCost = laborHours * targetHourlyRate;

  const totalCost = commissionAmount + processingCost + cashCost + mileageCost + armoredCost + laborCost + machineMonthlyCost;
  const netProfit = grossSurcharge - totalCost;
  const profitMarginPct = grossSurcharge > 0 ? (netProfit / grossSurcharge) * 100 : null;
  const effectiveHourlyRate = laborHours > 0 ? netProfit / laborHours : null;
  const perTransactionProfit = monthlyWithdrawals > 0 ? netProfit / monthlyWithdrawals : null;

  return {
    grossSurcharge, commissionAmount, processingCost, cashCost, mileageCost, armoredCost,
    laborHours, laborCost, totalCost, netProfit, profitMarginPct, effectiveHourlyRate,
    perTransactionProfit, monthlyProfit: netProfit,
  };
}

/**
 * Roll a list of locations' monthly profit up into total route profit.
 * @param {{monthlyProfit: number}[]} locations
 */
export function computeRouteProfit(locations) {
  let totalMonthlyProfit = 0;
  for (const [i, loc] of locations.entries()) {
    totalMonthlyProfit += number(loc.monthlyProfit, `Location ${i + 1} monthly profit`, { min: -Infinity });
  }
  const locationCount = locations.length;
  const averageProfitPerLocation = locationCount > 0 ? totalMonthlyProfit / locationCount : 0;
  return { totalMonthlyProfit, locationCount, averageProfitPerLocation };
}

/**
 * Compare route profit to a target monthly income and say how many more
 * locations, at the same average profit, close the gap.
 */
export function incomeGap(targetMonthlyIncome, totalMonthlyProfit, averageProfitPerLocation) {
  const target = number(targetMonthlyIncome, 'Target monthly income');
  const profit = number(totalMonthlyProfit, 'Total monthly profit', { min: -Infinity });
  const avg = number(averageProfitPerLocation, 'Average profit per location', { min: -Infinity });
  const gap = Math.max(0, target - profit);
  const additionalLocationsNeeded = gap === 0 ? 0 : (avg > 0 ? Math.ceil(gap / avg) : null);
  return { gap, additionalLocationsNeeded, meetsTarget: profit >= target };
}
