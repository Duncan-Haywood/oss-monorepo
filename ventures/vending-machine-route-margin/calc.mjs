// Deterministic profitability arithmetic for an independent vending-machine
// route operator (bulk snack/drink or bulk-candy/toy machines placed in
// third-party locations under a commission split) — not a marketplace app,
// not a franchise. Two distinct calculations, the same two-layer shape as
// this portfolio's other route-pricing calculators
// (`pool-route-pricing`, `dog-walking-route-pricing`):
//
//   calculate(input)         — profit for ONE location's restock visit, from
//                               units sold since the last visit, the
//                               location-owner commission split, card
//                               processing fees, shrink/spoilage, drive time
//                               and mileage, the operator's own restock
//                               labor, and the machine's own amortized cost.
//   computeRouteProfit(locs) — roll a list of locations' monthly profit up
//                               into total route profit.
//   incomeGap(...)           — compare that route profit to a target monthly
//                               income and say how many more locations, at
//                               the same average profit, close the gap.

export const DEFAULTS = {
  unitsSold: 42,
  pricePerUnit: 1.75,
  costPerUnit: 0.55,
  commissionPct: 15,
  cardFeePct: 2.6,
  shrinkPct: 3,
  restockMinutes: 12,
  driveMinutes: 20,
  mileage: 8,
  mileageRate: 0.67,
  targetHourlyRate: 22,
  machineMonthlyCost: 15,
  visitsPerMonth: 4,
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
 * Profit for a single location's restock visit.
 *
 * @param {object} input
 * @param {number} input.unitsSold Units sold since the last restock visit
 *   (read off the machine's counter or a card-reader report).
 * @param {number} input.pricePerUnit Vend price charged to the customer.
 * @param {number} input.costPerUnit Your wholesale/product cost per unit.
 * @param {number} input.commissionPct Percentage of gross sales paid to the
 *   location owner — the standard vending placement arrangement. 0 for a
 *   location with no commission agreement.
 * @param {number} input.cardFeePct Blended card/cashless processing fee as a
 *   percentage of gross sales (most modern machines take card; average in
 *   any cash share yourself if the machine takes both).
 * @param {number} input.shrinkPct Percentage of product cost lost to theft,
 *   spoilage, or damage, on top of the units actually sold — the units you
 *   paid for and did not get to sell.
 * @param {number} input.restockMinutes Minutes on-site to restock and
 *   collect at this location.
 * @param {number} input.driveMinutes Round-trip drive minutes to reach and
 *   leave this location from the previous stop or home base.
 * @param {number} input.mileage Round-trip vehicle miles for the same trip.
 * @param {number} input.mileageRate Reimbursement rate per mile for fuel and
 *   vehicle wear (a standard mileage rate is a reasonable default).
 * @param {number} input.targetHourlyRate The hourly rate you want to earn
 *   for your own restock and drive time.
 * @param {number} input.machineMonthlyCost Monthly cost of this machine —
 *   lease payment, or purchase price amortized over its useful life.
 * @param {number} input.visitsPerMonth Restock visits you make to this
 *   location in a typical month. Used to allocate `machineMonthlyCost` per
 *   visit and to project monthly profit. Must be greater than zero.
 */
export function calculate(input) {
  const unitsSold = number(input.unitsSold, 'Units sold');
  const pricePerUnit = number(input.pricePerUnit, 'Price per unit');
  const costPerUnit = number(input.costPerUnit, 'Cost per unit');
  const commissionPct = number(input.commissionPct, 'Location commission', { max: 100 });
  const cardFeePct = number(input.cardFeePct, 'Card processing fee', { max: 100, exclusiveMax: true });
  const shrinkPct = number(input.shrinkPct, 'Shrink/spoilage', { max: 100 });
  const restockMinutes = number(input.restockMinutes, 'Restock minutes');
  const driveMinutes = number(input.driveMinutes, 'Drive minutes');
  const mileage = number(input.mileage, 'Mileage');
  const mileageRate = number(input.mileageRate, 'Mileage rate');
  const targetHourlyRate = number(input.targetHourlyRate, 'Target hourly rate');
  const machineMonthlyCost = number(input.machineMonthlyCost, 'Machine monthly cost');
  const visitsPerMonth = number(input.visitsPerMonth, 'Visits per month', { min: 0.01 });

  const grossRevenue = unitsSold * pricePerUnit;
  // Shrink is product you paid for and did not get to sell — extra cost on
  // top of the units actually sold, not a discount on revenue.
  const cogs = costPerUnit * unitsSold * (1 + shrinkPct / 100);
  const commissionAmount = grossRevenue * (commissionPct / 100);
  const cardFeeAmount = grossRevenue * (cardFeePct / 100);
  const mileageCost = mileage * mileageRate;
  const laborMinutes = restockMinutes + driveMinutes;
  const laborHours = laborMinutes / 60;
  const laborCost = laborHours * targetHourlyRate;
  const machineCostPerVisit = machineMonthlyCost / visitsPerMonth;

  const totalCost = cogs + commissionAmount + cardFeeAmount + mileageCost + laborCost + machineCostPerVisit;
  const netProfit = grossRevenue - totalCost;
  const profitMarginPct = grossRevenue > 0 ? (netProfit / grossRevenue) * 100 : null;
  const effectiveHourlyRate = laborHours > 0 ? netProfit / laborHours : null;
  const monthlyProfit = netProfit * visitsPerMonth;

  return {
    grossRevenue, cogs, commissionAmount, cardFeeAmount, mileageCost, laborHours, laborCost,
    machineCostPerVisit, totalCost, netProfit, profitMarginPct, effectiveHourlyRate, monthlyProfit,
    visitsPerMonth, targetHourlyRate,
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
