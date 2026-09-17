// Deterministic reserve-fund projection for an HOA/condo association board
// treasurer or community association manager: given the fund's current
// balance, the association's current annual reserve contribution, and a list
// of capital components (roof, repaving, painting, pool, elevator, HVAC,
// etc.) each with a remaining useful life and a replacement cost, project the
// fund year by year and answer two questions a board actually has —
//
//   Is the association headed for a special assessment or reserve loan at
//   today's contribution rate, and if so, in which year?
//
//   What is the smallest annual contribution that avoids that outcome, and
//   what does the gap between "do nothing" and "fixed" cost per unit, either
//   as a one-time special assessment or as a phased monthly dues increase?
//
// This is a planning estimate from the numbers a board supplies, not the
// state-mandated reserve study some jurisdictions require (Florida's SB 4-D /
// SIRS regime being the most prominent) and not a substitute for one.
//
//   runSchedule(inputs)                     — full year-by-year projection.
//   firstShortfallYear(inputs)              — first year balance goes
//                                              negative or percent funded
//                                              drops below the target, or
//                                              null if the horizon clears.
//   minimumContributionToAvoidShortfall(..) — smallest annual contribution
//                                              (binary search) that clears
//                                              every year of the horizon, or
//                                              null if even a generous cap
//                                              cannot.
//   perUnitImpact(inputs)                   — both of the above expressed as
//                                              per-unit dollars: a one-time
//                                              special-assessment estimate at
//                                              the "do nothing" shortfall,
//                                              and a phased monthly dues
//                                              increase to the solved
//                                              contribution.

export const DEFAULTS = {
  currentBalance: 150000,
  annualContribution: 40000,
  unitCount: 120,
  inflationRate: 0.035,
  interestRate: 0.02,
  horizonYears: 30,
  targetPercentFunded: 0.3,
  components: [
    { name: 'Roof', remainingUsefulLifeYears: 8, replacementCost: 380000, fullLifeYears: 20 },
    { name: 'Repaving / asphalt', remainingUsefulLifeYears: 4, replacementCost: 210000, fullLifeYears: 15 },
    { name: 'Exterior painting', remainingUsefulLifeYears: 2, replacementCost: 95000, fullLifeYears: 7 },
    { name: 'Pool resurfacing', remainingUsefulLifeYears: 6, replacementCost: 45000, fullLifeYears: 12 },
    { name: 'Elevator modernization', remainingUsefulLifeYears: 12, replacementCost: 180000, fullLifeYears: 25 },
    { name: 'HVAC (common areas)', remainingUsefulLifeYears: 5, replacementCost: 60000, fullLifeYears: 15 },
  ],
};

function number(value, label, { min = 0, max = null, integer = false } = {}) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min) {
    throw new Error(min === 0 ? `${label} must be zero or greater.` : `${label} must be at least ${min}.`);
  }
  if (max !== null && parsed > max) throw new Error(`${label} must be ${max} or less.`);
  if (integer && !Number.isInteger(parsed)) throw new Error(`${label} must be a whole number.`);
  return parsed;
}

/**
 * Validate and normalize the `components` list, returning plain numeric
 * component records with a mutable `remaining` counter (a copy of
 * `remainingUsefulLifeYears`) that the simulation below advances year by
 * year. `fullLifeYears` must be greater than zero — it is both the cyclical
 * reset value and a prorate-formula denominator.
 */
function normalizeComponents(components) {
  if (!Array.isArray(components)) throw new Error('Components must be a list.');
  return components.map((c, i) => {
    const label = c && c.name ? c.name : `Component ${i + 1}`;
    const fullLifeYears = number(c.fullLifeYears, `${label} full life years`, { min: 0.0001 });
    const remainingUsefulLifeYears = number(c.remainingUsefulLifeYears, `${label} remaining useful life years`);
    const replacementCost = number(c.replacementCost, `${label} replacement cost`);
    return { name: label, fullLifeYears, remainingUsefulLifeYears, replacementCost, remaining: remainingUsefulLifeYears };
  });
}

/**
 * Straight-line reserve-funding baseline: what a fully-funded, no-interest,
 * no-inflation plan would contribute annually — sum of each component's
 * replacement cost spread evenly across its own full life. Used only to size
 * a sane search ceiling for `minimumContributionToAvoidShortfall`, never to
 * drive the simulation itself.
 */
function straightLineBaseline(components) {
  return components.reduce((sum, c) => sum + c.replacementCost / c.fullLifeYears, 0);
}

/**
 * Run the year-by-year simulation and return the full internal state per
 * year, including `obligationSum` — the denominator of the percent-funded
 * metric — which `runSchedule` strips before returning its public rows, and
 * `perUnitImpact` needs to size a deficit. Keeping one internal generator
 * that both callers share is what keeps the percent-funded math from
 * drifting between them.
 *
 * Each component's "current (inflated) full replacement cost" for a given
 * year is `replacementCost * (1 + inflationRate) ** year` — inflated by the
 * same number of years the schedule has run, applied every year to every
 * component (not only the ones replaced that year), since a reserve study's
 * percent-funded metric is read against what each component would cost to
 * replace *today*, not what it cost when the study began.
 */
function simulate(inputs) {
  const currentBalance = number(inputs.currentBalance, 'Current balance', { min: -Infinity });
  const annualContribution = number(inputs.annualContribution, 'Annual contribution');
  const inflationRate = number(inputs.inflationRate ?? DEFAULTS.inflationRate, 'Inflation rate', { min: -1 });
  const interestRate = number(inputs.interestRate ?? DEFAULTS.interestRate, 'Interest rate', { min: -1 });
  const horizonYears = number(inputs.horizonYears ?? DEFAULTS.horizonYears, 'Horizon years', { min: 1, integer: true });
  const targetPercentFunded = number(inputs.targetPercentFunded ?? DEFAULTS.targetPercentFunded, 'Target percent funded', { min: 0 });
  const components = normalizeComponents(inputs.components ?? []);

  let balance = currentBalance;
  const rows = [];

  for (let year = 1; year <= horizonYears; year++) {
    // 1. Credit interest on the balance.
    balance *= 1 + interestRate;
    // 2. Add the annual contribution.
    balance += annualContribution;

    // 3. Replace every component whose remaining useful life reaches zero
    // this year, inflating its cost by the years elapsed since the start of
    // the schedule, then reset it to a fresh cycle of its own full life.
    const componentsReplacedThisYear = [];
    for (const c of components) {
      c.remaining -= 1;
      if (c.remaining <= 0) {
        const inflatedCost = c.replacementCost * (1 + inflationRate) ** year;
        balance -= inflatedCost;
        componentsReplacedThisYear.push(c.name);
        c.remaining = c.fullLifeYears;
      }
    }

    // 4. Percent funded: balance against the sum of each component's
    // age-prorated share of its own current (inflated) replacement cost.
    // A component with no components at all (or one freshly replaced, whose
    // prorated share is exactly zero) has zero current obligation — read as
    // fully funded (1.0) rather than a division-by-zero NaN.
    const obligationSum = components.reduce((sum, c) => {
      const currentReplacementCost = c.replacementCost * (1 + inflationRate) ** year;
      return sum + currentReplacementCost * (c.fullLifeYears - c.remaining) / c.fullLifeYears;
    }, 0);
    const percentFunded = obligationSum === 0 ? 1 : balance / obligationSum;

    // 5. A special assessment (or reserve loan) is triggered by either a
    // negative balance or falling below the board's chosen funding target.
    const specialAssessmentTriggered = balance < 0 || percentFunded < targetPercentFunded;

    rows.push({ year, balance, percentFunded, componentsReplacedThisYear, specialAssessmentTriggered, obligationSum });
  }

  return rows;
}

/** The full year-by-year projection, as the public `{ year, balance,
 * percentFunded, componentsReplacedThisYear, specialAssessmentTriggered }`
 * shape described above.
 */
export function runSchedule(inputs) {
  return simulate(inputs).map(({ year, balance, percentFunded, componentsReplacedThisYear, specialAssessmentTriggered }) => (
    { year, balance, percentFunded, componentsReplacedThisYear, specialAssessmentTriggered }
  ));
}

/**
 * The first year (1-indexed) a special assessment or reserve loan is
 * triggered, or `null` if none of the horizon's years trigger one.
 */
export function firstShortfallYear(inputs) {
  const row = simulate(inputs).find((r) => r.specialAssessmentTriggered);
  return row ? row.year : null;
}

/**
 * The dollar deficit at a given year's row: how far the balance sits below
 * what the board's own target percent funded requires against that year's
 * obligation, floored at zero. This is what a one-time special assessment
 * would need to raise to close the gap that year — it also naturally covers
 * an outright negative balance, since `targetPercentFunded * obligationSum`
 * is never itself negative.
 */
function deficitAtRow(row, targetPercentFunded) {
  return Math.max(0, targetPercentFunded * row.obligationSum - row.balance);
}

/**
 * The smallest annual contribution (all else in `inputs` held fixed) that
 * keeps `specialAssessmentTriggered` false for every year of the horizon.
 * Binary search: raising the contribution strictly increases every later
 * year's balance (it is added every year, before any compounding), so
 * whether a candidate contribution clears the whole horizon is monotonic in
 * the contribution and a binary search is valid.
 *
 * The search ceiling is `capMultiple` (default 10) times the larger of the
 * association's current contribution and the components' own straight-line
 * funding baseline — using the baseline as a floor for the multiple matters
 * when the current contribution is $0 or otherwise far below any sane
 * search range. If even that ceiling cannot clear the horizon, this returns
 * `null` rather than searching indefinitely: report it as "cannot be solved
 * within this horizon at this component cost schedule."
 */
export function minimumContributionToAvoidShortfall(inputs, { capMultiple = 10, tolerance = 1, maxIterations = 200 } = {}) {
  const components = normalizeComponents(inputs.components ?? []);
  const baseline = Math.max(straightLineBaseline(components), number(inputs.annualContribution, 'Annual contribution'), 1);
  const cap = baseline * capMultiple;

  const clearsHorizon = (annualContribution) =>
    !simulate({ ...inputs, annualContribution }).some((r) => r.specialAssessmentTriggered);

  if (!clearsHorizon(cap)) return null;

  let lo = 0;
  let hi = cap;
  for (let i = 0; i < maxIterations && hi - lo > tolerance; i++) {
    const mid = (lo + hi) / 2;
    if (clearsHorizon(mid)) hi = mid; else lo = mid;
  }
  return Math.round(hi * 100) / 100;
}

/**
 * Both headline numbers expressed as per-unit dollars: the "do nothing"
 * first shortfall's deficit as a one-time per-unit special-assessment
 * estimate, and the gap between the current and solved contribution as a
 * phased monthly per-unit dues increase.
 */
export function perUnitImpact(inputs) {
  const unitCount = number(inputs.unitCount, 'Unit count', { min: 1 });
  const annualContribution = number(inputs.annualContribution, 'Annual contribution');
  const targetPercentFunded = number(inputs.targetPercentFunded ?? DEFAULTS.targetPercentFunded, 'Target percent funded', { min: 0 });

  const rows = simulate(inputs);
  const shortfallRow = rows.find((r) => r.specialAssessmentTriggered);
  const shortfallYear = shortfallRow ? shortfallRow.year : null;
  const oneTimeSpecialAssessmentPerUnit = shortfallRow ? deficitAtRow(shortfallRow, targetPercentFunded) / unitCount : 0;

  const minimumContribution = minimumContributionToAvoidShortfall(inputs);
  const monthlyDuesIncreasePerUnit = minimumContribution === null
    ? null
    : Math.max(0, minimumContribution - annualContribution) / 12 / unitCount;

  return { shortfallYear, minimumContribution, oneTimeSpecialAssessmentPerUnit, monthlyDuesIncreasePerUnit };
}
