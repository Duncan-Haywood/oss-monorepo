// Core arithmetic for the S-corp reasonable-compensation range estimator.
// No network calls: applies the IRS's own three cited approaches to a
// reasonable-compensation determination (see the IRS's "S Corporation
// Compensation and Medical Insurance Issues" guidance and the fact pattern
// underlying Watson v. Commissioner, 668 F.3d 1008) to numbers the user
// supplies, plus a reference occupational-wage table for the market and
// cost approaches. It never asserts a single "correct" salary -- see
// README "What this does not cover".
//
// The three approaches:
//   1. Cost approach -- what it would cost to hire separate employees to
//      perform each duty the owner-employee actually performs, summed.
//   2. Market approach -- what an outside, unrelated employer would pay
//      someone else to fill the owner's primary role.
//   3. Income approach (the "independent investor" test) -- net profit
//      before owner compensation, minus a fair rate of return on the
//      shareholder's invested capital; the residual is what is available
//      for compensation without leaving an outside investor shortchanged.
//
// This tool reports the low-to-high span across all three, never their
// average, and flags which approach is binding at each end.

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function nonNeg(v) {
  return Math.max(0, num(v));
}

export function money(n) {
  const value = Number(n) || 0;
  const format = (v) => `$${v.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  const text = format(Math.abs(value));
  return value < 0 && /[1-9]/.test(text) ? `-${text}` : text;
}

// Reference occupational wages: approximate national annual median wages
// for common S-corp owner-operator roles, rounded to the nearest $1,000.
// These are commonly-cited reference figures in the range published by
// the Bureau of Labor Statistics' Occupational Employment and Wage
// Statistics (OEWS) program (bls.gov/oes/) -- NOT a live BLS fetch, and
// not specific to any metro area or year. Check the current BLS OEWS
// figure for the closest SOC code and your own metro area before using a
// number from this table as your final "market approach" figure; this
// table exists to give a defensible starting point, not the last word.
export const OCCUPATION_WAGES = [
  { value: 'general-operations-manager', label: 'General & operations manager', wage: 101000 },
  { value: 'chief-executive', label: 'Chief executive / top executive', wage: 145000 },
  { value: 'financial-manager', label: 'Financial manager / controller', wage: 156000 },
  { value: 'marketing-manager', label: 'Marketing manager', wage: 160000 },
  { value: 'sales-manager', label: 'Sales manager', wage: 138000 },
  { value: 'management-consultant', label: 'Management analyst / consultant', wage: 102000 },
  { value: 'software-developer', label: 'Software developer', wage: 132000 },
  { value: 'web-developer', label: 'Web developer', wage: 92000 },
  { value: 'accountant-auditor', label: 'Accountant / auditor', wage: 91000 },
  { value: 'bookkeeping-clerk', label: 'Bookkeeping / accounting clerk', wage: 48000 },
  { value: 'construction-manager', label: 'Construction manager', wage: 105000 },
  { value: 'real-estate-broker', label: 'Real estate broker / agent', wage: 62000 },
  { value: 'property-manager', label: 'Property / real estate manager', wage: 62000 },
  { value: 'attorney', label: 'Attorney', wage: 145000 },
  { value: 'physician-general', label: 'Physician (general / family practice)', wage: 240000 },
  { value: 'dentist', label: 'Dentist', wage: 174000 },
  { value: 'registered-nurse', label: 'Registered nurse', wage: 94000 },
  { value: 'physical-therapist', label: 'Physical / occupational therapist', wage: 100000 },
  { value: 'chiropractor', label: 'Chiropractor', wage: 78000 },
  { value: 'insurance-sales-agent', label: 'Insurance sales agent', wage: 62000 },
  { value: 'restaurant-manager', label: 'Restaurant / food-service manager', wage: 63000 },
  { value: 'electrician', label: 'Electrician', wage: 63000 },
  { value: 'plumber', label: 'Plumber / pipefitter', wage: 65000 },
  { value: 'hvac-technician', label: 'HVAC technician', wage: 58000 },
  { value: 'graphic-designer', label: 'Graphic / web designer', wage: 62000 },
  { value: 'customer-service-rep', label: 'Customer service representative', wage: 40000 },
  { value: 'administrative-assistant', label: 'Administrative assistant / secretary', wage: 46000 },
  { value: 'retail-supervisor', label: 'First-line supervisor, retail sales', wage: 50000 },
];

export function wageFor(occupationValue) {
  const entry = OCCUPATION_WAGES.find((o) => o.value === occupationValue);
  return entry ? entry.wage : 0;
}

// Payroll-tax figures. SS wage base is the one figure that changes every
// year and is stated explicitly per year rather than derived, the same
// pattern qbi-deduction-calculator and no-tax-on-tips-overtime-calculator
// use for their own annually-indexed figures.
//   2025: $176,100 (SSA COLA announcement, 2025).
//   2026: $184,500 (SSA COLA announcement, October 2025 -- an $8,400 / 4.8%
//   increase driven by the national average wage index).
// Medicare (1.45% employee + 1.45% employer, uncapped) and the Additional
// Medicare Tax (0.9% employee-only, above $200,000 single/HoH/MFS or
// $250,000 joint -- NOT indexed for inflation since its 2013 enactment)
// are the same figures in both years.
export const SS_WAGE_BASE = { 2025: 176100, 2026: 184500 };
export const TAX_YEARS = Object.keys(SS_WAGE_BASE).map(Number).sort();
const ADDITIONAL_MEDICARE_THRESHOLD = { single: 200000, hoh: 200000, mfs: 125000, joint: 250000 };

export function ssWageBaseFor(taxYear) {
  return SS_WAGE_BASE[taxYear] ?? SS_WAGE_BASE[TAX_YEARS[TAX_YEARS.length - 1]];
}

/**
 * Combined (employee + employer) payroll tax on a W-2 wage: 12.4% Social
 * Security up to the wage base, 2.9% Medicare uncapped, plus the 0.9%
 * Additional Medicare Tax (employee-side only, so not doubled) on wages
 * above the filing-status threshold. A single-owner S-corp's "employer"
 * share is still, in substance, the owner's own money leaving the
 * business, which is why this reports the combined figure rather than
 * only the employee withholding.
 */
export function payrollTaxOnWage(wage, { taxYear = TAX_YEARS[TAX_YEARS.length - 1], filingStatus = 'single' } = {}) {
  const w = nonNeg(wage);
  const wageBase = ssWageBaseFor(taxYear);
  const ssTax = Math.min(w, wageBase) * 0.124;
  const medicareTax = w * 0.029;
  const threshold = ADDITIONAL_MEDICARE_THRESHOLD[filingStatus] ?? ADDITIONAL_MEDICARE_THRESHOLD.single;
  const additionalMedicareTax = Math.max(0, w - threshold) * 0.009;
  return { ssTax, medicareTax, additionalMedicareTax, total: ssTax + medicareTax + additionalMedicareTax };
}

/**
 * Cost approach: sum of each duty's reference wage, weighted by the % of
 * time the owner spends on it, scaled by hours worked relative to a
 * 40-hour full-time week. `duties` is an array of
 * { occupation, percentOfTime }.
 */
export function costApproach(duties, hoursPerWeek = 40) {
  const ratio = Math.max(0, nonNeg(hoursPerWeek) / 40);
  const list = Array.isArray(duties) ? duties : [];
  const percentTotal = list.reduce((sum, d) => sum + nonNeg(d.percentOfTime), 0);
  const total = list.reduce((sum, d) => sum + wageFor(d.occupation) * (nonNeg(d.percentOfTime) / 100), 0);
  return { amount: total * ratio, percentTotal };
}

/** Market approach: the primary role's reference wage, hours-scaled. */
export function marketApproach(primaryOccupation, hoursPerWeek = 40) {
  const ratio = Math.max(0, nonNeg(hoursPerWeek) / 40);
  return wageFor(primaryOccupation) * ratio;
}

/**
 * Income approach (independent-investor test): net profit before owner
 * compensation, minus a fair return on the shareholder's invested
 * capital. The residual is the ceiling this approach places on
 * compensation without leaving an outside investor shortchanged -- never
 * negative, since a business cannot owe compensation.
 */
export function incomeApproach(netProfitBeforeComp, capitalInvested, requiredReturnPercent = 10) {
  const requiredReturn = nonNeg(capitalInvested) * (Math.max(0, num(requiredReturnPercent)) / 100);
  return Math.max(0, nonNeg(netProfitBeforeComp) - requiredReturn);
}

/**
 * Full estimate: all three approaches, the low-to-high range across them,
 * which approach binds at each end, and the payroll-tax cost delta across
 * that range.
 */
export function estimateReasonableCompensation({
  duties = [],
  primaryOccupation = '',
  hoursPerWeek = 40,
  netProfitBeforeComp = 0,
  capitalInvested = 0,
  requiredReturnPercent = 10,
  taxYear = TAX_YEARS[TAX_YEARS.length - 1],
  filingStatus = 'single',
} = {}) {
  const findings = [];

  const cost = costApproach(duties, hoursPerWeek);
  const market = marketApproach(primaryOccupation, hoursPerWeek);
  const income = incomeApproach(netProfitBeforeComp, capitalInvested, requiredReturnPercent);

  if (cost.percentTotal > 0 && Math.round(cost.percentTotal) !== 100) {
    findings.push({
      severity: cost.percentTotal > 100 ? 'high' : 'medium',
      title: `Duties total ${Math.round(cost.percentTotal)}% of time, not 100%`,
      detail: cost.percentTotal > 100
        ? 'The cost approach double-counts time when duty percentages add to more than 100% -- reduce one or more rows.'
        : `The cost approach undercounts unaccounted-for time when duty percentages add to less than 100% -- add a row for the remaining ${Math.round(100 - cost.percentTotal)}%, or the figure below understates it.`,
    });
  }

  // The cost and market approaches set an initial low-high span; the
  // income approach can only ever pull that span DOWN (never up), since
  // it represents what the business can afford to pay without shorting
  // an outside investor's fair return -- it is a ceiling, not a target.
  let low = Math.min(cost.amount, market);
  let high = Math.max(cost.amount, market);
  let lowApproach = cost.amount <= market ? 'cost' : 'market';
  let highApproach = cost.amount >= market ? 'cost' : 'market';

  const incomeBinding = income < high;
  if (incomeBinding) {
    const flooredIncome = Math.max(0, income);
    high = flooredIncome;
    highApproach = 'income';
    if (income < low) {
      low = flooredIncome;
      lowApproach = 'income';
    }
    findings.push({
      severity: 'medium',
      title: 'The income approach lowers the defensible range',
      detail: `Paying the cost/market-approach figure (up to ${money(Math.max(cost.amount, market))}) would leave less than a ${requiredReturnPercent}% return on the ${money(capitalInvested)} of invested capital entered above. The independent-investor test caps a defensible salary at ${money(flooredIncome)}, with the remainder as distribution.`,
    });
  } else if (high > 0) {
    findings.push({
      severity: 'info',
      title: 'The income approach does not constrain this range',
      detail: `Net profit before compensation comfortably covers a ${requiredReturnPercent}% return on invested capital even at the top of the cost/market range, so the independent-investor test is not the limiting factor here.`,
    });
  }

  const lowTax = payrollTaxOnWage(low, { taxYear, filingStatus });
  const highTax = payrollTaxOnWage(high, { taxYear, filingStatus });

  return {
    cost: cost.amount,
    costPercentTotal: cost.percentTotal,
    market,
    income,
    low,
    high,
    lowApproach,
    highApproach,
    payrollTaxAtLow: lowTax.total,
    payrollTaxAtHigh: highTax.total,
    payrollTaxDelta: highTax.total - lowTax.total,
    findings,
  };
}
