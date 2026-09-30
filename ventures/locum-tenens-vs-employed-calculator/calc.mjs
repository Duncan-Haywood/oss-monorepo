// Rough federal-only comparison of a locum tenens (1099) contract against an
// employed (W-2) offer, tax year 2026. Pure functions, no I/O. Not tax advice.
//
// Constants match roth-conversion-bracket-fill-calculator and
// self-employment-tax-calculator (Rev. Proc. 2025-32; SSA 2026 wage base).
// Unverified against the IRS text by this venture: check before relying.
//
// Not modelled: state and local tax, the 20% QBI deduction, itemised
// deductions, credits, phase-outs, catch-up contributions, spouse income,
// per-diem/tax-home rules, Additional Medicare tax on married-filing-
// separately, and any income other than this one job.

export const TAX_YEAR = 2026;
export const BRACKETS = {
  single: [[12400, 0.10], [50400, 0.12], [105700, 0.22], [201775, 0.24], [256225, 0.32], [640600, 0.35], [Infinity, 0.37]],
  mfj: [[24800, 0.10], [100800, 0.12], [211400, 0.22], [403550, 0.24], [512450, 0.32], [768700, 0.35], [Infinity, 0.37]],
  hoh: [[17700, 0.10], [67450, 0.12], [105700, 0.22], [201775, 0.24], [256200, 0.32], [640600, 0.35], [Infinity, 0.37]],
};
export const STANDARD_DEDUCTION = { single: 16100, mfj: 32200, hoh: 24150 };
export const SS_WAGE_BASE = 184500;
export const SE_FACTOR = 0.9235;
export const ADDL_MEDICARE_THRESHOLD = { single: 200000, mfj: 250000, hoh: 200000 };
export const DEFERRAL_LIMIT = 24500;
export const ANNUAL_ADDITIONS_LIMIT = 72000;
export const EMPLOYER_RATE_SOLO = 0.20; // approx. employer share of net SE earnings

export function num(v) {
  const s = String(v ?? "").replace(/[$,%\s,]/g, "");
  if (s === "") return NaN;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}
export const money = (v) => (v < 0 ? "-" : "") + "$" + Math.round(Math.abs(v)).toLocaleString("en-US");
const statusOf = (s) => (BRACKETS[s] ? s : "single");

export function incomeTax(taxable, status) {
  let tax = 0, lower = 0;
  for (const [upper, rate] of BRACKETS[statusOf(status)]) {
    if (taxable <= lower) break;
    tax += (Math.min(taxable, upper) - lower) * rate;
    lower = upper;
  }
  return tax;
}

export const FIELDS = [
  "rate", "hours", "weeks", "travelReimb", "travelCost", "malpractice", "expenses", "health", "retire",
  "salary", "w2Hours", "pto", "w2Health", "w2EmployerHealth", "w2Own401k", "w2Match", "w2Cme",
];
const REQUIRED = { rate: "Locum hourly rate", hours: "Guaranteed hours per week", weeks: "Weeks worked per year", salary: "W-2 salary", w2Hours: "W-2 hours per week", };
const DEFAULTS = { travelReimb: 0, travelCost: 0, malpractice: 0, expenses: 0, health: 0, retire: 0, pto: 0, w2Health: 0, w2EmployerHealth: 0, w2Own401k: 0, w2Match: 0, w2Cme: 0 };

// Federal-only take-home for the locum (1099) side.
export function locumYear(p, weeks = p.weeks, rate = p.rate) {
  const status = statusOf(p.status);
  const gross = rate * p.hours * weeks;
  const netTravel = (p.travelCost - p.travelReimb) * weeks; // out-of-pocket travel (negative = reimbursed above cost)
  const profit = gross - p.malpractice - p.expenses - netTravel;
  const seEarn = Math.max(0, profit) * SE_FACTOR;
  const ss = Math.min(seEarn, SS_WAGE_BASE) * 0.124;
  const medicare = seEarn * 0.029;
  const addl = Math.max(0, seEarn - ADDL_MEDICARE_THRESHOLD[status]) * 0.009;
  const seTax = ss + medicare + addl;
  const halfSe = (ss + medicare) / 2;
  const healthDed = Math.min(p.health, Math.max(0, profit - halfSe));
  const retireCap = Math.min(DEFERRAL_LIMIT + EMPLOYER_RATE_SOLO * Math.max(0, profit - halfSe), ANNUAL_ADDITIONS_LIMIT, Math.max(0, profit - halfSe - healthDed));
  const retire = Math.max(0, Math.min(p.retire, retireCap));
  const agi = profit - halfSe - healthDed - retire;
  const taxable = Math.max(0, agi - STANDARD_DEDUCTION[status]);
  const incTax = incomeTax(taxable, status);
  const takeHome = gross - p.malpractice - p.expenses - netTravel - p.health - retire - seTax - incTax;
  return {
    gross, netTravel, profit, seTax, incTax, retire, retireClamped: retire < p.retire - 0.5,
    healthCost: p.health, costs: p.malpractice + p.expenses + netTravel,
    tax: seTax + incTax, takeHome, total: takeHome + retire,
    hoursWorked: p.hours * weeks,
    effectiveHourly: p.hours * weeks > 0 ? (takeHome + retire) / (p.hours * weeks) : 0,
  };
}

// Federal-only take-home for the employed (W-2) side.
export function employedYear(p) {
  const status = statusOf(p.status);
  const salary = p.salary;
  const own = Math.max(0, Math.min(p.w2Own401k, DEFERRAL_LIMIT, salary));
  const ficaWages = Math.max(0, salary - p.w2Health);
  const fica = Math.min(ficaWages, SS_WAGE_BASE) * 0.062 + ficaWages * 0.0145 + Math.max(0, ficaWages - ADDL_MEDICARE_THRESHOLD[status]) * 0.009;
  const taxable = Math.max(0, salary - p.w2Health - own - STANDARD_DEDUCTION[status]);
  const incTax = incomeTax(taxable, status);
  const takeHome = salary - p.w2Health - own - fica - incTax;
  const match = Math.max(0, p.w2Match);
  const workedWeeks = Math.max(0, 52 - p.pto);
  const benefits = match + p.w2EmployerHealth + p.w2Cme;
  return {
    salary, fica, incTax, tax: fica + incTax, own, match, benefits,
    takeHome, retire: own + match,
    total: takeHome + own + match + p.w2EmployerHealth + p.w2Cme,
    hoursWorked: p.w2Hours * workedWeeks,
    effectiveHourly: p.w2Hours * workedWeeks > 0 ? (takeHome + own + match + p.w2EmployerHealth + p.w2Cme) / (p.w2Hours * workedWeeks) : 0,
  };
}

// Locum hourly rate at which total value (take-home + retirement saved) equals
// the employed offer's total value, at the given weeks worked. Bisection.
export function breakEvenRate(p, weeks = p.weeks, target = employedYear(p).total) {
  if (!(p.hours > 0) || !(weeks > 0)) return null;
  let lo = 0, hi = 5000;
  if (locumYear(p, weeks, hi).total < target) return null;
  if (locumYear(p, weeks, lo).total >= target) return 0;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (locumYear(p, weeks, mid).total < target) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

export const SENSITIVITY_WEEKS = [24, 28, 32, 36, 40, 44, 48, 52];

export function analyze(raw) {
  const p = { status: statusOf(raw.status) };
  for (const f of FIELDS) {
    const v = num(raw[f]);
    if (Number.isNaN(v)) {
      if (REQUIRED[f]) return { error: REQUIRED[f] + " is required and must be a number." };
      p[f] = DEFAULTS[f];
    } else {
      p[f] = v;
    }
    if (p[f] < 0) return { error: (REQUIRED[f] || f) + " cannot be negative." };
  }
  if (p.rate <= 0 || p.hours <= 0 || p.salary <= 0 || p.w2Hours <= 0) return { error: "Rate, hours and salary must be greater than zero." };
  if (p.weeks <= 0 || p.weeks > 52) return { error: "Weeks worked must be between 1 and 52." };
  if (p.pto > 52) return { error: "PTO weeks cannot exceed 52." };
  const locum = locumYear(p);
  const employed = employedYear(p);
  const be = breakEvenRate(p);
  const rows = SENSITIVITY_WEEKS.map((w) => {
    const l = locumYear(p, w);
    return { weeks: w, gap: 52 - w, takeHome: l.takeHome, total: l.total, delta: l.total - employed.total, breakEven: breakEvenRate(p, w) };
  });
  return {
    p, locum, employed, breakEven: be, rows,
    weeksGap: 52 - p.weeks,
    diffTakeHome: locum.takeHome - employed.takeHome,
    diffTotal: locum.total - employed.total,
    winner: locum.total >= employed.total ? "locum" : "employed",
    breakEvenWeeks: [...Array(52).keys()].map((i) => i + 1).find((w) => locumYear(p, w).total >= employed.total) ?? null,
  };
}

export function samplePlan() {
  return {
    status: "single", rate: "220", hours: "40", weeks: "40", travelReimb: "1200", travelCost: "1500", malpractice: "6000",
    expenses: "4000", health: "9000", retire: "40000", salary: "330000", w2Hours: "45", pto: "6",
    w2Health: "3600", w2EmployerHealth: "9600", w2Own401k: "24500", w2Match: "9900", w2Cme: "3000",
  };
}

export function reportCsv(r) {
  const lines = ["weeks_worked,unpaid_gap_weeks,locum_take_home,locum_total_value,total_value_vs_employed,break_even_hourly_rate"];
  for (const x of r.rows) lines.push([x.weeks, x.gap, x.takeHome.toFixed(2), x.total.toFixed(2), x.delta.toFixed(2), x.breakEven == null ? "" : x.breakEven.toFixed(2)].join(","));
  return lines.join("\n") + "\n";
}
export const fieldNames = () => ["status", ...FIELDS];
