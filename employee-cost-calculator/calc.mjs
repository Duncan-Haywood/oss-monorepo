/**
 * What a role actually costs a small business, fully loaded, as a W-2
 * employee versus a 1099 independent contractor — and the contractor hourly
 * rate at which the two are the same.
 *
 * Every free "cost of an employee" calculator on the web stops at wages plus
 * a flat "burden %" guess. Two things that guess hides, and this tool makes
 * explicit as separate inputs instead:
 *
 *   - **FUTA and SUTA are capped, not proportional to wages.** They are
 *     charged on the first $7,000 (federal) and the first state wage base of
 *     a worker's *annual* wages, so a full-time role clears both caps early
 *     in the year and the "burden %" for the rest of it is lower than the
 *     number on a rate sheet suggests. Modelled with `min(wages, wageBase)`,
 *     the same way `ventures/staffing-markup-calculator/calc.mjs` prices a
 *     staffing placement's burden.
 *   - **Onboarding is a year-one cost, not an ongoing one.** A tool that folds
 *     recruiting and setup into a flat annual rate overstates every year
 *     after the first. This reports both an ongoing annual figure and a
 *     year-one figure so the two questions — "what does this cost every
 *     year" and "what does it cost to start" — get different answers.
 *
 * **What this does not do, and why that boundary is load-bearing.** It never
 * decides, suggests, or scores whether a specific worker should legally be
 * classified as a W-2 employee or a 1099 independent contractor. That is the
 * IRS common-law test (behavioral control, financial control, relationship
 * type) and, in many states, a separate and stricter ABC test — a
 * determination with real back-tax, penalty, and in some states criminal
 * exposure for getting wrong, and exactly the kind of professional
 * determination this portfolio does not make on a user's behalf (see
 * `PRODUCT_PLAYBOOK.md` §5b). This tool assumes the classification question is
 * already settled, or is being modelled hypothetically for both arrangements,
 * and answers a narrower and purely arithmetic question: once a business pays
 * for a role either way, which one costs more, and by how much. Every rate
 * (FICA, FUTA, SUTA, workers' comp) is a user-supplied input rather than a
 * silent constant, because they are the user's own and they change by state,
 * class code, and year.
 */

/** Every id the form owns, in read order. */
export const ALL_INPUT_IDS = Object.freeze([
  'employeeHourlyWage',
  'employeeHoursPerWeek',
  'employeeWeeksPerYear',
  'ficaPercent',
  'futaPercent',
  'futaWageBase',
  'sutaPercent',
  'sutaWageBase',
  'workersCompRate',
  'ptoHolidayPercent',
  'retirementMatchPercent',
  'healthInsuranceMonthly',
  'payrollAdminAnnual',
  'onboardingOneTimeCost',
  'contractorHourlyRate',
  'contractorHoursPerYear',
  'contractorAdminAnnual',
  'contractorOneTimeCost',
]);

/** Fields a calculation cannot proceed without — every one of them, here. */
export const REQUIRED_INPUT_IDS = ALL_INPUT_IDS;

const FIELDS = {
  employeeHourlyWage: { label: 'Employee hourly wage', min: 0.01, max: 1000 },
  employeeHoursPerWeek: { label: 'Employee hours per week', min: 1, max: 80 },
  employeeWeeksPerYear: { label: 'Paid weeks per year', min: 1, max: 52 },
  ficaPercent: { label: 'Employer FICA (Social Security + Medicare)', min: 0, max: 20 },
  futaPercent: { label: 'FUTA rate', min: 0, max: 10 },
  futaWageBase: { label: 'FUTA wage base', min: 0, max: 50000 },
  sutaPercent: { label: 'State unemployment (SUTA) rate', min: 0, max: 15 },
  sutaWageBase: { label: 'State unemployment wage base', min: 0, max: 200000 },
  workersCompRate: { label: "Workers' comp rate (% of payroll)", min: 0, max: 50 },
  ptoHolidayPercent: { label: 'PTO and holiday accrual', min: 0, max: 30 },
  retirementMatchPercent: { label: 'Retirement match', min: 0, max: 25 },
  healthInsuranceMonthly: { label: 'Health insurance, per month', min: 0, max: 5000 },
  payrollAdminAnnual: { label: 'Payroll processing and HR admin, per year', min: 0, max: 20000 },
  onboardingOneTimeCost: { label: 'One-time recruiting and onboarding cost', min: 0, max: 50000 },
  contractorHourlyRate: { label: 'Contractor hourly rate', min: 0.01, max: 2000 },
  contractorHoursPerYear: { label: 'Contractor hours per year', min: 1, max: 6240 },
  contractorAdminAnnual: { label: '1099 filing and admin, per year', min: 0, max: 5000 },
  contractorOneTimeCost: { label: 'One-time contractor vetting/setup cost', min: 0, max: 50000 },
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
 * The employer burden on top of an employee's wages, itemised — the same
 * "capped taxes charged on wages actually paid, up to the base" shape as
 * `staffing-markup-calculator`'s `burdenBreakdown`, applied to a direct hire
 * rather than a billed placement.
 */
export function employerBurden(input) {
  const {
    annualWages,
    ficaPercent,
    futaPercent,
    futaWageBase,
    sutaPercent,
    sutaWageBase,
    workersCompRate,
    ptoHolidayPercent,
    retirementMatchPercent,
    healthInsuranceMonthly,
    payrollAdminAnnual,
  } = input;

  const cappedFuta = (futaPercent / 100) * Math.min(annualWages, futaWageBase);
  const cappedSuta = (sutaPercent / 100) * Math.min(annualWages, sutaWageBase);

  const items = [
    { key: 'fica', label: 'Employer FICA', amount: (ficaPercent / 100) * annualWages },
    { key: 'futa', label: 'FUTA (federal unemployment)', amount: cappedFuta },
    { key: 'suta', label: 'SUTA (state unemployment)', amount: cappedSuta },
    { key: 'workersComp', label: "Workers' compensation", amount: (workersCompRate / 100) * annualWages },
    { key: 'pto', label: 'PTO and holiday accrual', amount: (ptoHolidayPercent / 100) * annualWages },
    { key: 'retirement', label: 'Retirement match', amount: (retirementMatchPercent / 100) * annualWages },
    { key: 'health', label: 'Health insurance', amount: healthInsuranceMonthly * 12 },
    { key: 'payrollAdmin', label: 'Payroll processing and HR admin', amount: payrollAdminAnnual },
  ];

  const total = items.reduce((sum, item) => sum + item.amount, 0);
  return { items, total };
}

/**
 * Compare the fully-loaded cost of a W-2 employee against a 1099
 * contractor for the same role, plus the contractor rate at which the two
 * are equal.
 *
 * Returns `{ ok: false, errors }` with every field-level problem at once.
 */
export function compareCosts(raw = {}) {
  const errors = [];
  const value = {};
  for (const field of ALL_INPUT_IDS) {
    value[field] = readNumber(raw[field], field, errors);
  }
  if (errors.length > 0) return { ok: false, errors };

  const hoursWorkedPerYear = value.employeeHoursPerWeek * value.employeeWeeksPerYear;
  const annualWages = value.employeeHourlyWage * hoursWorkedPerYear;

  const burden = employerBurden({
    annualWages,
    ficaPercent: value.ficaPercent,
    futaPercent: value.futaPercent,
    futaWageBase: value.futaWageBase,
    sutaPercent: value.sutaPercent,
    sutaWageBase: value.sutaWageBase,
    workersCompRate: value.workersCompRate,
    ptoHolidayPercent: value.ptoHolidayPercent,
    retirementMatchPercent: value.retirementMatchPercent,
    healthInsuranceMonthly: value.healthInsuranceMonthly,
    payrollAdminAnnual: value.payrollAdminAnnual,
  });

  const employeeOngoingAnnualCost = annualWages + burden.total;
  const employeeYear1Cost = employeeOngoingAnnualCost + value.onboardingOneTimeCost;
  const employeeOngoingHourlyCost = employeeOngoingAnnualCost / hoursWorkedPerYear;
  const employeeYear1HourlyCost = employeeYear1Cost / hoursWorkedPerYear;
  const burdenPercentOfWages = annualWages > 0 ? (burden.total / annualWages) * 100 : 0;

  const contractorOngoingAnnualCost =
    value.contractorHourlyRate * value.contractorHoursPerYear + value.contractorAdminAnnual;
  const contractorYear1Cost = contractorOngoingAnnualCost + value.contractorOneTimeCost;
  const contractorHourlyCost = contractorOngoingAnnualCost / value.contractorHoursPerYear;

  const gapOngoingAnnual = employeeOngoingAnnualCost - contractorOngoingAnnualCost;
  const gapYear1Annual = employeeYear1Cost - contractorYear1Cost;

  // The contractor hourly rate, at the contractor's own annual hours, that
  // would cost the business exactly the employee's ongoing annual cost.
  // Independent of the rate the user actually entered — it answers "at what
  // rate does hiring stop being cheaper (or start being cheaper)?" rather
  // than restating the gap at the entered rate.
  const breakEvenContractorRate =
    value.contractorHoursPerYear > 0
      ? (employeeOngoingAnnualCost - value.contractorAdminAnnual) / value.contractorHoursPerYear
      : null;

  const hoursDeltaPercent =
    hoursWorkedPerYear > 0
      ? (Math.abs(value.contractorHoursPerYear - hoursWorkedPerYear) / hoursWorkedPerYear) * 100
      : 0;

  const notes = [];
  if (annualWages > 0 && (value.employeeHourlyWage * hoursWorkedPerYear < value.futaWageBase || annualWages < value.sutaWageBase)) {
    notes.push(
      "This role's annual wages fall under the FUTA and/or SUTA wage base, so those taxes apply to " +
        'the full amount rather than being capped partway through the year — the burden percentage ' +
        'shown here would be lower for a higher-paid role at the same hours.',
    );
  }
  if (hoursDeltaPercent > 15) {
    notes.push(
      'The employee and contractor hours entered differ by more than 15%, so the two annual totals ' +
        'are not an apples-to-apples comparison — compare the per-hour figures instead, or set the ' +
        'contractor hours to match.',
    );
  }
  if (value.onboardingOneTimeCost > 0 || value.contractorOneTimeCost > 0) {
    notes.push(
      'Onboarding and vetting costs are one-time. The "ongoing" figures are what the role costs every ' +
        'year after the first; the "year one" figures add the one-time setup cost each side entered.',
    );
  }
  notes.push(
    'This is a cost comparison only. It does not determine, and is not evidence toward, whether a ' +
      'specific worker should legally be a W-2 employee or a 1099 independent contractor — that is ' +
      "the IRS common-law test and, in many states, a separate ABC test, and it stays the business's " +
      'own determination, made with its own counsel or accountant, regardless of which arrangement ' +
      'this calculator finds cheaper.',
  );

  return {
    ok: true,
    errors: [],
    hoursWorkedPerYear,
    annualWages,
    burden,
    burdenPercentOfWages,
    employeeOngoingAnnualCost,
    employeeYear1Cost,
    employeeOngoingHourlyCost,
    employeeYear1HourlyCost,
    contractorOngoingAnnualCost,
    contractorYear1Cost,
    contractorHourlyCost,
    contractorHoursPerYear: value.contractorHoursPerYear,
    gapOngoingAnnual,
    gapYear1Annual,
    breakEvenContractorRate,
    cheaperOngoing: gapOngoingAnnual < 0 ? 'employee' : gapOngoingAnnual > 0 ? 'contractor' : 'tie',
    notes,
  };
}
