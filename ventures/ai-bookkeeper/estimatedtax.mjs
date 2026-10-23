// Federal income-tax estimate and quarterly payment plan (Form 1040-ES style) for a
// sole proprietor: the year's Schedule C profit annualised, self-employment tax from
// taxforms.mjs, the half-SE deduction, the standard deduction, a simplified 20%
// qualified business income deduction, then the bracket tax. The payment plan uses
// the IRS safe harbour: the smaller of 90% of this year's tax and 100% of last year's
// (110% when last year's AGI was over $150,000), less withholding and what is already
// paid, spread over the due dates still ahead. A worksheet, not a filing.
//
// The bracket tables below were typed from memory of IRS Rev. Proc. 2024-40 (2025) and
// 2025-32 (2026); both were checked against the IRS text on 2026-10-23. The 2026 table was checked 2026-10-23 against the IRS text of Rev. Proc. 2025-32
// (irs.gov/pub/irs-drop/rp-25-32.pdf: tables 1-3, standard deductions, QBI thresholds); the 2025 tables and QBI thresholds match the IRS text of Rev. Proc. 2024-40 (pdftotext, 2026-10-23); the 2025 standard deductions are the One Big Beautiful Bill figures from the IRS 2026 inflation release and the Form 1040 instructions ($15,750 / $31,500 / $23,625), not the Rev. Proc.'s $15,000 / $30,000 / $22,500; the SS wage bases match ssa.gov; every result warns;
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
// Additional Medicare Tax (Form 8959): 0.9% of wages plus self-employment earnings above
// a threshold fixed by statute (not indexed) by filing status; mfs is not modelled.
export const ADDL_MEDICARE_THRESHOLD = { single: D(200000), hoh: D(200000), mfj: D(250000) };
// Section 199A threshold amounts: 2025 Rev. Proc. 2024-40 section 3.27 (read 2026-10-23), 2026 Rev. Proc. 2025-32
// section 3.26 (read on irs.gov 2026-10-23).
const QBI_LIMIT = {
  2025: { single: D(197300), hoh: D(197300), mfj: D(394600) },
  2026: { single: D(201750), hoh: D(201750), mfj: D(403500) },
};

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
// skip the 20% deduction), qbiMinimum ({ floor, threshold } cents, years after 2026), brackets, standardDeduction, wageBase.
export function estimatedTax(books, o = {}) {
  const year = o.year ?? new Date().getFullYear();
  const filing = o.filing ?? "single";
  const warnings = [];
  const months = Math.min(12, Math.max(1, o.monthsElapsed ?? 12));
  const sc = scheduleC(books, { from: `${year}-01-01`, to: `${year}-12-31` });
  const profit = Math.round((sc.netProfit * 12) / months);
  const num = (v) => (Number.isFinite(v) ? v : 0); // a blank form field arrives as NaN
  const wages = num(o.wages), other = num(o.otherIncome), withholding = num(o.withholding), paid = num(o.paid);
  const se = selfEmployment(profit, { year, wages, wageBase: o.wageBase });
  const table = o.brackets ? { std: o.standardDeduction ?? 0, b: o.brackets } : BRACKETS[year]?.[filing];
  if (!table) throw new Error(`No ${filing} brackets on file for ${year}; pass brackets (and standardDeduction).`);
  if (!o.brackets) warnings.push(year === 2026 ? `The 2026 brackets and standard deductions match the IRS text of Rev. Proc. 2025-32 (checked 2026-10-23); confirm they are still current or pass brackets.` : year === 2025 ? `The 2025 brackets match the IRS text of Rev. Proc. 2024-40 and the standard deductions the Form 1040 instructions as amended by the 2025 law (checked 2026-10-23); confirm they are still current or pass brackets.` : `The ${year} brackets and standard deduction are from memory and unchecked; confirm them on irs.gov or pass brackets.`);
  const std = o.standardDeduction ?? table.std;
  const agi = profit - se.deduction + wages + other;
  const beforeQbi = Math.max(0, agi - std);
  const qbiIncome = Math.max(0, profit - se.deduction);
  let qbiDeduction = o.qbi === false || profit <= 0 ? 0 : Math.min(Math.round(0.2 * qbiIncome), Math.round(0.2 * beforeQbi));
  // IRC 199A(i), read at law.cornell.edu 2026-10-23: for tax years after 2025 the deduction is the
  // greater of the usual figure and $400, for a taxpayer whose QBI from businesses they materially
  // participate in is "at least" $1,000 (so exactly $1,000 qualifies). Both amounts are indexed for
  // years after 2026 (subsection (i)(3), rounded to $5): pass qbiMinimum { floor, threshold } in cents
  // for those years. Capped here by taxable income before the deduction. Only bites for QBI of $1,000
  // to $2,000. Materially participating is the user's call; the page does not ask.
  const qmin = { floor: D(400), threshold: D(1000), ...(o.qbiMinimum ?? {}) };
  if (o.qbi !== false && year >= 2026 && qbiIncome >= qmin.threshold && qmin.floor > qbiDeduction) {
    qbiDeduction = Math.min(qmin.floor, beforeQbi);
    warnings.push("The minimum QBI deduction (IRC 199A(i)) applies only if you materially participate in the business; if not, the deduction may be smaller.");
  }
  if (o.qbi !== false && year >= 2027 && !o.qbiMinimum) warnings.push(`The $400 minimum QBI deduction and its $1,000 threshold are indexed for ${year} (IRC 199A(i)(3)); pass qbiMinimum { floor, threshold } in cents from the IRS revenue procedure, or treat a small-QBI result as approximate.`);
  if (qbiDeduction && beforeQbi > ((QBI_LIMIT[year] ?? QBI_LIMIT[2026])[filing] ?? Infinity)) warnings.push("Taxable income is above the QBI threshold, where the 20% deduction may be limited or lost; treat the figure as a ceiling on the deduction.");
  const taxable = Math.max(0, beforeQbi - qbiDeduction);
  const incomeTax = bracketTax(taxable, table.b);
  // Part II of Form 8959: the SE threshold is lowered by wages, which count first.
  const T = ADDL_MEDICARE_THRESHOLD[filing] ?? D(200000);
  const addlMedicare = Math.round(0.009 * (Math.max(0, wages - T) + Math.max(0, se.netEarnings - Math.max(0, T - wages))));
  if (addlMedicare) warnings.push("Includes the 0.9% Additional Medicare Tax (Form 8959) on earnings above " + T / 100 + "; an employer withholds it on wages over $200,000 only, so check the wage part against your W-2.");
  const total = incomeTax + se.tax + addlMedicare;
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
  return { year, filing, monthsElapsed: months, profit, se, agi, standardDeduction: std, qbiDeduction, taxable, incomeTax, addlMedicare, marginalRate: marginal, totalTax: total, effectiveRate: profit + wages + other > 0 ? total / (profit + wages + other) : 0, safeHarbor: { current90, prior, required, exempt }, withholding, paid, payments, balanceWithReturn, warnings };
}

export { toCents };
