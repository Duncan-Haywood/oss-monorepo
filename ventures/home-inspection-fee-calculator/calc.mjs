// Pricing arithmetic for one residential home inspection, plus a weekly
// income-goal check. Pure functions, no DOM and no network — see README.md
// for why (everything runs in the browser, nothing is ever uploaded).
//
// The model an independent home inspector actually reasons in
// ------------------------------------------------------------
// A franchise brand (Pillar To Post, WIN, HouseMaster) hands its inspectors a
// fee schedule. An independent has to build one themselves, and the arithmetic
// that actually drives on-site time is specific to this trade: square footage
// sets the floor, but stories, foundation type, and the home's age each add
// real minutes that a flat per-square-foot number quietly absorbs into margin
// or into an inspection that runs long. This calculator makes each of those
// additions an explicit line rather than a gut-feel adjustment to a base price.
//
// Add-on services (radon, sewer scope, termite/WDO, mold air sample) are
// priced at their own flat fee rather than folded into the time-based
// estimate — they are usually a separate instrument or a separate
// specialist step, not more minutes of the same walk-through.
export const DEFAULTS = Object.freeze({
  squareFootage: 2000,
  stories: 2,
  foundationType: 'crawlspace', // 'slab' | 'crawlspace' | 'basement'
  homeAgeYears: 25,
  roundTripMiles: 20,
  mileageRate: 0.7,
  baseHourlyRate: 100,
  rushReport: false,
  rushFeePct: 15,
  radon: false,
  radonFee: 150,
  sewerScope: false,
  sewerScopeFee: 175,
  termiteWdo: false,
  termiteWdoFee: 90,
  moldTest: false,
  moldTestFee: 125,
  overheadPerJob: 35,
  targetMarginPct: 25,
});

export const FOUNDATION_TYPES = Object.freeze(['slab', 'crawlspace', 'basement']);

/** Hours added on site per square foot of living area. */
const BASE_HOURS_PER_SQFT = 0.00125; // 2,000 sqft -> 2.5 base hours
const MIN_BASE_HOURS = 1.25;

/** Extra hours for climbing stairs and inspecting additional levels. */
const HOURS_PER_EXTRA_STORY = 0.25;

/** Extra hours by foundation/access type, relative to a slab (no crawl, no basement mechanicals room). */
const FOUNDATION_HOURS = Object.freeze({ slab: 0, crawlspace: 0.5, basement: 0.25 });

/** Extra hours for an older home's likely-aged systems and deferred maintenance. */
function ageHours(homeAgeYears) {
  if (homeAgeYears >= 60) return 1;
  if (homeAgeYears >= 25) return 0.5;
  if (homeAgeYears >= 10) return 0.25;
  return 0;
}

function estimateOnSiteHours({ squareFootage, stories, foundationType, homeAgeYears }) {
  const base = Math.max(MIN_BASE_HOURS, squareFootage * BASE_HOURS_PER_SQFT);
  const storyAdd = Math.max(0, stories - 1) * HOURS_PER_EXTRA_STORY;
  const foundationAdd = FOUNDATION_HOURS[foundationType] ?? 0;
  return base + storyAdd + foundationAdd + ageHours(homeAgeYears);
}

function need(cond, message) {
  if (!cond) throw new Error(message);
}

/**
 * Price one inspection from the job's own numbers.
 *
 * `cost` is labor (on-site hours x hourly rate, with the rush premium applied
 * to that labor only — a same-day turnaround costs you scheduling flexibility,
 * not a discount on the sewer scope), travel, each selected add-on at its own
 * flat fee, and a per-job overhead allowance (E&O insurance, report software,
 * ladder/tools amortization). `price` marks that cost up to hit the target
 * margin, the same cost-plus-margin shape as every other calculator in this
 * portfolio, so the number is a floor to defend rather than a guess to round.
 */
export function calculateQuote(input) {
  const squareFootage = Number(input.squareFootage);
  const stories = Number(input.stories);
  const foundationType = input.foundationType;
  const homeAgeYears = Number(input.homeAgeYears);
  const roundTripMiles = Number(input.roundTripMiles);
  const mileageRate = Number(input.mileageRate);
  const baseHourlyRate = Number(input.baseHourlyRate);
  const rushReport = Boolean(input.rushReport);
  const rushFeePct = Number(input.rushFeePct);
  const overheadPerJob = Number(input.overheadPerJob);
  const targetMarginPct = Number(input.targetMarginPct);

  need(Number.isFinite(squareFootage) && squareFootage > 0, 'Square footage must be a positive number.');
  need(Number.isFinite(stories) && stories >= 1, 'Stories must be 1 or more.');
  need(FOUNDATION_TYPES.includes(foundationType), `Foundation type must be one of ${FOUNDATION_TYPES.join(', ')}.`);
  need(Number.isFinite(homeAgeYears) && homeAgeYears >= 0, 'Home age must be zero or more.');
  need(Number.isFinite(roundTripMiles) && roundTripMiles >= 0, 'Round-trip travel miles must be zero or more.');
  need(Number.isFinite(mileageRate) && mileageRate >= 0, 'Mileage rate must be zero or more.');
  need(Number.isFinite(baseHourlyRate) && baseHourlyRate > 0, 'Hourly rate must be a positive number.');
  need(Number.isFinite(rushFeePct) && rushFeePct >= 0, 'Rush fee percent must be zero or more.');
  need(Number.isFinite(overheadPerJob) && overheadPerJob >= 0, 'Overhead per job must be zero or more.');
  need(
    Number.isFinite(targetMarginPct) && targetMarginPct >= 0 && targetMarginPct < 100,
    'Target margin must be between 0 and 99%.',
  );

  const onSiteHours = estimateOnSiteHours({ squareFootage, stories, foundationType, homeAgeYears });
  const laborCost = onSiteHours * baseHourlyRate;
  const rushSurcharge = rushReport ? laborCost * (rushFeePct / 100) : 0;
  const travelCost = roundTripMiles * mileageRate;

  const addOns = [
    { key: 'radon', label: 'Radon test', selected: Boolean(input.radon), fee: Number(input.radonFee) },
    { key: 'sewerScope', label: 'Sewer scope', selected: Boolean(input.sewerScope), fee: Number(input.sewerScopeFee) },
    { key: 'termiteWdo', label: 'Termite / WDO inspection', selected: Boolean(input.termiteWdo), fee: Number(input.termiteWdoFee) },
    { key: 'moldTest', label: 'Mold air sample', selected: Boolean(input.moldTest), fee: Number(input.moldTestFee) },
  ];
  for (const a of addOns) {
    if (a.selected) need(Number.isFinite(a.fee) && a.fee >= 0, `${a.label} fee must be zero or more.`);
  }
  const addOnsTotal = addOns.filter((a) => a.selected).reduce((sum, a) => sum + a.fee, 0);

  const cost = laborCost + rushSurcharge + travelCost + addOnsTotal + overheadPerJob;
  const finalPrice = cost / (1 - targetMarginPct / 100);
  const profit = finalPrice - cost;
  const profitMarginPct = finalPrice > 0 ? (profit / finalPrice) * 100 : null;
  const effectiveHourlyRate = onSiteHours > 0 ? profit / onSiteHours + baseHourlyRate : null;

  return {
    onSiteHours,
    laborCost,
    rushSurcharge,
    travelCost,
    addOnsTotal,
    addOns,
    overheadPerJob,
    cost,
    finalPrice,
    profit,
    profitMarginPct,
    effectiveHourlyRate,
  };
}

/**
 * How a week of inspections, at a stated average profit per job, compares to
 * a weekly income goal — the same "does the schedule actually clear the
 * target" check every route/route-adjacent calculator in this portfolio
 * offers, adapted from a day to a week because inspectors usually think in
 * a weekly booking count rather than a daily one.
 */
export function weeklyIncomeGap(targetWeeklyIncome, profitPerInspection, inspectionsPerWeek) {
  const target = Number(targetWeeklyIncome) || 0;
  const perJob = Number(profitPerInspection);
  const jobs = Number(inspectionsPerWeek);
  const totalWeeklyProfit = Number.isFinite(perJob) && Number.isFinite(jobs) ? perJob * jobs : 0;
  const gap = target - totalWeeklyProfit;
  const meetsTarget = gap <= 0;
  const additionalJobsNeeded = meetsTarget || !(perJob > 0) ? (meetsTarget ? 0 : null) : Math.ceil(gap / perJob);
  return { totalWeeklyProfit, gap, meetsTarget, additionalJobsNeeded };
}
