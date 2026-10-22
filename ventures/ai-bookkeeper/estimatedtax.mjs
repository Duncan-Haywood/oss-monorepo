// Federal income-tax estimate and quarterly payment plan (Form 1040-ES style) for a
// sole proprietor: the year's Schedule C profit annualised, self-employment tax from
// taxforms.mjs, the half-SE deduction, the standard deduction, a simplified 20%
// qualified business income deduction, then the bracket tax. The payment plan uses
// the IRS safe harbour: the smaller of 90% of this year's tax and 100% of last year's
// (110% when last year's AGI was over $150,000), less withholding and what is already
// paid, spread over the due dates still ahead. A worksheet, not a filing.
//
// The bracket tables below are typed from memory of IRS Rev. Proc. 2024-40 (2025) and
// 2025-32 (2026) and are unchecked against irs.gov, so every result carries a warning;
// pass `brackets` and `standardDeduction` to override. Dollar amounts are cents.
import { scheduleC, selfEmployment, estimatedDueDates } from "./taxforms.mjs";

const D = (n) => n * 100;
// [upper bound of the bracket, rate]; the last bound is Infinity.
export const BRACKETS = {
  2025: {
    single: { std: D(15750), b: [[D(11925), 0.10], [D(48475), 0.12], [D(103350), 0.22], [D(197300), 0.24], [D(250525), 0.32], [D(626350), 0.35], [Infinity, 0.37]] },
    mfj: { std: D(31500), b: [[D(23850), 0.10], [D(96950), 0.12], [D(206700), 0.22], [D(394600), 0.24], [D(501050), 0.32], [D(751600), 0.35], [Infinity, 0.37]] },
    hoh: { std: D(23625), b: [[D(17000), 0.10], [D(64850), 0.12], [D(103350), 0.22], [D(197300), 0.24], [D(250500), 0.32], [D(626350), 0.35], [Infinity, 0.37]] },
  },
  2026: {
    single: { std: D(16100), b: [[D(12400), 0.10], [D(50400), 0.12], [D(105700), 0.22], [D(201775), 0.24], [D(256225), 0.32], [D(640600), 0.35], [Infinity, 0.37]] },
    mfj: { std: D(32200), b: [[D(24800), 0.10], [D(100800), 0.12], [D(211400), 0.22], [D(403550), 0.24], [D(512450), 0.32], [D(768700), 0.35], [Infinity, 0.37]] },
    hoh: { std: D(24150), b: [[D(17700), 0.10], [D(67450), 0.12], [D(105700), 0.22], [D(201750), 0.24], [D(256200), 0.32], [D(640600), 0.35], [Infinity, 0.37]] },
  },
};
// Taxable income above which the QBI deduction is limited by wages/property or
// phased out for service businesses; this module does not model that, so it warns.
const QBI_LIMIT = { single: D(197300), hoh: D(197300), mfj: D(394600) };

export function bracketTax(taxable, brackets) {
  let tax = 0, lo = 0;
  for (const [hi, rate] of brackets) {
    if (taxable <= lo) break;
    tax += (Math.min(taxable, hi) - lo) * rate;
    lo = hi;
  }
  return Math.round(tax);
}

const toCents = (v) => Math.round(+v * 100);

// opts: year, monthsElapsed, filing (single|mfj|hoh), otherIncome, wages (W-2 wages,
// cents), withholding (cents), priorYearTax and priorAgi (cents, from last year's
// 1040), paid (cents of estimates already sent), asOf (YYYY-MM-DD), qbi (false to
// skip the 20% deduction), brackets, standardDeduction, wageBase.
export function estimatedTax(books, o = {}) {
  const year = o.year ?? new Date().getFullYear();
  const filing = o.filing ?? "single";
  const warnings = [];
  const months = Math.min(12, Math.max(1, o.monthsElapsed ?? 12));
  const sc = scheduleC(books, { from: `${year}-01-01`, to: `${year}-12-31` });
  const profit = Math.round((sc.netProfit * 12) / months);
  const wages = o.wages ?? 0, other = o.otherIncome ?? 0, withholding = o.withholding ?? 0, paid = o.paid ?? 0;
  const se = selfEmployment(profit, { year, wages, wageBase: o.wageBase });
  const table = o.brackets ? { std: o.standardDeduction ?? 0, b: o.brackets } : BRACKETS[year]?.[filing];
  if (!table) throw new Error(`No ${filing} brackets on file for ${year}; pass brackets (and standardDeduction).`);
  if (!o.brackets) warnings.push(`The ${year} brackets and standard deduction are from memory and unchecked; confirm them on irs.gov or pass brackets.`);
  const std = o.standardDeduction ?? table.std;
  const agi = profit - se.deduction + wages + other;
  const beforeQbi = Math.max(0, agi - std);
  const qbiDeduction = o.qbi === false || profit <= 0 ? 0 : Math.min(Math.round(0.2 * Math.max(0, profit - se.deduction)), Math.round(0.2 * beforeQbi));
  if (qbiDeduction && beforeQbi > (QBI_LIMIT[filing] ?? Infinity)) warnings.push("Taxable income is above the QBI threshold, where the 20% deduction may be limited or lost; treat the figure as a ceiling on the deduction.");
  const taxable = Math.max(0, beforeQbi - qbiDeduction);
  const incomeTax = bracketTax(taxable, table.b);
  const total = incomeTax + se.tax;
  const marginal = (table.b.find(([hi]) => taxable <= hi) ?? [0, 0])[1];

  // Safe harbour: smaller of 90% of this year and 100%/110% of last year.
  const current90 = Math.round(total * 0.9);
  let prior = null;
  if (o.priorYearTax != null) prior = Math.round(o.priorYearTax * ((o.priorAgi ?? 0) > D(150000) ? 1.1 : 1.0));
  else warnings.push("No prior-year tax given: the plan uses 90% of this year's estimate. Pass priorYearTax (and priorAgi) from last year's 1040 for the 100%/110% safe harbour, which is often far smaller.");
  const required = Math.max(0, (prior == null ? current90 : Math.min(current90, prior)) - withholding);
  const owedAfterWithholding = total - withholding;
  const exempt = owedAfterWithholding < D(1000);
  if (exempt) warnings.push("Tax after withholding is under $1,000, so no estimated payments are required.");

  const dates = estimatedDueDates(year);
  const asOf = o.asOf ?? null;
  const future = asOf ? dates.filter((d) => d >= asOf) : dates;
  const remaining = exempt ? 0 : Math.max(0, required - paid);
  const each = future.length ? Math.floor(remaining / future.length) : 0;
  const payments = dates.map((due) => {
    const idx = future.indexOf(due);
    if (idx < 0) return { due, cents: 0, status: "past" };
    return { due, cents: idx === future.length - 1 ? remaining - each * (future.length - 1) : each, status: "due" };
  });
  if (!future.length && remaining) warnings.push(`All four dates have passed with ${remaining / 100} still unpaid; pay now and expect an underpayment penalty (Form 2210).`);
  // The rest is paid with the return: the balance, not a penalty.
  const balanceWithReturn = Math.max(0, total - withholding - Math.max(paid, 0) - payments.reduce((s, p) => s + p.cents, 0));
  warnings.push(...sc.warnings, ...se.warnings);
  return { year, filing, monthsElapsed: months, profit, se, agi, standardDeduction: std, qbiDeduction, taxable, incomeTax, marginalRate: marginal, totalTax: total, effectiveRate: profit + wages + other > 0 ? total / (profit + wages + other) : 0, safeHarbor: { current90, prior, required, exempt }, withholding, paid, payments, balanceWithReturn, warnings };
}

export { toCents };
