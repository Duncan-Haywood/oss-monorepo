// S-corporation election worksheet: would paying yourself a salary and taking the rest as
// a distribution cost less federal tax than staying a sole proprietor? For one year it
// compares the Schedule C case (self-employment tax on all the profit, 20% QBI deduction)
// with an S corporation that pays the owner a W-2 salary (both halves of FICA on the
// salary only, FUTA, the 20% QBI deduction on the K-1 profit left after salary) and the
// extra yearly cost of running one (payroll service, Form 1120-S preparation). It sweeps
// the salary, since the answer turns on it, and scans profits for the break-even.
// Federal only, one owner, no state tax or franchise fee. The salary must be reasonable
// compensation for the work (a facts-and-circumstances test: Rev. Rul. 74-44, Watson v.
// United States, 668 F.3d 1008), which is the owner's and the preparer's call, not a
// number this file can supply. A worksheet, not tax advice. Dollar amounts are cents.
import { BRACKETS, bracketTax, ADDL_MEDICARE_THRESHOLD } from "./estimatedtax.mjs";
import { SS_WAGE_BASE, scheduleC } from "./taxforms.mjs";

const D = (n) => n * 100;
// Section 199A threshold amounts, as in estimatedtax.mjs (Rev. Proc. 2024-40 and 2025-32).
const QBI_THRESHOLD = { 2025: { single: D(197300), hoh: D(197300), mfj: D(394600) }, 2026: { single: D(201750), hoh: D(201750), mfj: D(403500) } };
const FUTA_WAGE = D(7000), FUTA_NET = 0.006; // 6.0% less the 5.4% state credit, on the first $7,000
// Not a quote from anyone: a payroll service runs about $500 to $900 a year and an
// 1120-S return about $1,000 or more; pass extraCost for your own figures.
export const DEFAULT_EXTRA_COST = D(1500);

// Section 199A above the threshold: the deduction is the smaller of 20% of QBI and 50% of the
// business's W-2 wages (property is not modelled), phased in over `range` of taxable income; a
// service business (`service`) loses the deduction over the same range. A sole proprietor with
// no employees has no W-2 wages, so above the range the deduction is zero.
function qbiAmount(qbiIncome, w2, beforeQbi, ctx) {
  const q = Math.max(0, qbiIncome);
  if (beforeQbi <= ctx.qbiThreshold) return Math.round(0.2 * q);
  const pct = Math.min(1, (beforeQbi - ctx.qbiThreshold) / ctx.qbiRange);
  const qa = ctx.service ? q * (1 - pct) : q, wa = ctx.service ? w2 * (1 - pct) : w2;
  const full = 0.2 * qa, limit = 0.5 * wa;
  return Math.round(Math.max(0, full - pct * Math.max(0, full - limit)));
}

function incomeTaxOn(agi, qbiIncome, w2, table, ctx) {
  const beforeQbi = Math.max(0, agi - table.std);
  const qbiDeduction = ctx.qbi === false ? 0 : Math.min(qbiAmount(qbiIncome, w2, beforeQbi, ctx), Math.round(0.2 * beforeQbi));
  const taxable = Math.max(0, beforeQbi - qbiDeduction);
  return { beforeQbi, qbiDeduction, taxable, incomeTax: bracketTax(taxable, table.b) };
}

// Sole proprietor on the profit: SE tax, half of it deducted, QBI, bracket tax.
function soleCase(profit, ctx) {
  const { base, table, T } = ctx;
  const net = profit > 0 ? Math.round(profit * 0.9235) : 0;
  const ss = Math.round(Math.min(net, base) * 0.124), med = Math.round(net * 0.029);
  const se = net < 40000 ? 0 : ss + med; // under $400 of net earnings owes none (Schedule SE)
  const deduction = Math.round(se / 2);
  const agi = profit - deduction;
  const it = incomeTaxOn(agi, profit - deduction, 0, table, ctx);
  const addl = Math.round(0.009 * Math.max(0, net - T));
  return { profit, selfEmploymentTax: se, additionalMedicare: addl, ...it, incomeTax: it.incomeTax, payrollTax: se + addl, total: it.incomeTax + se + addl, extraCost: 0, allIn: it.incomeTax + se + addl };
}

// S corporation paying the owner `salary`; the rest of the profit, less the employer's
// payroll taxes and the extra cost, passes through on the K-1.
function scorpCase(profit, salary, ctx) {
  const { base, table, T, extraCost, suta } = ctx;
  const s = Math.max(0, Math.min(salary, Math.max(0, profit)));
  const ssHalf = Math.round(Math.min(s, base) * 0.062), medHalf = Math.round(s * 0.0145);
  const employerFica = ssHalf + medHalf, employeeFica = ssHalf + medHalf;
  const futa = s > 0 ? Math.round(Math.min(s, FUTA_WAGE) * FUTA_NET) : 0;
  const unemployment = futa + (s > 0 ? suta : 0);
  const k1 = profit - s - employerFica - unemployment - extraCost;
  const it = incomeTaxOn(s + k1, k1, s, table, ctx);
  const addl = Math.round(0.009 * Math.max(0, s - T));
  const payrollTax = employerFica + employeeFica + unemployment + addl;
  return { profit, salary: s, k1, employerFica, employeeFica, futa, stateUnemployment: s > 0 ? suta : 0, additionalMedicare: addl, ...it, payrollTax, total: it.incomeTax + payrollTax, extraCost, allIn: it.incomeTax + payrollTax + extraCost };
}

// opts: year, filing (single|mfj|hoh), salary (cents) or salaryPct (share of profit, default 0.5),
// minSalary (floor for salaryPct, cents), extraCost (cents a year, default $1,500), service (true for a specified service trade: QBI phases out), qbiThreshold and qbiRange (cents), stateUnemployment
// (cents of SUTA on the salary, default 0), otherIncome (cents on the same return), qbi (false to skip
// the deduction), wageBase, brackets and standardDeduction (as estimatedTax).
export function scorpCompare(profitCents, o = {}) {
  const year = o.year ?? new Date().getFullYear(), filing = o.filing ?? "single", warnings = [];
  const table = o.brackets ? { std: o.standardDeduction ?? 0, b: o.brackets } : BRACKETS[year]?.[filing];
  if (!table) throw new Error(`No ${filing} brackets on file for ${year}; pass brackets (and standardDeduction).`);
  const base = o.wageBase ?? SS_WAGE_BASE[year];
  if (base === undefined) throw new Error(`No Social Security wage base on file for ${year}; pass wageBase.`);
  if (o.wageBase === undefined && year >= 2026) warnings.push(`The ${year} wage base is from trade-press reports, unchecked against SSA text; pass wageBase to override.`);
  const num = (v, d) => (Number.isFinite(v) ? v : d);
  const other = num(o.otherIncome, 0);
  const T = ADDL_MEDICARE_THRESHOLD[filing] ?? D(200000);
  const ctx = { base, table: { ...table, std: table.std - other }, T, qbi: o.qbi, service: o.service === true, qbiThreshold: o.qbiThreshold ?? (QBI_THRESHOLD[year] ?? QBI_THRESHOLD[2026])[filing] ?? D(201750), qbiRange: o.qbiRange ?? (year >= 2026 ? 75000 : 50000) * (filing === "mfj" ? 200 : 100), extraCost: Math.max(0, num(o.extraCost, DEFAULT_EXTRA_COST)), suta: Math.max(0, num(o.stateUnemployment, 0)) };
  // other income rides on the same return: folding it in as a lower standard deduction keeps one bracket path
  const profit = Math.round(profitCents);
  const pct = num(o.salaryPct, 0.5), floor = Math.max(0, num(o.minSalary, 0));
  const salaryAt = (p) => Math.min(Math.max(0, p), Math.max(Math.round(p * pct), floor));
  const salary = Number.isFinite(o.salary) ? Math.max(0, o.salary) : salaryAt(profit);
  const sole = soleCase(profit, ctx), scorp = scorpCase(profit, salary, ctx);
  const savings = sole.allIn - scorp.allIn;
  // salary sweep: 30% to 100% of profit in 10% steps, plus the chosen salary
  const sweep = [];
  for (let f = 30; f <= 100; f += 10) { const s = Math.round(profit * f / 100); const c = scorpCase(profit, s, ctx); sweep.push({ salaryPct: f, salary: c.salary, allIn: c.allIn, savings: sole.allIn - c.allIn }); }
  // break-even: the lowest profit from which the election keeps saving money at the same salary rule
  let breakEven = null;
  for (let p = D(5000); p <= D(500000); p += D(500)) {
    const a = soleCase(p, ctx), b = scorpCase(p, o.salary !== undefined && Number.isFinite(o.salary) ? o.salary : salaryAt(p), ctx);
    if (a.allIn - b.allIn > 0) { if (breakEven === null) breakEven = p; } else breakEven = null;
  }
  if (profit <= 0) warnings.push("No profit: nothing to elect for. An S corporation with no profit still owes its yearly costs.");
  if (salary < Math.round(profit * 0.3) && profit > 0) warnings.push("The salary is under 30% of profit. Reasonable compensation is judged on the work you do and what the market pays, not on a percentage; a low salary is the usual reason an S-corporation return is challenged.");
  if (scorp.beforeQbi > ctx.qbiThreshold || sole.beforeQbi > ctx.qbiThreshold) warnings.push(`Taxable income is above the QBI threshold, so the 20% deduction is limited to 50% of W-2 wages (none for a sole proprietor with no staff)${ctx.service ? " and phased out, as you marked this a service business" : "; pass service: true if yours is a service business (law, health, consulting, accounting, finance and similar), which loses it over the range"}. Property is not modelled. The phase-in range is ${ctx.qbiRange / 100} dollars${o.qbiRange === undefined && year >= 2026 ? " (the 2026 widening from 50,000/100,000 is from memory, unchecked against the statute; pass qbiRange)" : ""}.`);
  if (profit > D(500000)) warnings.push("Break-even scan stops at $500,000 of profit.");
  warnings.push("Federal tax only. States differ: some tax S corporations (California 1.5% with an $800 minimum), others do not recognise the election; the unemployment tax on the salary varies by state (stateUnemployment).");
  warnings.push("Not modelled: health insurance for a more-than-2% shareholder, a retirement plan on the salary (a solo 401(k) deferral is wage-based), basis limits, a sole proprietor's own deductions beyond the standard one.");
  return { year, filing, profit, salary, sole, scorp, savings, sweep, breakEven, warnings };
}

// The same from the books' Schedule C profit for `year`, annualised to the months covered.
export function scorpFromBooks(books, o = {}) {
  const year = o.year ?? new Date().getFullYear();
  const months = Math.min(12, Math.max(1, o.monthsElapsed ?? 12));
  const sc = scheduleC(books, { from: `${year}-01-01`, to: `${year}-12-31` });
  const profit = Math.round((sc.netProfit * 12) / months);
  return { ...scorpCompare(profit, { ...o, year }), monthsElapsed: months, profitToDate: sc.netProfit };
}
