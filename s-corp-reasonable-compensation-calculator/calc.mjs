// S-corp reasonable-compensation salary/distribution estimator.
//
// A single-shareholder S-corp that also performs services for the business
// must pay itself "reasonable compensation" as W-2 wages before taking any
// profit out as a distribution (IRC 1366, Rev. Rul. 74-44; the leading
// litigated case is Watson v. Commissioner, 668 F.3d 1008 (8th Cir. 2012),
// where a $24,000 salary against ~$200k-274k of annual profit was
// recharacterized to $91,044). Paying too little salary and too much
// distribution understates employment tax; paying more salary than the
// business earned is its own problem. There is no IRS-published safe-harbor
// percentage -- the "60/40 rule" and similar percentage rules of thumb
// circulating online are not an IRS rule and are not applied here. The test
// courts and the IRS actually use is comparable-wage: what would an
// unrelated employer pay someone else to do this specific job, for these
// specific hours. This module takes that comparable-wage figure as an input
// the filer supplies (from BLS OEWS, a trade salary survey, or their own
// judgment) rather than asserting one, because asserting a specific dollar
// figure for "what your job is worth" without a live wage-data source would
// be exactly the kind of unverified claim PRODUCT_PLAYBOOK.md 5b warns
// against.
//
// FICA figures: 2026 Social Security wage base of $184,500, confirmed by the
// Social Security Administration's October 2025 announcement (reported by
// Thomson Reuters Tax & Accounting, the AICPA's The Tax Adviser, and Paycor's
// 2026 payroll guide, all consistent). Combined OASDI is 12.4% (6.2%
// employee + 6.2% employer) below that wage base; combined Medicare is 2.9%
// (1.45% + 1.45%) with no wage cap; the employee-only Additional Medicare Tax
// of 0.9% (IRC 3101(b)(2), a fixed statutory threshold, not inflation-
// indexed) applies above $200,000 (single/head of household), $250,000
// (married filing jointly), or $125,000 (married filing separately). As the
// sole owner-employee, the "employer" and "employee" shares of FICA both
// come from the same pocket, so this reports the combined 15.3%/2.9% figures
// as the total employment-tax cost of a dollar of salary, which is the
// number that matters for the salary-vs-distribution tradeoff.

export const SS_WAGE_BASE_2026 = 184500;
export const OASDI_COMBINED_RATE = 0.124;
export const MEDICARE_COMBINED_RATE = 0.029;
export const ADDITIONAL_MEDICARE_EMPLOYEE_RATE = 0.009;

export const ADDITIONAL_MEDICARE_THRESHOLDS = {
  single: 200000,
  hoh: 200000,
  mfj: 250000,
  mfs: 125000,
};

export const FILING_STATUS_OPTIONS = [
  { value: 'single', label: 'Single' },
  { value: 'hoh', label: 'Head of household' },
  { value: 'mfj', label: 'Married filing jointly' },
  { value: 'mfs', label: 'Married filing separately' },
];

/**
 * Total combined (employer + employee) FICA cost of a given W-2 salary,
 * assuming this S-corp salary is the filer's only wage income for the year
 * -- the common case for a single-shareholder operator, and stated as an
 * explicit limit on every page, since a filer with other W-2 wages has
 * already used up part of the Social Security wage base elsewhere.
 */
export function ficaCost(salary, filingStatus = 'single') {
  const s = Number.isFinite(salary) && salary > 0 ? salary : 0;
  const oasdi = OASDI_COMBINED_RATE * Math.min(s, SS_WAGE_BASE_2026);
  const medicare = MEDICARE_COMBINED_RATE * s;
  const threshold = ADDITIONAL_MEDICARE_THRESHOLDS[filingStatus] ?? ADDITIONAL_MEDICARE_THRESHOLDS.single;
  const additionalMedicare = ADDITIONAL_MEDICARE_EMPLOYEE_RATE * Math.max(0, s - threshold);
  return {
    oasdi,
    medicare,
    additionalMedicare,
    total: oasdi + medicare + additionalMedicare,
  };
}

/**
 * The comparable-wage floor: a full-time market-rate figure the filer
 * supplies, scaled to the hours actually worked. Capped at 2x full-time
 * (80 hours/week) so a typo does not silently produce an absurd floor;
 * returns null when no market wage was entered, since there is then no
 * floor to compare against.
 */
export function marketRateFloor({ marketWageFullTime, hoursPerWeek }) {
  const wage = Number(marketWageFullTime);
  if (!Number.isFinite(wage) || wage <= 0) return null;
  const hours = Number(hoursPerWeek);
  const fte = Number.isFinite(hours) && hours > 0 ? Math.min(hours / 40, 2) : 1;
  return wage * fte;
}

/**
 * Nine factors courts weigh (drawn from Rev. Rul. 74-44's progeny and the
 * factor list applied in Watson and later cases like Sean McAlary Ltd. and
 * Glass Blocks Unlimited). Static reference content, not scored or summed
 * into the number above -- summing a legal multi-factor test into a single
 * digit overstates the rigor of a free calculator. Rendered as a
 * documentation checklist the filer fills in and keeps for their own
 * records, matching this portfolio's "evidence, not advice-of-record"
 * positioning: the filer's own preparer weighs the factors, this tool
 * prompts what to record.
 */
export const NINE_FACTORS = [
  { id: 'training', title: 'Training and experience', prompt: 'What licenses, certifications, or years of experience does the shareholder-employee bring to this specific role?' },
  { id: 'duties', title: 'Duties and responsibilities', prompt: 'What does the shareholder-employee actually do day to day -- and is any of it work a non-owner employee could do instead?' },
  { id: 'time', title: 'Time and effort devoted to the business', prompt: 'Roughly how many hours per week, and is that full-time, part-time, or seasonal?' },
  { id: 'dividend-history', title: 'Dividend history', prompt: 'Has the corporation paid distributions in prior years, and how do they compare in size to wages paid?' },
  { id: 'other-employee-pay', title: 'Payments to non-owner employees', prompt: 'What does the business pay other employees doing comparable or supporting work?' },
  { id: 'bonus-timing', title: 'Timing and manner of bonus payments', prompt: 'Are any bonuses paid on a schedule tied to profit (a red flag that a "bonus" is really a disguised distribution), or on a documented, consistent basis?' },
  { id: 'comparable-comp', title: 'What comparable businesses pay for similar services', prompt: 'What would an unrelated employer pay someone else to do this job, for these hours, in this location and industry? (BLS OEWS, a trade salary survey, or a recruiter’s estimate.)' },
  { id: 'formula', title: 'The formula used to determine compensation, if any', prompt: 'Is compensation set by a written formula or agreement, or decided informally each year?' },
  { id: 'agreements', title: 'Compensation agreements', prompt: 'Is there a written employment or compensation agreement, and does actual pay match it?' },
];

/**
 * The full assessment for one scenario: compares a planned salary against
 * the comparable-wage floor and the corporation's own compensation pool
 * (net income before shareholder wages), and reports the FICA cost at the
 * planned figure plus, when a floor exists, at that floor -- so the filer
 * can see what closing the gap would actually cost in employment tax before
 * deciding whether to.
 */
export function assess(input) {
  const poolProvided = input.compensationPool !== '' && input.compensationPool != null;
  const pool = Number(input.compensationPool);
  const poolUsable = poolProvided && Number.isFinite(pool) && pool >= 0;
  const plannedProvided = input.plannedSalary !== '' && input.plannedSalary != null;
  const planned = Number(input.plannedSalary);
  const plannedUsable = plannedProvided && Number.isFinite(planned) && planned >= 0;
  const filingStatus = FILING_STATUS_OPTIONS.some((o) => o.value === input.filingStatus) ? input.filingStatus : 'single';

  if (!plannedUsable) {
    return { ok: false, reason: 'Enter a planned or current salary of zero or more.' };
  }

  const floor = marketRateFloor(input);
  const distribution = poolUsable ? Math.max(0, pool - planned) : null;
  const plannedFica = ficaCost(planned, filingStatus);
  const floorFica = floor != null ? ficaCost(floor, filingStatus) : null;
  const exceedsPool = poolUsable && floor != null && floor > pool;

  let flag;
  let flagLevel;
  if (floor == null) {
    flag = 'Enter a comparable full-time wage for your role to compare your planned salary against the market-rate test courts weigh most heavily.';
    flagLevel = 'info';
  } else if (planned >= floor) {
    flag = 'Your planned salary is at or above your own stated comparable-wage figure — the strongest position on the factor courts weigh most heavily.';
    flagLevel = 'ok';
  } else if (distribution && distribution > 0) {
    flag = 'Your planned salary is below your own stated comparable-wage figure while the business is also paying a distribution — this is the fact pattern in every reported reasonable-compensation adjustment case (Watson, Sean McAlary Ltd., Glass Blocks Unlimited). Consider raising salary toward the comparable-wage figure, or documenting in your own records why it doesn’t apply to your exact role and hours.';
    flagLevel = 'warn';
  } else {
    flag = 'Your planned salary is below your own stated comparable-wage figure, but you are not taking a distribution either — there is no under-taxed amount being pulled out this year, though a reasonable salary is still technically required by statute once the corporation has profit.';
    flagLevel = 'caution';
  }

  const poolNote = exceedsPool
    ? `Your comparable-wage figure ($${Math.round(floor).toLocaleString('en-US')}) is more than the compensation pool you entered ($${Math.round(pool).toLocaleString('en-US')}) — a corporation generally isn’t expected to pay a salary larger than what it earned. Rev. Rul. 74-44 targets disguised distributions from profit that exists, not a shortfall in a lean year; talk to your preparer about options rather than reading this as a hard floor.`
    : null;

  return {
    ok: true,
    filingStatus,
    planned,
    floor,
    distribution,
    exceedsPool,
    poolNote,
    flag,
    flagLevel,
    plannedFica,
    floorFica,
    extraFicaToReachFloor: floorFica ? Math.max(0, floorFica.total - plannedFica.total) : null,
    ficaAtZeroSalary: ficaCost(0, filingStatus).total,
  };
}

export function loadState(value) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}
