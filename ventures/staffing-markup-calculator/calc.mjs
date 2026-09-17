// What a staffing placement actually earns, once the employer burden the
// markup has to cover is counted.
//
// The trade this venture serves prices in **markup on the pay rate**: a
// recruiter quotes "we're at 45%" and bills pay x 1.45. That convention is the
// problem. The markup has to cover *both* the employer burden and the profit,
// and burden is the part that moves — a $1.10/$100 clerical comp code and a
// $12.40/$100 roofing code are the same 45% markup and a completely different
// business. Two more things move it that nobody carries in their head:
//
//   - **FUTA and SUTA are capped, not proportional.** They are charged on the
//     first $7,000 and the first (state) wage base of a worker's wages, so a
//     420-hour seasonal assignment pays almost the whole annual charge inside
//     those 420 hours. Per hour, that is several times what the same worker
//     costs on a 2,000-hour assignment. This is modelled by charging
//     `min(wages, wageBase)` rather than a flat percentage, so the effect
//     appears on its own without a separate "is this short?" input.
//   - **The agency funds payroll weekly and collects on net-45.** Money is out
//     the door for six weeks before it comes back. On a thin markup that carry
//     is a real share of the profit, and it is invisible in every
//     markup-times-pay-rate quote.
//
// Nothing here is a tax, insurance, or employment-law determination. Rates,
// wage bases and class codes are inputs, because they are the user's own and
// they change every year; the defaults are illustrative starting points and the
// page says so. Every function is pure and every number is the caller's.

/** Federal unemployment: 6.0% less the standard 5.4% state credit. */
export const DEFAULT_FUTA_PERCENT = 0.6;
/** FUTA's wage base has been $7,000 since 1983. Still an input. */
export const DEFAULT_FUTA_WAGE_BASE = 7000;

/**
 * Every input id the page collects, so the page and the tests agree on one
 * list rather than two that drift. Order is the order they appear on screen.
 */
export const ALL_INPUT_IDS = [
  'payRate',
  'markupPercent',
  'hoursPerWeek',
  'otHoursPerWeek',
  'weeksOnAssignment',
  'otPayMultiplier',
  'otBillMultiplier',
  'ficaPercent',
  'futaPercent',
  'futaWageBase',
  'sutaPercent',
  'sutaWageBase',
  'workersCompRate',
  'ptoPercent',
  'benefitsPerHour',
  'onboardingCost',
  'otherPerHour',
  'daysToGetPaid',
  'costOfCapitalPercent',
  'badDebtPercent',
  'targetMarginPercent',
];

const FIELDS = {
  payRate: { label: 'Pay rate', min: 0.01, max: 2000 },
  markupPercent: { label: 'Markup on pay rate', min: 0, max: 500 },
  hoursPerWeek: { label: 'Straight-time hours a week', min: 0, max: 168 },
  otHoursPerWeek: { label: 'Overtime hours a week', min: 0, max: 168 },
  weeksOnAssignment: { label: 'Weeks on assignment', min: 0.1, max: 260 },
  otPayMultiplier: { label: 'Overtime pay multiplier', min: 1, max: 3 },
  otBillMultiplier: { label: 'Overtime bill multiplier', min: 1, max: 3 },
  ficaPercent: { label: 'FICA', min: 0, max: 30 },
  futaPercent: { label: 'FUTA rate', min: 0, max: 20 },
  futaWageBase: { label: 'FUTA wage base', min: 0, max: 1000000 },
  sutaPercent: { label: 'State unemployment rate', min: 0, max: 30 },
  sutaWageBase: { label: 'State unemployment wage base', min: 0, max: 1000000 },
  workersCompRate: { label: "Workers' comp rate", min: 0, max: 100 },
  ptoPercent: { label: 'PTO and holiday accrual', min: 0, max: 50 },
  benefitsPerHour: { label: 'Health and other benefits', min: 0, max: 500 },
  onboardingCost: { label: 'One-time onboarding cost', min: 0, max: 100000 },
  otherPerHour: { label: 'Other cost an hour', min: 0, max: 500 },
  daysToGetPaid: { label: 'Days to get paid', min: 0, max: 365 },
  costOfCapitalPercent: { label: 'Cost of capital', min: 0, max: 100 },
  badDebtPercent: { label: 'Bad debt and unbilled', min: 0, max: 50 },
  targetMarginPercent: { label: 'Target gross margin', min: 0, max: 95 },
};

function readNumber(raw, field, errors) {
  const spec = FIELDS[field];
  const value = typeof raw === 'number' ? raw : Number.parseFloat(raw);
  if (!Number.isFinite(value)) {
    errors.push({ field, message: `${spec.label} needs a number.` });
    return null;
  }
  if (value < spec.min) {
    errors.push({ field, message: `${spec.label} cannot be below ${spec.min}.` });
    return null;
  }
  if (value > spec.max) {
    errors.push({ field, message: `${spec.label} cannot be above ${spec.max}.` });
    return null;
  }
  return value;
}

/**
 * The employer burden on one assignment, itemised.
 *
 * `compExcludesOtPremium` defaults true because most states rate workers' comp
 * on straight-time-equivalent payroll: the half-time premium on an overtime
 * hour is excluded, so an agency running heavy OT is over-reserving if it
 * multiplies the comp rate by gross wages. It is a flag rather than a constant
 * because a handful of states do not allow the exclusion.
 */
export function burdenBreakdown(input) {
  const {
    straightWages,
    otWages,
    otPremiumWages,
    totalHours,
    ficaPercent,
    futaPercent,
    futaWageBase,
    sutaPercent,
    sutaWageBase,
    workersCompRate,
    ptoPercent,
    benefitsPerHour,
    onboardingCost,
    otherPerHour,
    compExcludesOtPremium = true,
  } = input;

  const totalWages = straightWages + otWages;
  // Capped taxes are charged on the wages this assignment actually pays, up to
  // the base. That is what makes a short assignment expensive per hour: the
  // annual charge does not shrink with it.
  const cappedFuta = (futaPercent / 100) * Math.min(totalWages, futaWageBase);
  const cappedSuta = (sutaPercent / 100) * Math.min(totalWages, sutaWageBase);
  const compPayroll = compExcludesOtPremium ? totalWages - otPremiumWages : totalWages;

  const items = [
    { key: 'fica', label: 'FICA (Social Security + Medicare)', amount: (ficaPercent / 100) * totalWages },
    { key: 'futa', label: 'FUTA (federal unemployment)', amount: cappedFuta },
    { key: 'suta', label: 'SUTA (state unemployment)', amount: cappedSuta },
    { key: 'workersComp', label: "Workers' compensation", amount: (workersCompRate / 100) * compPayroll },
    { key: 'pto', label: 'PTO and holiday accrual', amount: (ptoPercent / 100) * totalWages },
    { key: 'benefits', label: 'Health and other benefits', amount: benefitsPerHour * totalHours },
    { key: 'onboarding', label: 'Onboarding, screening, background', amount: onboardingCost },
    { key: 'other', label: 'Payroll processing, ATS, admin', amount: otherPerHour * totalHours },
  ];

  const total = items.reduce((sum, item) => sum + item.amount, 0);
  return { items, total, compPayroll, totalWages };
}

/**
 * The markup that produces a given gross margin, given a fixed loaded cost.
 *
 * Revenue is linear in the markup and both bad debt and the cost of carry are
 * linear in what they scale, so this inverts in closed form rather than by
 * search. Returns null when no finite markup can reach the target — which
 * happens when bad debt plus the target margin claim the whole invoice.
 */
export function markupForMargin({
  loadedCost,
  billableHourEquivalents,
  payRate,
  badDebtFraction,
  carryFraction,
  marginFraction,
}) {
  const denominator = 1 - badDebtFraction - marginFraction;
  if (denominator <= 0) return null;
  if (payRate <= 0 || billableHourEquivalents <= 0) return null;
  const requiredRevenue = (loadedCost * (1 + carryFraction)) / denominator;
  const multiplier = requiredRevenue / (payRate * billableHourEquivalents);
  return (multiplier - 1) * 100;
}

/**
 * Price one staffing placement end to end.
 *
 * Returns `{ ok: false, errors }` with every field-level problem at once — a
 * form that reveals one error per submit is the reason people abandon these.
 */
export function calculatePlacement(raw = {}) {
  const errors = [];
  const value = {};
  for (const field of ALL_INPUT_IDS) {
    value[field] = readNumber(raw[field], field, errors);
  }

  if (errors.length === 0) {
    if (value.hoursPerWeek + value.otHoursPerWeek <= 0) {
      errors.push({ field: 'hoursPerWeek', message: 'An assignment needs at least some hours a week.' });
    }
    if (value.hoursPerWeek + value.otHoursPerWeek > 168) {
      errors.push({ field: 'otHoursPerWeek', message: 'Straight time plus overtime cannot exceed 168 hours a week.' });
    }
  }
  if (errors.length > 0) return { ok: false, errors };

  const compExcludesOtPremium = raw.compExcludesOtPremium !== false;

  const straightHours = value.hoursPerWeek * value.weeksOnAssignment;
  const otHours = value.otHoursPerWeek * value.weeksOnAssignment;
  const totalHours = straightHours + otHours;

  const straightWages = value.payRate * straightHours;
  const otWages = value.payRate * value.otPayMultiplier * otHours;
  // The premium is the part above straight time — the piece most states let an
  // agency strip out of its workers' comp payroll.
  const otPremiumWages = value.payRate * (value.otPayMultiplier - 1) * otHours;
  const totalWages = straightWages + otWages;

  const burden = burdenBreakdown({
    straightWages,
    otWages,
    otPremiumWages,
    totalHours,
    ficaPercent: value.ficaPercent,
    futaPercent: value.futaPercent,
    futaWageBase: value.futaWageBase,
    sutaPercent: value.sutaPercent,
    sutaWageBase: value.sutaWageBase,
    workersCompRate: value.workersCompRate,
    ptoPercent: value.ptoPercent,
    benefitsPerHour: value.benefitsPerHour,
    onboardingCost: value.onboardingCost,
    otherPerHour: value.otherPerHour,
    compExcludesOtPremium,
  });

  const loadedCost = totalWages + burden.total;
  const loadedCostPerHour = loadedCost / totalHours;
  const burdenPerHour = burden.total / totalHours;
  const burdenPercentOfWages = totalWages > 0 ? (burden.total / totalWages) * 100 : 0;

  const billRate = value.payRate * (1 + value.markupPercent / 100);
  const otBillRate = billRate * value.otBillMultiplier;
  const revenue = billRate * straightHours + otBillRate * otHours;

  const badDebtFraction = value.badDebtPercent / 100;
  // What is financed is the money already spent — payroll and burden — for the
  // days between funding it and collecting the invoice.
  const carryFraction = (value.costOfCapitalPercent / 100) * (value.daysToGetPaid / 365);
  const badDebt = badDebtFraction * revenue;
  const carryCost = carryFraction * loadedCost;

  const grossProfit = revenue - loadedCost - badDebt - carryCost;
  const grossMarginPercent = revenue > 0 ? (grossProfit / revenue) * 100 : 0;
  const grossProfitPerHour = grossProfit / totalHours;

  // One straight-time hour is one unit; an overtime hour bills the multiplier.
  // Expressing the assignment in these units is what lets the break-even and
  // target markups invert in closed form with overtime in the mix.
  const billableHourEquivalents = straightHours + otHours * value.otBillMultiplier;

  const shared = {
    loadedCost,
    billableHourEquivalents,
    payRate: value.payRate,
    badDebtFraction,
    carryFraction,
  };
  const breakEvenMarkupPercent = markupForMargin({ ...shared, marginFraction: 0 });
  const targetMarkupPercent = markupForMargin({
    ...shared,
    marginFraction: value.targetMarginPercent / 100,
  });

  // What the same markup looks like across the range recruiters actually quote.
  // Cheap to compute and it is the part that changes a conversation with a
  // client, because it prices the discount they are asking for.
  const ladder = [];
  const rungs = new Set([30, 35, 40, 45, 50, 55, 60, Math.round(value.markupPercent)]);
  for (const markup of [...rungs].sort((a, b) => a - b)) {
    if (markup < 0 || markup > 500) continue;
    const rungBill = value.payRate * (1 + markup / 100);
    const rungRevenue = rungBill * billableHourEquivalents;
    const rungProfit = rungRevenue * (1 - badDebtFraction) - loadedCost * (1 + carryFraction);
    ladder.push({
      markupPercent: markup,
      billRate: rungBill,
      grossMarginPercent: rungRevenue > 0 ? (rungProfit / rungRevenue) * 100 : 0,
      grossProfit: rungProfit,
      isEntered: Math.round(value.markupPercent) === markup,
    });
  }

  const notes = [];
  if (totalWages < value.futaWageBase || totalWages < value.sutaWageBase) {
    notes.push(
      'This assignment pays less than a full unemployment wage base, so it carries the whole ' +
        'FUTA and SUTA charge rather than a share of it. Per hour, a short assignment is a more ' +
        'expensive one — the annual charge does not shrink with it.',
    );
  }
  if (grossProfit < 0) {
    notes.push(
      'At this markup the placement loses money. The break-even markup below is what it takes ' +
        'to finish level, before any profit at all.',
    );
  }
  if (otHours > 0 && value.otBillMultiplier < value.otPayMultiplier) {
    notes.push(
      'Overtime is billed at a lower multiple than it is paid, so every overtime hour earns less ' +
        'margin than a straight-time hour and can earn none. Check the assignment agreement: ' +
        'billing OT at the OT pay multiple on the bill rate is the usual term.',
    );
  }
  if (carryCost > grossProfit && grossProfit > 0) {
    notes.push(
      'The cost of funding payroll for ' +
        `${value.daysToGetPaid} days is larger than what the placement earns. On these terms the ` +
        'client is being financed at the agency’s expense.',
    );
  }

  return {
    ok: true,
    errors: [],
    hours: { straightHours, otHours, totalHours },
    wages: { straightWages, otWages, otPremiumWages, totalWages },
    burden,
    burdenPerHour,
    burdenPercentOfWages,
    loadedCost,
    loadedCostPerHour,
    billRate,
    otBillRate,
    revenue,
    badDebt,
    carryCost,
    grossProfit,
    grossProfitPerHour,
    grossMarginPercent,
    breakEvenMarkupPercent,
    targetMarkupPercent,
    targetMarginPercent: value.targetMarginPercent,
    billableHourEquivalents,
    ladder,
    notes,
  };
}

/**
 * The markup-to-margin conversion **as the trade quotes it** — 45% markup, so
 * 45/145 = 31% margin.
 *
 * It is exported to be contradicted, not to be relied on. The identity
 * `m / (1 + m)` is only the gross margin when the number the markup is applied
 * to is the whole cost, and in staffing it is the *pay rate*: every dollar of
 * FICA, unemployment, comp and benefits sits outside it. So this is the margin
 * a placement would earn if the employer burden were zero, which is the belief
 * this calculator exists to price. `calculatePlacement` returns the real
 * `grossMarginPercent` beside it, and the gap between the two is the number
 * worth showing.
 */
export function markupToMargin(markupPercent) {
  const m = markupPercent / 100;
  if (1 + m === 0) return null;
  return (m / (1 + m)) * 100;
}

export function marginToMarkup(marginPercent) {
  const g = marginPercent / 100;
  if (g >= 1) return null;
  return (g / (1 - g)) * 100;
}
