// Illustrative estimate of a cash balance (defined-benefit) plan contribution
// stacked with a 401(k)/profit-sharing plan for an owner aged 40+. No network
// calls. NOT tax advice and NOT an actuarial valuation: a real cash balance
// contribution is set each year by an enrolled actuary from the plan document,
// the participant census and the plan's interest-crediting and funding rates.
//
// 2026 assumptions (stated, not derived; confirm against the IRS's annual
// cost-of-living notice before relying on any figure):
//   - Section 415(b) maximum annual defined benefit: $290,000.
//   - Section 415(c) defined-contribution annual additions: $72,000.
//   - 401(k) elective deferral: $24,500; catch-up $8,000 (age 50+), or
//     $11,250 at ages 60-63 in place of it.
//   - Section 401(a)(17) compensation limit: $360,000.
//   - Combined DB + DC deduction rule (Section 404(a)(7)): employer
//     profit-sharing is taken as 6% of compensation; elective deferrals sit
//     outside that cap.
//
// The contribution model is a deliberate simplification:
//   target lump sum at retirement = benefit limit x annuity factor
//   annual contribution = target / future value of a level annual payment
// where the benefit limit is the lesser of the 415(b) dollar limit and 100% of
// compensation (capped), scaled by min(years to retirement, 10) / 10 for the
// 10-year participation rule. Real plans differ, so the page shows a range.

export const LIMITS_2026 = {
  benefit415b: 290_000,
  additions415c: 72_000,
  deferral: 24_500,
  catchUp50: 8_000,
  catchUp60to63: 11_250,
  compensationLimit: 360_000,
  profitSharingRate: 0.06,
};

/** Rate scenarios for the range: [interest credit, annuity discount, payout years]. */
export const SCENARIOS = {
  conservative: { credit: 0.05, discount: 0.065, payoutYears: 20 },
  central: { credit: 0.04, discount: 0.055, payoutYears: 22 },
  generous: { credit: 0.03, discount: 0.045, payoutYears: 25 },
};

export const MIN_YEARS_TO_RETIRE = 5;

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function money(n) {
  const value = Math.round(Number(n) || 0);
  const text = `$${Math.abs(value).toLocaleString("en-US")}`;
  return value < 0 ? `-${text}` : text;
}

function annuityPV(rate, years) {
  return rate === 0 ? years : (1 - (1 + rate) ** -years) / rate;
}
function annuityFV(rate, years) {
  return rate === 0 ? years : ((1 + rate) ** years - 1) / rate;
}

export function catchUpFor(age) {
  const a = Math.floor(num(age));
  if (a >= 60 && a <= 63) return LIMITS_2026.catchUp60to63;
  if (a >= 50) return LIMITS_2026.catchUp50;
  return 0;
}

/** Annual benefit limit: lesser of the 415(b) dollar cap and 100% of (capped) pay. */
export function benefitLimit(compensation) {
  const pay = Math.min(Math.max(0, num(compensation)), LIMITS_2026.compensationLimit);
  return Math.min(LIMITS_2026.benefit415b, pay);
}

/**
 * Estimated maximum annual cash balance contribution for one participant, before
 * any cap by available business income. `scenario` is one of SCENARIOS' keys.
 */
export function maxCashBalanceContribution({ age, compensation, retireAge = 62, scenario = "central" }) {
  const s = SCENARIOS[scenario] ?? SCENARIOS.central;
  const a = Math.floor(num(age));
  const yearsToRetire = Math.max(MIN_YEARS_TO_RETIRE, Math.floor(num(retireAge)) - a);
  const participation = Math.min(yearsToRetire, 10) / 10;
  const limit = benefitLimit(compensation) * participation;
  const target = limit * annuityPV(s.discount, s.payoutYears);
  return Math.max(0, target / annuityFV(s.credit, yearsToRetire));
}

/** Elective deferral + catch-up + 6% profit sharing, capped by 415(c) and 401(a)(17). */
export function stackedDefinedContribution({ age, compensation }) {
  const pay = Math.min(Math.max(0, num(compensation)), LIMITS_2026.compensationLimit);
  const deferral = Math.min(LIMITS_2026.deferral + catchUpFor(age), pay);
  const profitSharing = pay * LIMITS_2026.profitSharingRate;
  const cap = LIMITS_2026.additions415c + catchUpFor(age);
  const total = Math.min(deferral + profitSharing, cap);
  return { deferral, profitSharing: total - deferral, total };
}

/**
 * Full estimate. `income` is business profit before retirement contributions
 * (the ceiling on what can be deducted); `compensation` is the owner's pay for
 * plan purposes (W-2 wages for an S-corp, net self-employment earnings for a
 * sole proprietor).
 */
export function cashBalanceEstimate(input) {
  const age = Math.floor(num(input.age));
  const compensation = Math.max(0, num(input.compensation));
  const income = Math.max(0, num(input.income ?? compensation));
  const retireAge = Math.floor(num(input.retireAge ?? 62)) || 62;
  const bracket = Math.min(Math.max(num(input.bracket ?? 0.32), 0), 0.6);
  const employees = Math.max(0, Math.floor(num(input.employees)));
  const employeePay = Math.max(0, num(input.employeePay));
  const employeeRate = Math.max(0, num(input.employeeRate ?? 0.03));
  const withdrawalRate = Math.min(Math.max(num(input.withdrawalRate ?? 0.24), 0), 0.6);
  const growth = num(input.growth ?? 0.04);
  const years = Math.min(Math.max(Math.floor(num(input.years ?? 10)), 1), 30);
  const findings = [];

  const range = {};
  for (const key of Object.keys(SCENARIOS)) {
    range[key] = maxCashBalanceContribution({ age, compensation, retireAge, scenario: key });
  }
  const stacked = stackedDefinedContribution({ age, compensation });
  const employeeCost = employees * employeePay * employeeRate;

  const capture = (cb) => {
    const owner = cb + stacked.total;
    const room = Math.max(0, income - employeeCost);
    const ownerDeductible = Math.min(owner, room);
    return { owner, ownerDeductible, taxSaved: (ownerDeductible + employeeCost) * bracket };
  };

  const central = capture(range.central);
  const capped = central.owner > Math.max(0, income - employeeCost);
  if (capped) {
    findings.push({
      severity: "high",
      title: "Contribution exceeds your business income",
      detail: "The estimated total is larger than the profit available to deduct it, so the deduction here is limited to that profit. Plans are usually sized below the maximum; ask the actuary for a lower target.",
    });
  }
  if (age < 40) {
    findings.push({
      severity: "medium",
      title: "Under 40, the plan rarely beats a 401(k) alone",
      detail: "Cash balance limits scale with age. The dollar advantage over a solo or safe-harbor 401(k) is small before your 40s.",
    });
  }
  if (employees > 0) {
    findings.push({
      severity: "medium",
      title: "Employee cost and testing",
      detail: `Employee contributions are modelled at ${(employeeRate * 100).toFixed(1)}% of their pay (${money(employeeCost)} a year). Actual requirements come from nondiscrimination testing (Section 401(a)(4)) and minimum coverage, and are often 5% to 8% of pay for a single-owner plan with staff; an actuary sets the real figure.`,
    });
  } else {
    findings.push({
      severity: "info",
      title: "No employees entered",
      detail: "With no employees the plan is simplest, but adding one later can bring in testing and contributions for them. A cash balance plan is a multi-year commitment; the sponsor is expected to keep funding it.",
    });
  }
  findings.push({
    severity: "info",
    title: "Estimate, not a quote",
    detail: "The actuary sets the actual contribution from your plan's interest crediting rate, funding assumptions, hire dates and census. Treat the range as a starting conversation, not a number to fund.",
  });

  // Multi-year projection, contributing at the central estimate for each age.
  const rows = [];
  let balance = 0;
  let cumContribution = 0;
  let cumTax = 0;
  for (let i = 0; i < years; i++) {
    const yrAge = age + i;
    const cb = maxCashBalanceContribution({ age: yrAge, compensation, retireAge: Math.max(retireAge, age + years), scenario: "central" });
    const ownerContribution = cb + stacked.total;
    const room = Math.max(0, income - employeeCost);
    const deductible = Math.min(ownerContribution, room);
    const taxSaved = (deductible + employeeCost) * bracket;
    balance = balance * (1 + growth) + ownerContribution;
    cumContribution += ownerContribution;
    cumTax += taxSaved;
    rows.push({ year: i + 1, age: yrAge, cashBalance: cb, definedContribution: stacked.total, contribution: ownerContribution, taxSaved, balance });
  }
  const totalEmployeeCost = employeeCost * years;
  const afterTaxAtRetirement = balance * (1 - withdrawalRate);

  return {
    age, compensation, income, retireAge, bracket, years,
    range, stacked, employeeCost, ownerTotal: central.owner,
    deduction: central.ownerDeductible + employeeCost,
    taxSaved: central.taxSaved,
    netCostOfEmployees: employeeCost * (1 - bracket),
    projection: { rows, endingBalance: balance, cumContribution, cumTaxSaved: cumTax, totalEmployeeCost, afterTaxAtRetirement },
    findings,
  };
}
