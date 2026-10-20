// Deterministic pricing arithmetic for an independent ice dam removal
// contractor -- a small crew that steams ridges of ice off a roof's eaves
// and valleys during winter (not a roofing company doing a repair, not a
// gutter-cleaning crew doing routine fall maintenance, and not a snow-plow
// operator). No network, no state: every rate, foot, and hour is an input,
// so the result stays a transparent calculation the operator can check
// against their own invoice and time log rather than a claim about what any
// job "should" cost.
//
// Two mechanics are specific to this trade and are the reason a generic
// per-job calculator undercharges or misprices it:
//
//   1. THE JOB'S REAL COST IS MOSTLY FIXED, BUT THE PRICE IS QUOTED PER
//      LINEAR FOOT. A two-person crew, a truck, and a steam machine cost
//      close to the same to send out whether the eave needing ice cleared
//      is 15 feet (one bad spot over a window) or 150 feet (the whole
//      house). A flat per-foot rate that comfortably covers cost on a long
//      run can lose money on a short one, because the fixed trip cost gets
//      spread over far fewer feet. `breakEvenRatePerFoot` says what the
//      rate would need to be for THIS job's footage alone, and
//      `underpriced` / `belowTargetMargin` say whether the operator's own
//      rate card and minimum charge actually clear that bar before the
//      truck rolls, not after.
//   2. IT IS AN EMERGENCY-DISPATCH TRADE WITH UNPREDICTABLE JOB LENGTH. A
//      storm call at night or on a weekend is priced with an after-hours
//      premium on billed time, the same way a locksmith or an appliance
//      repair call is -- and once the crew is actually on the roof, the ice
//      can be thicker or more stubborn than the phone estimate assumed. The
//      quote is fixed before the job starts (footage is what a customer can
//      describe over the phone); the reconciliation section recomputes the
//      real cost from the actual on-site hours and flags a job that ran
//      long enough to erase the built-in profit.

function number(value, label, { min = 0, max = null, exclusiveMax = false, allowZero = true } = {}) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`${label} must be a number.`);
  if (parsed < min) throw new Error(min === 0 ? `${label} must be zero or greater.` : `${label} must be at least ${min}.`);
  if (!allowZero && parsed === 0) throw new Error(`${label} must be greater than zero.`);
  if (max !== null) {
    if (exclusiveMax && parsed >= max) throw new Error(`${label} must be below ${max}.`);
    if (!exclusiveMax && parsed > max) throw new Error(`${label} must be ${max} or less.`);
  }
  return parsed;
}

export const DEFAULTS = {
  edgeFeet: 80,
  ratePerFoot: 7,
  crewSize: 2,
  estimatedHours: 2.5,
  crewHourlyRate: 34,
  travelHours: 1,
  travelMiles: 35,
  mileageRate: 0.67,
  steamerFuelCost: 20,
  equipmentCostPerJob: 15,
  emergencyCall: false,
  emergencyPct: 35,
  overheadRate: 12,
  targetMargin: 30,
  minimumServiceCharge: 375,
};

/**
 * Price one ice dam removal job.
 *
 * @param {object} input
 * @param {number} input.edgeFeet Linear feet of roof eave and valley that
 *   actually need to be steamed clear of ice -- what a customer can
 *   describe over the phone, and what a per-foot rate card is quoted
 *   against.
 * @param {number} input.ratePerFoot Your rate-card price per linear foot,
 *   the number most ice dam companies quote a customer with before a
 *   detailed itemization exists.
 * @param {number} input.crewSize Techs sent on this job. Steaming from a
 *   ladder or a roof in winter is normally a two-person job for fall
 *   protection and to keep the steam line hose, so labor cost scales with
 *   crew size, not with one billed rate.
 * @param {number} input.estimatedHours Estimated on-site hours per tech
 *   (setup, steaming the ice, teardown) before the crew has actually seen
 *   how thick the ice is.
 * @param {number} input.crewHourlyRate Target hourly pay per tech.
 * @param {number} input.travelHours Round-trip drive hours for the crew.
 * @param {number} input.travelMiles Round-trip vehicle miles for the crew.
 * @param {number} input.mileageRate Reimbursement rate per mile for fuel
 *   and vehicle wear.
 * @param {number} input.steamerFuelCost Fuel or propane cost to run the
 *   steam machine for this job, a flat cost independent of crew hours.
 * @param {number} input.equipmentCostPerJob Steamer, ladder, and harness
 *   wear amortized per job.
 * @param {boolean} input.emergencyCall Whether this is a storm, night, or
 *   weekend dispatch rather than a scheduled daytime appointment.
 * @param {number} input.emergencyPct Percentage premium applied to billed
 *   time (labor + travel) when `emergencyCall` is true. Never applied to
 *   fuel or equipment cost -- the steamer costs the same to run at 2am as
 *   at 2pm.
 * @param {number} input.overheadRate Percentage overhead on direct cost --
 *   insurance, licensing, and vehicle costs that apply whether or not this
 *   specific call happens.
 * @param {number} input.targetMargin Target net profit as a percent of the
 *   cost-plus price this job should be quoted at. Must be below 100.
 * @param {number} input.minimumServiceCharge The floor price for any job,
 *   regardless of how short the footage is -- the number that is supposed
 *   to keep a one-window ice dam from being a loss.
 * @param {number|null} [input.actualHours] Actual on-site hours per tech,
 *   once the job is done -- ice removal time is unpredictable, so this can
 *   run well past the estimate.
 */
export function calculateQuote(input) {
  const edgeFeet = number(input.edgeFeet, 'Linear feet of roof edge', { allowZero: false });
  const ratePerFoot = number(input.ratePerFoot, 'Rate per linear foot');
  const crewSize = number(input.crewSize, 'Crew size', { allowZero: false });
  const estimatedHours = number(input.estimatedHours, 'Estimated on-site hours');
  const crewHourlyRate = number(input.crewHourlyRate, 'Crew hourly rate');
  const travelHours = number(input.travelHours, 'Travel hours');
  const travelMiles = number(input.travelMiles, 'Travel miles');
  const mileageRate = number(input.mileageRate, 'Mileage rate');
  const steamerFuelCost = number(input.steamerFuelCost, 'Steamer fuel cost');
  const equipmentCostPerJob = number(input.equipmentCostPerJob, 'Equipment cost per job');
  const emergencyCall = Boolean(input.emergencyCall);
  const emergencyPct = number(input.emergencyPct, 'Emergency premium', { max: 500 });
  const overheadRate = number(input.overheadRate, 'Overhead rate', { max: 100 });
  const targetMargin = number(input.targetMargin, 'Target margin');
  if (targetMargin >= 100) throw new Error('Target margin must be less than 100%.');
  const minimumServiceCharge = number(input.minimumServiceCharge, 'Minimum service charge');

  function costFor(hoursPerTech) {
    const billedHoursPerTech = hoursPerTech + travelHours;
    const timeCost = crewSize * billedHoursPerTech * crewHourlyRate;
    const emergencySurcharge = emergencyCall ? timeCost * (emergencyPct / 100) : 0;
    const mileageCost = travelMiles * mileageRate;
    const directCost = timeCost + emergencySurcharge + mileageCost + steamerFuelCost + equipmentCostPerJob;
    const overhead = directCost * (overheadRate / 100);
    return { billedHoursPerTech, timeCost, emergencySurcharge, mileageCost, directCost, overhead, cost: directCost + overhead };
  }

  const est = costFor(estimatedHours);
  const targetPrice = est.cost / (1 - targetMargin / 100);

  // What the operator's own rate card actually produces for this job's
  // footage, floored at the minimum service charge -- this is the number
  // that gets quoted, not the target price above.
  const rateCardPrice = ratePerFoot * edgeFeet;
  const quotedPrice = Math.max(rateCardPrice, minimumServiceCharge);
  const minimumApplied = minimumServiceCharge > rateCardPrice;

  // The sharpest risk in this business: a per-foot rate that works fine on
  // a long run can still fall short of what THIS job's largely-fixed cost
  // demands once the footage is short. breakEvenRatePerFoot says what the
  // rate would need to be, ignoring the minimum charge, to just cover cost.
  const breakEvenRatePerFoot = est.cost / edgeFeet;
  const rateBelowBreakeven = ratePerFoot < breakEvenRatePerFoot;

  const profit = quotedPrice - est.cost;
  const underpriced = profit < 0;
  const shortfallVsCost = underpriced ? -profit : 0;
  const belowTargetMargin = quotedPrice < targetPrice;
  const shortfallVsTarget = belowTargetMargin ? targetPrice - quotedPrice : 0;
  const profitMarginPct = quotedPrice > 0 ? (profit / quotedPrice) * 100 : null;

  const hasActualHours = input.actualHours !== null && input.actualHours !== undefined && input.actualHours !== '';
  let actual = null;
  if (hasActualHours) {
    const actualHours = number(input.actualHours, 'Actual on-site hours');
    const act = costFor(actualHours);
    const actualProfit = quotedPrice - act.cost;
    actual = {
      billedHoursPerTech: act.billedHoursPerTech,
      timeCost: act.timeCost,
      emergencySurcharge: act.emergencySurcharge,
      cost: act.cost,
      profit: actualProfit,
      profitMarginPct: quotedPrice > 0 ? (actualProfit / quotedPrice) * 100 : null,
      belowBreakEven: actualProfit < 0,
    };
  }

  return {
    edgeFeet,
    emergencyCall,
    billedHoursPerTech: est.billedHoursPerTech,
    timeCost: est.timeCost,
    emergencySurcharge: est.emergencySurcharge,
    mileageCost: est.mileageCost,
    equipmentCostPerJob,
    steamerFuelCost,
    overhead: est.overhead,
    cost: est.cost,
    targetPrice,
    rateCardPrice,
    quotedPrice,
    minimumApplied,
    breakEvenRatePerFoot,
    rateBelowBreakeven,
    profit,
    underpriced,
    shortfallVsCost,
    belowTargetMargin,
    shortfallVsTarget,
    profitMarginPct,
    actual,
  };
}
