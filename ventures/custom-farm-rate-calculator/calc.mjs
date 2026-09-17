// Deterministic pricing arithmetic for a custom farm operator — someone who
// owns field equipment (a combine, planter, sprayer, baler, tillage tool) and
// does field work for other farmers for pay, rather than farming only their
// own ground. Two distinct calculations, the same two-layer shape as this
// portfolio's other route/rate calculators (`shop-rate-calculator`,
// `vending-machine-route-margin`):
//
//   calculate(input)        — the rate to charge for ONE field job, from the
//                              machine's field capacity (speed, width, field
//                              efficiency), fuel burn, repairs, the machine's
//                              own annual ownership cost spread over the
//                              hours it actually runs, the operator's own
//                              labor, and a target margin.
//   computeSeasonProfit(jobs) — roll a list of jobs' profit up into total
//                              season profit.
//   incomeGap(...)          — compare that season profit to a target season
//                              income and say how many more jobs, at the
//                              same average profit, close the gap.
//
// The field-capacity formula (mph × width in feet × field efficiency ÷ 8.25)
// is the standard agricultural-engineering conversion for acres covered per
// hour and is the same one land-grant extension custom-rate surveys use.

export const DEFAULTS = {
  acres: 160,
  fieldSpeedMph: 4.5,
  implementWidthFt: 30,
  fieldEfficiencyPct: 75,
  fuelPricePerGallon: 3.85,
  fuelBurnGph: 12,
  repairsPerHour: 18,
  annualOwnershipCost: 28000,
  hoursUsedPerYear: 250,
  laborRatePerHour: 24,
  targetMarginPct: 15,
};

function number(value, label, { min = 0, max = null, exclusiveMax = false, exclusiveMin = false } = {}) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`${label} must be a number.`);
  if (exclusiveMin ? parsed <= min : parsed < min) {
    throw new Error(exclusiveMin ? `${label} must be greater than ${min}.` : `${label} must be ${min} or greater.`);
  }
  if (max !== null) {
    if (exclusiveMax && parsed >= max) throw new Error(`${label} must be below ${max}.`);
    if (!exclusiveMax && parsed > max) throw new Error(`${label} must be ${max} or less.`);
  }
  return parsed;
}

/**
 * The rate to charge for one custom field job.
 *
 * @param {object} input
 * @param {number} input.acres Acres in this field job.
 * @param {number} input.fieldSpeedMph Operating ground speed in miles per hour.
 * @param {number} input.implementWidthFt Effective working width in feet
 *   (header width, planter width, boom width).
 * @param {number} input.fieldEfficiencyPct Percentage of scheduled time
 *   actually spent working the field, after turns, overlap, and refill or
 *   unload stops — 100 is never realistic; 65-85 is typical.
 * @param {number} input.fuelPricePerGallon Diesel or gas price per gallon.
 * @param {number} input.fuelBurnGph Fuel burned per hour of operation, at
 *   this speed and load, in gallons.
 * @param {number} input.repairsPerHour Repairs and maintenance allocated per
 *   hour of use — tires, wear parts, unscheduled downtime.
 * @param {number} input.annualOwnershipCost Depreciation, interest, insurance,
 *   and housing for the machine and implement, for the whole year — a cost
 *   that applies whether the machine runs 50 hours or 500.
 * @param {number} input.hoursUsedPerYear Hours the machine actually runs in a
 *   typical year, across every customer and your own ground. Spreading a
 *   fixed annual cost over few hours is why lightly used equipment needs a
 *   much higher rate per acre than the same machine run hard.
 * @param {number} input.laborRatePerHour What you want to earn for your own
 *   or a hired operator's time running the machine.
 * @param {number} input.targetMarginPct Target net margin as a percentage of
 *   the price charged (a share of price, not a mark-up on cost).
 */
export function calculate(input) {
  const acres = number(input.acres, 'Acres', { exclusiveMin: true });
  const fieldSpeedMph = number(input.fieldSpeedMph, 'Field speed', { exclusiveMin: true });
  const implementWidthFt = number(input.implementWidthFt, 'Implement width', { exclusiveMin: true });
  const fieldEfficiencyPct = number(input.fieldEfficiencyPct, 'Field efficiency', { min: 1, max: 100 });
  const fuelPricePerGallon = number(input.fuelPricePerGallon, 'Fuel price');
  const fuelBurnGph = number(input.fuelBurnGph, 'Fuel burn');
  const repairsPerHour = number(input.repairsPerHour, 'Repairs per hour');
  const annualOwnershipCost = number(input.annualOwnershipCost, 'Annual ownership cost');
  const hoursUsedPerYear = number(input.hoursUsedPerYear, 'Hours used per year', { exclusiveMin: true });
  const laborRatePerHour = number(input.laborRatePerHour, 'Labor rate');
  const targetMarginPct = number(input.targetMarginPct, 'Target margin', { max: 100, exclusiveMax: true });

  // Standard ag-engineering field-capacity conversion: mph * width(ft) *
  // efficiency, divided by 8.25 (the constant that reconciles feet-per-hour
  // and square-feet-per-acre units), gives acres covered per hour.
  const fieldCapacityAcresPerHour = (fieldSpeedMph * implementWidthFt * (fieldEfficiencyPct / 100)) / 8.25;
  const hoursForJob = acres / fieldCapacityAcresPerHour;

  const ownershipCostPerHour = annualOwnershipCost / hoursUsedPerYear;
  const fuelCost = fuelBurnGph * fuelPricePerGallon * hoursForJob;
  const repairsCost = repairsPerHour * hoursForJob;
  const ownershipCost = ownershipCostPerHour * hoursForJob;
  const laborCost = laborRatePerHour * hoursForJob;

  const totalCost = fuelCost + repairsCost + ownershipCost + laborCost;
  const breakEvenRatePerAcre = totalCost / acres;
  // Margin is a share of the price charged, not a mark-up on cost — 15%
  // margin on a $10,000 job is $1,500 of profit, not $1,500 on top of cost.
  const billRatePerAcre = breakEvenRatePerAcre / (1 - targetMarginPct / 100);
  const revenueAtBillRate = billRatePerAcre * acres;
  const profitAtBillRate = revenueAtBillRate - totalCost;
  const effectiveHourlyEarnings = hoursForJob > 0 ? (profitAtBillRate + laborCost) / hoursForJob : null;

  return {
    fieldCapacityAcresPerHour, hoursForJob, ownershipCostPerHour,
    fuelCost, repairsCost, ownershipCost, laborCost, totalCost,
    breakEvenRatePerAcre, billRatePerAcre, revenueAtBillRate, profitAtBillRate,
    effectiveHourlyEarnings,
  };
}

/**
 * Roll a list of jobs' profit up into total season profit.
 * @param {{profit: number}[]} jobs
 */
export function computeSeasonProfit(jobs) {
  let totalSeasonProfit = 0;
  for (const [i, job] of jobs.entries()) {
    totalSeasonProfit += number(job.profit, `Job ${i + 1} profit`, { min: -Infinity });
  }
  const jobCount = jobs.length;
  const averageProfitPerJob = jobCount > 0 ? totalSeasonProfit / jobCount : 0;
  return { totalSeasonProfit, jobCount, averageProfitPerJob };
}

/**
 * Compare season profit to a target season income and say how many more
 * jobs, at the same average profit, close the gap.
 */
export function incomeGap(targetSeasonIncome, totalSeasonProfit, averageProfitPerJob) {
  const target = number(targetSeasonIncome, 'Target season income');
  const profit = number(totalSeasonProfit, 'Total season profit', { min: -Infinity });
  const avg = number(averageProfitPerJob, 'Average profit per job', { min: -Infinity });
  const gap = Math.max(0, target - profit);
  const additionalJobsNeeded = gap === 0 ? 0 : (avg > 0 ? Math.ceil(gap / avg) : null);
  return { gap, additionalJobsNeeded, meetsTarget: profit >= target };
}
