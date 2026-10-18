function number(value, name, { min = 0, allowZero = true } = {}) {
  const result = Number(value);
  if (!Number.isFinite(result)) throw new Error(`${name} must be a number`);
  if (result < min) throw new Error(`${name} must be at least ${min}`);
  if (!allowZero && result === 0) throw new Error(`${name} must be greater than zero`);
  return result;
}

const MONTHS_PER_YEAR = 12;

/**
 * What the contractor has actually spent `months` into an agreement.
 *
 * The two cost families accrue on different clocks, and conflating them is the
 * whole point of this function. Preventive visits are **front-loaded**: the
 * first tune-up happens at signing and the rest fall every `12 / visitsPerYear`
 * months, so a plan cancelled in month 3 has still consumed a full visit's
 * labor, travel and parts. Callbacks and overhead accrue with elapsed time
 * instead — they are a rate, not an event on the calendar.
 *
 * Straight-line proration (annualCost * months / 12) gets this backwards and
 * makes an early cancellation look survivable when it is the case that loses
 * the most money.
 */
function costThroughMonth(months, { visitsPerYear, costPerVisit, callbackAnnualCost, annualOverhead }) {
  const elapsed = Math.max(0, Math.min(months, MONTHS_PER_YEAR));
  const interval = MONTHS_PER_YEAR / visitsPerYear;
  const visitsDelivered = elapsed <= 0
    ? 0
    : Math.min(visitsPerYear, Math.floor(elapsed / interval) + 1);
  return {
    visitsDelivered,
    cost: visitsDelivered * costPerVisit
      + (callbackAnnualCost + annualOverhead) * (elapsed / MONTHS_PER_YEAR),
  };
}

/**
 * The first whole month at which collected revenue covers the cost incurred so
 * far. Null when the price never catches up inside the first year — which is
 * what a below-floor price looks like from the customer's side of the contract.
 *
 * Deliberately excludes pull-through profit: repair work is expected revenue on
 * an unknown date, and a floor built on it would not be a floor.
 */
function monthsToBreakEven(monthlyPrice, schedule) {
  if (!(monthlyPrice > 0)) return null;
  for (let month = 1; month <= MONTHS_PER_YEAR; month += 1) {
    if (monthlyPrice * month >= costThroughMonth(month, schedule).cost) return month;
  }
  return null;
}

function cancellationAt(months, monthlyPrice, schedule) {
  const { visitsDelivered, cost } = costThroughMonth(months, schedule);
  const revenueCollected = monthlyPrice * Math.max(0, Math.min(months, MONTHS_PER_YEAR));
  return {
    months,
    visitsDelivered,
    costIncurred: cost,
    revenueCollected,
    net: revenueCollected - cost,
  };
}

export function calculatePlan(input) {
  const visitsPerYear = number(input.visitsPerYear ?? 0, 'Preventive visits per year', { allowZero: false });
  const laborHoursPerVisit = number(input.laborHoursPerVisit ?? 0, 'Labor hours per visit', { allowZero: false });
  const loadedHourlyRate = number(input.loadedHourlyRate ?? 0, 'Loaded technician cost per hour', { allowZero: false });
  const travelCostPerVisit = number(input.travelCostPerVisit ?? 0, 'Travel cost per visit');
  const partsReservePerVisit = number(input.partsReservePerVisit ?? 0, 'Parts reserve per visit');
  const callbackVisitsPerYear = number(input.callbackVisitsPerYear ?? 0, 'Callback visits per year');
  const callbackHours = number(input.callbackHours ?? 0, 'Labor hours per callback');
  const callbackCostPerVisit = number(input.callbackCostPerVisit ?? 0, 'Callback non-labor cost');
  const annualOverhead = number(input.annualOverhead ?? 0, 'Annual overhead allocation');
  const targetMargin = number(input.targetMargin ?? 0, 'Target margin');
  if (targetMargin >= 100) throw new Error('Target margin must be less than 100%');
  // Repair and replacement gross profit this member is expected to buy over a
  // year *because* they are on the plan. Optional and zero by default, so a
  // contractor who has never measured it gets the plan-only arithmetic
  // unchanged rather than a number built on a guess we made for them.
  const pullThroughProfitPerYear = number(
    input.pullThroughProfitPerYear === '' || input.pullThroughProfitPerYear == null
      ? 0 : input.pullThroughProfitPerYear,
    'Expected annual repair profit per member',
  );
  const cancelAfterMonths = input.cancelAfterMonths === '' || input.cancelAfterMonths == null
    ? null : number(input.cancelAfterMonths, 'Cancellation month', { allowZero: false });
  if (cancelAfterMonths != null && cancelAfterMonths > 12) {
    throw new Error('Cancellation month must be within the first 12 months');
  }

  const scheduledLabor = visitsPerYear * laborHoursPerVisit * loadedHourlyRate;
  const scheduledOther = visitsPerYear * (travelCostPerVisit + partsReservePerVisit);
  const callbackLabor = callbackVisitsPerYear * callbackHours * loadedHourlyRate;
  const callbackOther = callbackVisitsPerYear * callbackCostPerVisit;
  const annualCost = scheduledLabor + scheduledOther + callbackLabor + callbackOther + annualOverhead;
  const annualPrice = annualCost / (1 - targetMargin / 100);
  const monthlyPrice = annualPrice / 12;
  const annualProfit = annualPrice - annualCost;
  const totalTechnicianHours = visitsPerYear * laborHoursPerVisit + callbackVisitsPerYear * callbackHours;
  const proposedPrice = input.proposedMonthlyPrice === '' || input.proposedMonthlyPrice == null
    ? null : number(input.proposedMonthlyPrice, 'Monthly price being considered');

  const schedule = {
    visitsPerYear,
    costPerVisit: laborHoursPerVisit * loadedHourlyRate + travelCostPerVisit + partsReservePerVisit,
    callbackAnnualCost: callbackLabor + callbackOther,
    annualOverhead,
  };
  // The floor once repair pull-through is counted. A plan can be worth writing
  // at a price below its own cost when the membership reliably sells repair
  // work -- which is why contractors sell them near break-even -- but only
  // down to here, and never below zero.
  const netAnnualCost = annualCost - pullThroughProfitPerYear;
  const pullThroughCoversPlan = pullThroughProfitPerYear >= annualCost;

  return {
    visitsPerYear, callbackVisitsPerYear, scheduledLabor, scheduledOther,
    callbackLabor, callbackOther, annualOverhead, annualCost, annualPrice,
    monthlyPrice, annualProfit, totalTechnicianHours,
    breakEvenMonthlyPrice: annualCost / 12,
    effectiveHourlyRevenue: totalTechnicianHours === 0 ? null : annualPrice / totalTechnicianHours,
    pullThroughProfitPerYear,
    totalAnnualProfit: annualProfit + pullThroughProfitPerYear,
    breakEvenMonthlyPriceWithPullThrough: Math.max(0, netAnnualCost / 12),
    pullThroughCoversPlan,
    effectiveHourlyValue: totalTechnicianHours === 0
      ? null : (annualPrice + pullThroughProfitPerYear) / totalTechnicianHours,
    costPerVisit: schedule.costPerVisit,
    monthsToBreakEven: monthsToBreakEven(monthlyPrice, schedule),
    cancellation: cancelAfterMonths == null
      ? null : cancellationAt(cancelAfterMonths, monthlyPrice, schedule),
    proposed: proposedPrice == null ? null : {
      monthlyPrice: proposedPrice,
      annualRevenue: proposedPrice * 12,
      annualProfit: proposedPrice * 12 - annualCost,
      margin: proposedPrice === 0 ? 0 : (proposedPrice * 12 - annualCost) / (proposedPrice * 12) * 100,
      belowBreakEven: proposedPrice < annualCost / 12,
      totalAnnualProfit: proposedPrice * 12 - netAnnualCost,
      belowBreakEvenWithPullThrough: proposedPrice * 12 < netAnnualCost,
      monthsToBreakEven: monthsToBreakEven(proposedPrice, schedule),
      cancellation: cancelAfterMonths == null
        ? null : cancellationAt(cancelAfterMonths, proposedPrice, schedule),
    },
  };
}

export function formatPlanSummary(result) {
  const money = (value) => {
    const format = (value) => `$${value.toFixed(2)}`;
    const text = format(Math.abs(value));
    return value < 0 && /[1-9]/.test(text) ? `-${text}` : text;
  };
  const proposed = result.proposed ? `\nPrice considered: ${money(result.proposed.monthlyPrice)}/month (${result.proposed.belowBreakEven ? 'below break-even' : `${result.proposed.margin.toFixed(1)}% margin`})` : '';
  // Only stated when the contractor supplied a figure. A pull-through line
  // reading "$0.00" on every summary would train the reader to skip it, and
  // the whole point of the line is that it changes the floor.
  const pullThrough = result.pullThroughProfitPerYear > 0
    ? `\nRepair pull-through: ${money(result.pullThroughProfitPerYear)}/year — floor drops to ${money(result.breakEvenMonthlyPriceWithPullThrough)}/month${result.pullThroughCoversPlan ? ' (repair profit alone covers the plan)' : ''}\nTotal profit per member: ${money(result.totalAnnualProfit)}/year`
    : '';
  const stayLength = result.monthsToBreakEven == null
    ? '\nMonths to break even: never inside the first year at this price'
    : `\nMonths to break even: ${result.monthsToBreakEven} of 12`;
  // Report the cancellation for the price actually under discussion. Quoting
  // the target-margin exposure while the contractor is weighing a lower number
  // would understate the loss on the only price that matters to them.
  const exposure = result.proposed?.cancellation ?? result.cancellation;
  const cancellation = exposure
    ? `\nIf cancelled after month ${exposure.months}: ${exposure.visitsDelivered} visit(s) delivered, ${money(exposure.net)} net`
    : '';
  return `HVAC maintenance agreement\nPrice at target margin: ${money(result.monthlyPrice)}/month (${money(result.annualPrice)}/year)\nBreak-even floor: ${money(result.breakEvenMonthlyPrice)}/month\nTechnician hours reserved: ${result.totalTechnicianHours.toFixed(1)}/year\nEffective revenue per technician hour: ${money(result.effectiveHourlyRevenue)}${stayLength}${cancellation}${pullThrough}${proposed}`;
}
