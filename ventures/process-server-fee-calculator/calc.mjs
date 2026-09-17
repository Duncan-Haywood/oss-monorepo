// Deterministic profitability arithmetic for an independent 1099 process
// server pricing one service-of-process job, and comparing what two or three
// client law firms or serving agencies actually pay per hour once mileage,
// extra attempts, and the server's own drive time and vehicle cost are
// netted out.
//
// A process server is typically paid a flat base fee that includes a set
// number of attempts and a set number of miles. Everything past that is
// billed as an add-on: extra attempts when the defendant is not found on the
// first try, a rush/same-day surcharge, a skip-trace fee when the address on
// the paperwork turns out to be bad, and mileage beyond the included radius.
// None of that revenue is free to earn -- the server's own vehicle cost and
// time (driving, the attempts themselves, and the affidavit paperwork
// afterward) are real costs a flat "we pay $65 a serve" rate hides.
//
// Same two-layer shape as this portfolio's other route/deployment-pricing
// calculators (`cat-adjuster-fee-calculator`, `medical-courier-route-margin`):
// a single job, then a roll-up that compares several fee schedules.
//
//   calculate(input)       — net profit for ONE serve job under one client's
//                             fee schedule: base fee plus extra-attempt, rush,
//                             skip-trace, and mileage add-ons, less the
//                             server's own vehicle cost and a per-job share
//                             of fixed costs (E&O bond, license, software).
//   rankClients(schedules) — rank several named client fee-schedule net
//                             profits (each produced by running calculate()
//                             once per client) so a server can see which
//                             client actually pays the best effective hourly
//                             rate for the same job, not just the best
//                             headline base fee.
//
// This does not determine whether service was properly effected, whether the
// server is licensed, bonded, or registered in the jurisdiction the job is
// in, or whether an affidavit of service will hold up in court -- it only
// prices the job's own economics from numbers the server supplies.

export const DEFAULTS = {
  baseFee: 65,
  attemptsIncluded: 2,
  attemptsActual: 3,
  extraAttemptFee: 15,
  rushJob: 0,
  rushSurchargeFee: 25,
  skipTraceNeeded: 0,
  skipTraceFee: 40,
  affidavitFee: 10,
  milesRoundTrip: 20,
  milesIncluded: 10,
  mileageRate: 0.67,
  driveTimeHours: 0.5,
  onSiteTimeHours: 0.25,
  paperworkTimeHours: 0.15,
  vehicleCostPerMile: 0.18,
  fixedJobCost: 5,
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
 * Net profit for one process-serving job under one client's fee schedule.
 *
 * @param {object} input
 * @param {number} input.baseFee Flat fee the client pays for the serve,
 *   including `attemptsIncluded` attempts and `milesIncluded` miles.
 * @param {number} input.attemptsIncluded Attempts already covered by the
 *   base fee.
 * @param {number} input.attemptsActual Attempts it actually took to
 *   complete or exhaust service on this job.
 * @param {number} input.extraAttemptFee Fee paid per attempt beyond
 *   `attemptsIncluded`.
 * @param {number} input.rushJob 0 or 1 -- whether this was billed as a
 *   rush/same-day job.
 * @param {number} input.rushSurchargeFee Fee paid on top of the base fee
 *   when `rushJob` is 1.
 * @param {number} input.skipTraceNeeded 0 or 1 -- whether the address on the
 *   paperwork was bad and needed skip tracing before service was possible.
 * @param {number} input.skipTraceFee Fee paid when `skipTraceNeeded` is 1.
 * @param {number} input.affidavitFee Fee paid for the notarized affidavit of
 *   service filed after a completed serve.
 * @param {number} input.milesRoundTrip Miles actually driven round trip for
 *   this job, across every attempt.
 * @param {number} input.milesIncluded Miles already covered by the base fee
 *   before a per-mile add-on applies.
 * @param {number} input.mileageRate What the client pays per mile beyond
 *   `milesIncluded`.
 * @param {number} input.driveTimeHours Hours spent driving for this job,
 *   across every attempt.
 * @param {number} input.onSiteTimeHours Hours spent at the address across
 *   every attempt, including a completed serve.
 * @param {number} input.paperworkTimeHours Hours spent on the affidavit and
 *   case file afterward.
 * @param {number} input.vehicleCostPerMile Actual fuel and wear cost per
 *   mile -- separate from `mileageRate`, which is only what the client pays.
 * @param {number} input.fixedJobCost This job's share of fixed costs that do
 *   not vary with attempts or miles -- E&O bond, process-server license,
 *   and case-management software, amortized across a month of jobs.
 */
export function calculate(input) {
  const baseFee = number(input.baseFee, 'Base fee');
  const attemptsIncluded = number(input.attemptsIncluded, 'Attempts included');
  const attemptsActual = number(input.attemptsActual, 'Attempts actual');
  const extraAttemptFee = number(input.extraAttemptFee, 'Extra attempt fee');
  const rushJob = number(input.rushJob, 'Rush job flag', { max: 1 });
  const rushSurchargeFee = number(input.rushSurchargeFee, 'Rush surcharge fee');
  const skipTraceNeeded = number(input.skipTraceNeeded, 'Skip trace flag', { max: 1 });
  const skipTraceFee = number(input.skipTraceFee, 'Skip trace fee');
  const affidavitFee = number(input.affidavitFee, 'Affidavit fee');
  const milesRoundTrip = number(input.milesRoundTrip, 'Miles round trip');
  const milesIncluded = number(input.milesIncluded, 'Miles included');
  const mileageRate = number(input.mileageRate, 'Mileage rate');
  const driveTimeHours = number(input.driveTimeHours, 'Drive time hours');
  const onSiteTimeHours = number(input.onSiteTimeHours, 'On-site time hours');
  const paperworkTimeHours = number(input.paperworkTimeHours, 'Paperwork time hours');
  const vehicleCostPerMile = number(input.vehicleCostPerMile, 'Vehicle cost per mile');
  const fixedJobCost = number(input.fixedJobCost, 'Fixed job cost');

  const extraAttempts = Math.max(0, attemptsActual - attemptsIncluded);
  const extraAttemptRevenue = extraAttempts * extraAttemptFee;
  const rushRevenue = rushJob >= 0.5 ? rushSurchargeFee : 0;
  const skipTraceRevenue = skipTraceNeeded >= 0.5 ? skipTraceFee : 0;
  const extraMiles = Math.max(0, milesRoundTrip - milesIncluded);
  const mileageRevenue = extraMiles * mileageRate;

  const grossRevenue = baseFee + extraAttemptRevenue + rushRevenue + skipTraceRevenue + affidavitFee + mileageRevenue;

  const vehicleCost = milesRoundTrip * vehicleCostPerMile;
  const totalCost = vehicleCost + fixedJobCost;
  const netProfit = grossRevenue - totalCost;

  const totalTimeHours = driveTimeHours + onSiteTimeHours + paperworkTimeHours;
  const effectiveHourlyRate = totalTimeHours > 0 ? netProfit / totalTimeHours : null;
  const profitMarginPct = grossRevenue > 0 ? (netProfit / grossRevenue) * 100 : null;

  // The base fee at which this job would break exactly even, holding every
  // add-on and cost constant -- the number to compare a client's flat rate
  // against before accepting a job with a known bad address or a long drive.
  const otherRevenue = extraAttemptRevenue + rushRevenue + skipTraceRevenue + affidavitFee + mileageRevenue;
  const minBaseFeeToBreakEven = totalCost - otherRevenue;

  return {
    extraAttempts, extraAttemptRevenue, rushRevenue, skipTraceRevenue, mileageRevenue,
    grossRevenue, vehicleCost, fixedJobCost, totalCost, netProfit,
    totalTimeHours, effectiveHourlyRate, profitMarginPct, minBaseFeeToBreakEven,
  };
}

/**
 * Rank several named client fee-schedule net profits, each computed by
 * running calculate() once per client for the same job scenario.
 * @param {{name: string, netProfit: number}[]} schedules
 */
export function rankClients(schedules) {
  const validated = schedules.map((schedule, i) => ({
    name: String(schedule.name || `Client ${i + 1}`),
    netProfit: number(schedule.netProfit, `Client ${i + 1} net profit`, { min: -Infinity }),
  }));
  const ranked = [...validated].sort((a, b) => b.netProfit - a.netProfit);
  const best = ranked.length ? ranked[0] : null;
  const worst = ranked.length ? ranked[ranked.length - 1] : null;
  const spread = best && worst ? best.netProfit - worst.netProfit : 0;
  return { ranked, best, worst, spread, clientCount: ranked.length };
}
