/**
 * What one crew hour actually costs, and what it has to be billed at.
 *
 * Every trade bid calculator in this repository asks for four numbers about the
 * contractor's *business* rather than the job: crew hourly wage, payroll burden
 * %, overhead on direct cost %, and target net margin %. `platform/pages/rates.mjs`
 * carries them between tools so they are typed once. Nothing anywhere computed
 * them. A contractor arriving at any of those calculators had to supply a burden
 * and an overhead rate from memory, and the two most common answers — "about
 * 20%" for burden and "10%" for overhead — are both, for a small trade shop,
 * wrong by enough to turn a bid that looks profitable into one that is not.
 *
 * This module is the arithmetic behind those two numbers, and behind the one a
 * contractor actually wants: the hourly rate the work has to be sold at.
 *
 * Two design decisions are load-bearing.
 *
 * **Burden is expressed per *billable* hour, not per paid hour.** A field
 * employee is paid for 2,080 hours a year and bills far fewer: holidays,
 * vacation and sick days are paid and not billable, and of the hours that are
 * worked, drive time, estimating, shop time, warranty callbacks and rework are
 * not on anybody's invoice. The bid calculators multiply the loaded wage by the
 * hours *estimated for a job*, which are billable hours. So the burden rate they
 * want is the one that recovers the whole annual cost of employing somebody
 * across only the hours that get sold. Computing burden as "taxes plus insurance
 * as a percentage of wages" — the textbook definition, and what a contractor
 * reaches for — leaves every unbillable paid hour uncovered, which is the single
 * largest hole in a small shop's pricing.
 *
 * **Overhead is a percentage of direct cost, not of revenue.** That is what
 * `overheadRate` means on the receiving pages (see `SHOP_RATE_FIELDS` in
 * `platform/pages/rates.mjs`, which says so explicitly), and it is not the same
 * as the "overhead percentage" in a profit-and-loss statement, which is over
 * revenue. Confusing the two under-recovers overhead on every job. The
 * denominator here is annual direct cost — loaded field labour plus materials
 * and subcontractors — so the rate can be applied to a job's direct cost the way
 * the calculators apply it.
 *
 * Nothing here is an accounting determination, a tax position, or a
 * classification opinion about who is an employee. It is the contractor's own
 * numbers, divided.
 */

/** Required field ids read off the form, in the order the page presents them. */
export const NUMERIC_IDS = Object.freeze([
  'hourlyWage',
  'fieldCrewCount',
  'paidHoursPerWeek',
  'paidWeeksPerYear',
  'paidDaysOffPerYear',
  'nonBillablePercent',
  'payrollTaxPercent',
  'workersCompPercent',
  'liabilityInsurancePercent',
  'benefitsPerYear',
  'vehicleToolsPerYear',
  'ownerAdminSalary',
  'officeRentUtilities',
  'softwareAccountingLegal',
  'marketingAndLeads',
  'insuranceLicensesOther',
  'annualMaterialAndSubCost',
  'targetMargin',
]);

/**
 * Fields the form owns that may legitimately be left blank.
 *
 * Blank is an error for everything in `NUMERIC_IDS` — a missing wage is a broken
 * calculation, not a zero. `currentRatePerHour` is different: a contractor who
 * has never set a rate, or who does not want to type it, still gets the whole
 * answer. Blank means "no comparison", not "you charge nothing".
 */
export const OPTIONAL_NUMERIC_IDS = Object.freeze(['currentRatePerHour']);

/** Every id on the form. What the page reads, and what it marks when invalid. */
export const ALL_INPUT_IDS = Object.freeze([...NUMERIC_IDS, ...OPTIONAL_NUMERIC_IDS]);

/** Upper bound on a typed current rate, matching the form's own `max`. */
export const CURRENT_RATE_MAX = 100000;

/**
 * The ceilings `platform/pages/rates.mjs` will carry.
 *
 * A computed rate above these is arithmetically real but cannot be handed to the
 * bid calculators: `usableRate` there drops anything over `max`, and the forms
 * themselves reject it. Silently offering a number that the next tool discards
 * would be a "saved" rate that never appears, so the result says so instead.
 */
export const CARRY_LIMITS = Object.freeze({
  burdenRate: 500,
  overheadRate: 500,
  targetMargin: 99.9,
});

/** A working day, in hours, derived from the week the contractor actually pays. */
const DAYS_PER_WEEK = 5;

function isBlank(value) {
  return value === '' || value === null || value === undefined || String(value).trim() === '';
}

function toNumber(value) {
  if (isBlank(value)) return NaN;
  return typeof value === 'number' ? value : Number(String(value).trim());
}

/**
 * Read one field, or record why it cannot be used.
 *
 * Blank is an error rather than a zero. `Number('')` is 0, and a blank wage that
 * became $0 would produce a burden rate of infinity and an hourly bill rate of
 * nothing, both of which look like answers.
 */
function readField(errors, input, id, { min = 0, max = Infinity, label }) {
  const value = toNumber(input[id]);
  if (!Number.isFinite(value)) {
    errors.push({ id, message: `${label} is needed.` });
    return 0;
  }
  if (value < min) {
    errors.push({ id, message: `${label} cannot be below ${min}.` });
    return 0;
  }
  if (value > max) {
    errors.push({ id, message: `${label} cannot be above ${max}.` });
    return 0;
  }
  return value;
}

/**
 * Cost per crew hour, the rates the site carries, and the price they imply.
 *
 * Returns `{ ok: false, errors }` when the inputs cannot produce a number, so a
 * caller never has to tell a real result from a placeholder one.
 */
export function calculateShopRate(input = {}) {
  const errors = [];
  const read = (id, opts) => readField(errors, input, id, opts);

  const hourlyWage = read('hourlyWage', { min: 0.01, max: 100000, label: 'Crew hourly wage' });
  const fieldCrewCount = read('fieldCrewCount', { min: 1, max: 500, label: 'Field crew size' });
  const paidHoursPerWeek = read('paidHoursPerWeek', { min: 1, max: 168, label: 'Paid hours a week' });
  const paidWeeksPerYear = read('paidWeeksPerYear', { min: 1, max: 52, label: 'Paid weeks a year' });
  const paidDaysOffPerYear = read('paidDaysOffPerYear', { min: 0, max: 365, label: 'Paid days off a year' });
  const nonBillablePercent = read('nonBillablePercent', { min: 0, max: 99, label: 'Non-billable share of worked hours' });

  const payrollTaxPercent = read('payrollTaxPercent', { min: 0, max: 100, label: 'Payroll taxes' });
  const workersCompPercent = read('workersCompPercent', { min: 0, max: 200, label: 'Workers’ comp' });
  const liabilityInsurancePercent = read('liabilityInsurancePercent', { min: 0, max: 100, label: 'Liability insurance on payroll' });
  const benefitsPerYear = read('benefitsPerYear', { min: 0, max: 1000000, label: 'Benefits per person' });
  const vehicleToolsPerYear = read('vehicleToolsPerYear', { min: 0, max: 1000000, label: 'Vehicle, fuel, phone and tools per person' });

  const ownerAdminSalary = read('ownerAdminSalary', { min: 0, max: 100000000, label: 'Owner and office pay' });
  const officeRentUtilities = read('officeRentUtilities', { min: 0, max: 100000000, label: 'Yard, office and utilities' });
  const softwareAccountingLegal = read('softwareAccountingLegal', { min: 0, max: 100000000, label: 'Software, accounting and legal' });
  const marketingAndLeads = read('marketingAndLeads', { min: 0, max: 100000000, label: 'Marketing and lead fees' });
  const insuranceLicensesOther = read('insuranceLicensesOther', { min: 0, max: 100000000, label: 'Business insurance, licences and other' });

  const annualMaterialAndSubCost = read('annualMaterialAndSubCost', { min: 0, max: 1000000000, label: 'Materials and subcontractors a year' });
  const targetMargin = read('targetMargin', { min: 0, max: CARRY_LIMITS.targetMargin, label: 'Target net margin' });

  // Optional, and blank is not an error — but a number typed and then mistyped
  // must not be silently dropped, or the comparison quietly disappears and the
  // visitor reads that as "no gap".
  const hasCurrentRate = !isBlank(input.currentRatePerHour);
  const currentRatePerHour = hasCurrentRate
    ? read('currentRatePerHour', { min: 0.01, max: CURRENT_RATE_MAX, label: 'What you charge today' })
    : null;

  if (errors.length > 0) return { ok: false, errors };

  const paidHoursPerYear = paidHoursPerWeek * paidWeeksPerYear;
  const hoursPerDay = paidHoursPerWeek / DAYS_PER_WEEK;
  const paidTimeOffHours = paidDaysOffPerYear * hoursPerDay;
  const workedHours = paidHoursPerYear - paidTimeOffHours;

  // Days off are entered against a year the contractor also describes. Somebody
  // paying 30 weeks of seasonal work and claiming 25 days off has described a
  // year with no work in it; that is a contradiction in the inputs rather than a
  // rate, and it must not divide.
  if (workedHours <= 0) {
    errors.push({
      id: 'paidDaysOffPerYear',
      message: 'Paid days off use up the whole paid year — there are no hours left to work.',
    });
    return { ok: false, errors };
  }

  const billableHoursPerYear = workedHours * (1 - nonBillablePercent / 100);
  if (billableHoursPerYear <= 0) {
    errors.push({
      id: 'nonBillablePercent',
      message: 'No hours are left to bill once the non-billable share is taken out.',
    });
    return { ok: false, errors };
  }

  // Wages are paid on every paid hour, holidays and vacation included. That is
  // the point: those hours cost money and bill nothing, and the rate below is
  // where they get recovered.
  const wagesPerYear = hourlyWage * paidHoursPerYear;
  const payrollTaxCost = (wagesPerYear * payrollTaxPercent) / 100;
  const workersCompCost = (wagesPerYear * workersCompPercent) / 100;
  const liabilityCost = (wagesPerYear * liabilityInsurancePercent) / 100;
  const burdenCost = payrollTaxCost + workersCompCost + liabilityCost + benefitsPerYear + vehicleToolsPerYear;

  const annualCostPerPerson = wagesPerYear + burdenCost;
  const costPerBillableHour = annualCostPerPerson / billableHoursPerYear;

  // The number the bid calculators mean by `burdenRate`: the percentage that,
  // added to the base wage, gives the true cost of an hour that is sold.
  const burdenRate = (costPerBillableHour / hourlyWage - 1) * 100;

  const annualOverhead =
    ownerAdminSalary + officeRentUtilities + softwareAccountingLegal + marketingAndLeads + insuranceLicensesOther;

  const annualDirectLabor = annualCostPerPerson * fieldCrewCount;
  const annualDirectCost = annualDirectLabor + annualMaterialAndSubCost;
  const overheadRate = (annualOverhead / annualDirectCost) * 100;

  const loadedHourWithOverhead = costPerBillableHour * (1 + overheadRate / 100);
  const marginDivisor = 1 - targetMargin / 100;
  const billRatePerHour = loadedHourWithOverhead / marginDivisor;

  const annualCostTotal = annualDirectCost + annualOverhead;
  const revenueNeeded = annualCostTotal / marginDivisor;
  const profitAtTarget = revenueNeeded - annualCostTotal;

  const utilization = (billableHoursPerYear / paidHoursPerYear) * 100;

  const carry = {
    hourlyWage,
    burdenRate: round2(burdenRate),
    overheadRate: round2(overheadRate),
    targetMargin,
  };

  const figures = {
    ok: true,
    errors: [],
    fieldCrewCount,
    targetMargin,
    paidHoursPerYear,
    paidTimeOffHours,
    workedHours,
    billableHoursPerYear,
    utilization,
    wagesPerYear,
    burdenCost,
    annualCostPerPerson,
    costPerBillableHour,
    burdenRate,
    annualOverhead,
    annualDirectLabor,
    annualDirectCost,
    overheadRate,
    loadedHourWithOverhead,
    billRatePerHour,
    breakEvenRatePerHour: loadedHourWithOverhead,
    revenueNeeded,
    profitAtTarget,
    carry,
    carryWarnings: carryWarnings(carry),
    notes: notes({ utilization, burdenRate, overheadRate, targetMargin }),
  };

  figures.comparison = hasCurrentRate ? compareCurrentRate(figures, currentRatePerHour) : null;
  return figures;
}

/**
 * The rate they charge today, measured against the one their own year requires.
 *
 * This is the half of the question the rest of the module does not answer. A
 * contractor already has a number — the one on last week's quote — and the
 * useful comparison is not "here is a rate" but "here is what yours is doing".
 * Three figures do that work, and each is deliberately stated over a base the
 * contractor can check:
 *
 * **The margin their rate actually earns.** Solved backwards from the same
 * loaded hour the target rate is built on, so it is the honest counterpart of
 * the target they typed: negative means the hour is sold below what it costs
 * once overhead is in it, and the shop pays the difference on every hour it
 * sells.
 *
 * **The annual size of the gap, over labour revenue only.** `revenueNeeded`
 * above covers materials and subs as well, and those are billed on top of the
 * hours rather than through the rate, so multiplying the whole shortfall by the
 * whole revenue would overstate it. The base here is exactly what the rate
 * controls: billable hours × crew, one year.
 *
 * **The billable hours their rate would need.** Nothing else on the page tells
 * a contractor what would have to be *true* for the number they already charge
 * to work. It inverts cleanly because the billable share moves neither the
 * annual cost of employing somebody nor the overhead rate (whose denominator is
 * annual direct cost, not hours) — so the required hours are exact rather than
 * a search, and when they exceed the hours actually worked, the answer is that
 * no amount of scheduling saves the rate.
 */
export function compareCurrentRate(result, currentRatePerHour) {
  const rate = Number(currentRatePerHour);
  if (!Number.isFinite(rate) || rate <= 0) return null;

  const crew = result.fieldCrewCount;
  const gapPerHour = rate - result.billRatePerHour;
  const gapAtBreakEven = rate - result.breakEvenRatePerHour;
  const marginAtCurrentRate = ((rate - result.loadedHourWithOverhead) / rate) * 100;
  const annualGap = gapPerHour * result.billableHoursPerYear * crew;
  const annualLabourRevenue = rate * result.billableHoursPerYear * crew;

  const requiredBillableHours =
    (result.annualCostPerPerson * (1 + result.overheadRate / 100)) /
    (rate * (1 - result.targetMargin / 100));
  const requiredUtilization = (requiredBillableHours / result.paidHoursPerYear) * 100;
  // Hours that are not worked cannot be billed, whatever the schedule looks
  // like, so the ceiling is worked hours rather than paid ones.
  const reachable = requiredBillableHours <= result.workedHours;

  return {
    currentRatePerHour: rate,
    requiredRatePerHour: result.billRatePerHour,
    gapPerHour,
    gapAtBreakEven,
    coversCost: gapAtBreakEven >= 0,
    meetsTarget: gapPerHour >= 0,
    marginAtCurrentRate,
    annualGap,
    annualLabourRevenue,
    requiredBillableHours,
    requiredUtilization,
    reachable,
    messages: comparisonMessages({
      rate,
      gapPerHour,
      gapAtBreakEven,
      marginAtCurrentRate,
      annualGap,
      requiredBillableHours,
      requiredUtilization,
      reachable,
      result,
    }),
  };
}

/**
 * The comparison in the contractor's terms.
 *
 * Statements about the arithmetic, never instructions: this page does not tell
 * anybody what to charge, and a tool that said "raise your rate" would be doing
 * exactly that on figures it cannot verify.
 */
function comparisonMessages({
  rate,
  gapPerHour,
  gapAtBreakEven,
  marginAtCurrentRate,
  annualGap,
  requiredBillableHours,
  requiredUtilization,
  reachable,
  result,
}) {
  const out = [];
  const perHour = amount => `$${Math.abs(amount).toFixed(2)}`;
  const perYear = amount => `$${Math.round(Math.abs(amount)).toLocaleString('en-US')}`;
  // The gap is stated per hour and then per year, and the year needs to say
  // whose hours it counted: one person's shortfall and a five-person crew's are
  // the same rate and very different money.
  const acrossTheCrew =
    result.fieldCrewCount > 1
      ? `across the hours ${result.fieldCrewCount} field crew bill`
      : 'across the hours you bill';
  const overTheYear = `${perYear(annualGap)} a year, ${acrossTheCrew}`;

  if (gapAtBreakEven < 0) {
    out.push(
      `At ${perHour(rate)} an hour you are ${perHour(gapAtBreakEven)} below the break-even hour of $${result.breakEvenRatePerHour.toFixed(2)}. Every billable hour sold at this rate loses money before any profit is counted — about ${overTheYear}.`,
    );
  } else if (gapPerHour < 0) {
    out.push(
      `${perHour(rate)} an hour covers cost and overhead but earns ${marginAtCurrentRate.toFixed(1)}% net on labour, not the ${result.targetMargin.toFixed(1)}% you asked for. The difference is ${perHour(gapPerHour)} an hour, or about ${overTheYear}.`,
    );
  } else {
    out.push(
      `${perHour(rate)} an hour is ${perHour(gapPerHour)} above the rate your ${result.targetMargin.toFixed(1)}% target needs, and earns ${marginAtCurrentRate.toFixed(1)}% net on labour — about ${perYear(annualGap)} a year more than the target rate would bring in, ${acrossTheCrew}.`,
    );
  }

  if (gapPerHour < 0) {
    if (reachable) {
      out.push(
        `${perHour(rate)} would be the right rate if each person billed ${Math.round(requiredBillableHours).toLocaleString('en-US')} hours a year — ${requiredUtilization.toFixed(0)}% of the hours you pay for, against the ${result.utilization.toFixed(0)}% you entered.`,
      );
    } else {
      out.push(
        `No billable share makes ${perHour(rate)} work: it would take ${Math.round(requiredBillableHours).toLocaleString('en-US')} billable hours a year from a person who only works ${Math.round(result.workedHours).toLocaleString('en-US')}. The gap is in the rate, not the schedule.`,
      );
    }
  }

  return out;
}

/** Two decimals, which is the precision the carried rates are stored at. */
function round2(value) {
  return Math.round(value * 100) / 100;
}

/**
 * Rates that are real but that the rest of the site will not accept.
 *
 * Reported rather than clamped. Clamping would hand the bid calculators a
 * number this page never computed, and the contractor would price every job
 * against it without being told.
 */
export function carryWarnings(carry) {
  const out = [];
  if (carry.burdenRate > CARRY_LIMITS.burdenRate) {
    out.push(
      `A payroll burden of ${carry.burdenRate.toFixed(1)}% is above the ${CARRY_LIMITS.burdenRate}% the bid calculators accept, so it cannot be carried to them. Check the hours and the per-person costs above — a burden this high usually means the billable hours are far too low rather than the costs too high.`,
    );
  }
  if (carry.overheadRate > CARRY_LIMITS.overheadRate) {
    out.push(
      `An overhead rate of ${carry.overheadRate.toFixed(1)}% of direct cost is above the ${CARRY_LIMITS.overheadRate}% the bid calculators accept, so it cannot be carried to them. That usually means the direct cost entered covers a fraction of the year the overhead covers all of.`,
    );
  }
  return out;
}

/**
 * What the numbers say, in the contractor's terms.
 *
 * These are observations about the figures entered, not advice about what to
 * charge. Each one names the input that drives it, because the value of this
 * tool is mostly in showing which single number is doing the damage.
 */
export function notes({ utilization, burdenRate, overheadRate, targetMargin }) {
  const out = [];
  if (utilization < 60) {
    out.push(
      `Only ${utilization.toFixed(0)}% of the hours you pay for are billable. Every hour of the other ${(100 - utilization).toFixed(0)}% is already inside the rate above — that is what a low billable share costs.`,
    );
  }
  if (burdenRate >= 60 && burdenRate <= CARRY_LIMITS.burdenRate) {
    out.push(
      `Your payroll burden works out at ${burdenRate.toFixed(0)}%, not the 20–30% usually quoted. The difference is the paid hours that are never billed; a rate that only covers taxes and insurance leaves them unrecovered on every job.`,
    );
  }
  if (overheadRate > 0 && overheadRate < 5) {
    out.push(
      `An overhead rate of ${overheadRate.toFixed(1)}% of direct cost is low. Check that the office and owner pay above includes the hours you spend estimating and running the business rather than on the tools.`,
    );
  }
  if (targetMargin === 0) {
    out.push('With a target margin of 0% the rate above is your break-even. Nothing in it is profit.');
  }
  return out;
}
