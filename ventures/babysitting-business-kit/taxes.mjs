// Babysitting Business Kit: the federal tax estimate, the safe-harbor quarterly plan and
// the Schedule C worksheet. Pure functions over the desk, beside (not instead of) the
// conservative set-aside in engine.mjs's taxSummary(). Money is in dollars rounded to cents.
//
// Where the figures come from. Copied, not imported, from ventures/ai-bookkeeper/estimatedtax.mjs,
// whose authors checked them against the IRS text on 2026-10-23:
//   - 2026 brackets and standard deductions: Rev. Proc. 2025-32, tables 1-3 (irs.gov/pub/irs-drop/rp-25-32.pdf).
//   - 2025 brackets: Rev. Proc. 2024-40; 2025 standard deductions: the 2025 law's figures as in the
//     Form 1040 instructions ($15,750 / $31,500 / $23,625).
//   - QBI (section 199A) thresholds: Rev. Proc. 2024-40 s. 3.27 (2025), Rev. Proc. 2025-32 s. 3.26 (2026).
//   - The $400 minimum QBI deduction for QBI of at least $1,000 from 2026: IRC 199A(i), read at
//     law.cornell.edu 2026-10-23.
//   - Additional Medicare Tax 0.9% above $200,000 ($250,000 joint), Form 8959: fixed by statute.
// Self-employment tax (12.4% Social Security up to the wage base, 2.9% Medicare, on 92.35% of
// profit, none under $400 of net earnings) and the wage base come from engine.mjs, whose sources
// are listed there. Safe harbor: IRC 6654(d)(1)(B) and (C) (90% of this year, or 100% of last
// year's tax, 110% when last year's AGI was over $150,000), 6654(e)(1) (no penalty when the tax
// after withholding is under $1,000) and 6654(g) (withholding counts as paid evenly on the due
// dates). Married filing separately is not modelled.
import { taxSummary, quarterlyDueDates, SS_WAGE_BASE, EXPENSE_CATEGORIES } from "./engine.mjs";

const r2 = (x) => Math.round((Number(x) || 0) * 100) / 100;
const num = (x) => (x === "" || x === null || x === undefined || !Number.isFinite(Number(x)) ? 0 : Number(x));
const pos = (x) => Math.max(0, num(x));

export const FILING = { single: "Single", hoh: "Head of household", mfj: "Married filing jointly" };

// [upper bound of the bracket, rate]; std is the standard deduction.
export const BRACKETS = {
  2025: {
    single: { std: 15750, b: [[11925, 0.10], [48475, 0.12], [103350, 0.22], [197300, 0.24], [250525, 0.32], [626350, 0.35], [Infinity, 0.37]] },
    mfj: { std: 31500, b: [[23850, 0.10], [96950, 0.12], [206700, 0.22], [394600, 0.24], [501050, 0.32], [751600, 0.35], [Infinity, 0.37]] },
    hoh: { std: 23625, b: [[17000, 0.10], [64850, 0.12], [103350, 0.22], [197300, 0.24], [250500, 0.32], [626350, 0.35], [Infinity, 0.37]] },
  },
  2026: {
    single: { std: 16100, b: [[12400, 0.10], [50400, 0.12], [105700, 0.22], [201775, 0.24], [256225, 0.32], [640600, 0.35], [Infinity, 0.37]] },
    mfj: { std: 32200, b: [[24800, 0.10], [100800, 0.12], [211400, 0.22], [403550, 0.24], [512450, 0.32], [768700, 0.35], [Infinity, 0.37]] },
    hoh: { std: 24150, b: [[17700, 0.10], [67450, 0.12], [105700, 0.22], [201750, 0.24], [256200, 0.32], [640600, 0.35], [Infinity, 0.37]] },
  },
};
export const QBI_THRESHOLD = { 2025: { single: 197300, hoh: 197300, mfj: 394600 }, 2026: { single: 201750, hoh: 201750, mfj: 403500 } };
export const ADDL_MEDICARE_THRESHOLD = { single: 200000, hoh: 200000, mfj: 250000 };

export function bracketTax(taxable, brackets) {
  let tax = 0, lo = 0;
  for (const [hi, rate] of brackets) {
    if (taxable <= lo) break;
    tax += (Math.min(taxable, hi) - lo) * rate;
    lo = hi;
  }
  return r2(tax);
}

// The sitter's tax inputs live on the profile (normalizeDesk keeps profile keys):
// profile.taxes = { filing, years: { "2026": { wages, spouseWages, otherIncome, withholding,
// priorYearTax, priorAgi } }, payments: [{ id, year, date, amount, note }] }.
export function taxInputs(desk, year) {
  const t = (desk.profile && desk.profile.taxes) || {};
  const y = (t.years && t.years[String(year)]) || {};
  return { filing: FILING[t.filing] ? t.filing : "single", ...y, payments: (Array.isArray(t.payments) ? t.payments : []).filter((p) => Number(p.year) === Number(year) && num(p.amount) > 0) };
}

// Fraction of the year that has passed on `today`, for projecting the year so far to a
// full year. A past year is 1; never less than a month, so a January projection is not wild.
export function yearFraction(year, today) {
  if (!today || today >= `${year}-12-31`) return 1;
  if (today < `${year}-01-01`) return 1 / 12;
  const days = (Date.parse(today) - Date.parse(`${year}-01-01`)) / 864e5 + 1;
  const len = (Date.parse(`${year + 1}-01-01`) - Date.parse(`${year}-01-01`)) / 864e5;
  return Math.max(1 / 12, days / len);
}

// Self-employment tax on a Schedule C profit (Schedule SE): own W-2 wages use up the
// Social Security wage base first.
export function seTax(profit, year, ownWages = 0) {
  const netEarnings = r2(Math.max(0, profit) * 0.9235);
  if (netEarnings < 400) return { netEarnings, socialSecurity: 0, medicare: 0, tax: 0, deduction: 0 };
  const base = SS_WAGE_BASE[year] || SS_WAGE_BASE[2027];
  const socialSecurity = r2(Math.min(netEarnings, Math.max(0, base - pos(ownWages))) * 0.124);
  const medicare = r2(netEarnings * 0.029);
  const tax = r2(socialSecurity + medicare);
  return { netEarnings, socialSecurity, medicare, tax, deduction: r2(tax / 2) };
}

// The federal estimate for a year. opts override the saved inputs: filing, wages (your own
// W-2 wages), spouseWages (joint only), otherIncome, withholding (federal tax already
// withheld from paychecks for the year), project (true: scale the Schedule C profit so far
// to a full year; default true for the current year), today.
export function federalEstimate(desk, year, opts = {}) {
  const today = opts.today;
  const saved = taxInputs(desk, year);
  const o = { ...saved, ...opts };
  const filing = FILING[o.filing] ? o.filing : "single";
  const warnings = [];
  const table = (BRACKETS[year] || BRACKETS[2026])[filing];
  if (!BRACKETS[year]) warnings.push(`No ${year} brackets on file; the 2026 brackets (Rev. Proc. 2025-32) are used, so treat the result as approximate.`);
  const s = taxSummary(desk, year, today);
  const frac = o.project === false ? 1 : yearFraction(year, today);
  const profitSoFar = s.net;
  const profit = r2(profitSoFar / frac);
  if (frac < 1) warnings.push(`Projected: your profit so far ($${profitSoFar}) scaled to a full year (${Math.round(frac * 100)}% of the year has passed). Busy summers and quiet winters make this rough; untick "project" to see the year so far.`);
  const wages = pos(o.wages), spouseWages = filing === "mfj" ? pos(o.spouseWages) : 0, other = num(o.otherIncome), withholding = pos(o.withholding);
  const se = seTax(profit, year, wages);
  const agi = r2(profit - se.deduction + wages + spouseWages + other);
  const beforeQbi = Math.max(0, r2(agi - table.std));
  const qbiIncome = Math.max(0, r2(profit - se.deduction));
  const threshold = (QBI_THRESHOLD[year] || QBI_THRESHOLD[2026])[filing];
  let qbi = 0;
  if (qbiIncome > 0 && beforeQbi <= threshold) {
    qbi = r2(Math.min(0.2 * qbiIncome, 0.2 * beforeQbi));
    if (year >= 2026 && qbiIncome >= 1000 && qbi < 400) qbi = Math.min(400, beforeQbi);
  } else if (qbiIncome > 0) warnings.push(`Taxable income is above the $${threshold.toLocaleString("en-US")} QBI threshold, where the 20% deduction is limited; it is left out here (so the estimate errs high). A preparer can work it out.`);
  const taxable = Math.max(0, r2(beforeQbi - qbi));
  const incomeTax = bracketTax(taxable, table.b);
  const T = ADDL_MEDICARE_THRESHOLD[filing];
  const allWages = wages + spouseWages;
  const addlMedicare = r2(0.009 * (Math.max(0, allWages - T) + Math.max(0, se.netEarnings - Math.max(0, T - allWages))));
  const total = r2(incomeTax + se.tax + addlMedicare);
  const marginal = (table.b.find(([hi]) => taxable <= hi) || [0, 0])[1];
  const paidEstimates = r2(saved.payments.reduce((a, p) => a + num(p.amount), 0));
  const balance = r2(total - withholding - paidEstimates);
  warnings.push("Credits (child tax credit, earned income credit, education credits) and itemised deductions are not included, so a family with children will usually owe less than this.");
  return {
    year, filing, filingLabel: FILING[filing], projected: frac < 1, fraction: frac, profitSoFar, profit,
    se, halfSe: se.deduction, wages, spouseWages, otherIncome: other, agi, standardDeduction: table.std,
    qbiIncome, qbi, taxable, incomeTax, addlMedicare, total, marginal,
    effectiveRate: profit + wages + spouseWages + other > 0 ? Math.round((total / (profit + wages + spouseWages + other)) * 1000) / 10 : 0,
    withholding, paidEstimates, balance, setAside: s.setAside, warnings,
  };
}

// Safe-harbor quarterly plan. thisYear: the federalEstimate. The required annual payment is
// the smaller of 90% of this year's tax and 100% (110% above $150,000 AGI) of last year's;
// each due date needs a cumulative 25%, 50%, 75%, 100% of it, from withholding (spread
// evenly) plus estimated payments made by that date.
export function safeHarbor(desk, year, opts = {}) {
  const today = opts.today || `${year}-12-31`;
  const est = opts.estimate || federalEstimate(desk, year, opts);
  const o = { ...taxInputs(desk, year), ...opts };
  const notes = [];
  const current90 = r2(est.total * 0.9);
  const hasPrior = o.priorYearTax !== "" && o.priorYearTax !== undefined && o.priorYearTax !== null && Number.isFinite(Number(o.priorYearTax));
  const priorTax = hasPrior ? pos(o.priorYearTax) : null;
  const priorPct = pos(o.priorAgi) > 150000 ? 1.1 : 1;
  const prior = hasPrior ? r2(priorTax * priorPct) : null;
  let required = prior === null ? current90 : Math.min(current90, prior);
  let basis = prior === null ? "90% of this year's estimate" : prior <= current90 ? `${priorPct === 1.1 ? "110" : "100"}% of last year's tax` : "90% of this year's estimate";
  if (prior === null) notes.push("Enter last year's total tax (Form 1040, the \"total tax\" line) to compare the prior-year safe harbor; it is often the smaller and lets you pay a fixed amount without guessing this year's income.");
  let exempt = false;
  if (est.total - est.withholding < 1000) { exempt = true; notes.push("Tax after withholding is under $1,000, so no estimated payments are required (no underpayment penalty applies)."); }
  else if (priorTax === 0) { exempt = true; notes.push("Last year's tax was $0: if that was a full 12-month year and you were a US citizen or resident all year, no estimated payments are required this year. You still owe the tax when you file."); }
  if (exempt) { required = 0; basis = "not required"; }
  if (priorPct === 1.1 && hasPrior) notes.push("Last year's AGI was over $150,000, so the prior-year safe harbor is 110% of last year's tax.");
  notes.push("Paying the required amount by each date avoids the underpayment penalty; it does not mean you owe nothing more. Any balance is due by the April filing deadline.");
  notes.push("If most of your sits come in summer, the annualized installment method (Form 2210, Schedule AI) can lower the early payments; this plan does not use it.");
  const due = quarterlyDueDates(year);
  const pays = o.payments.slice().sort((a, b) => String(a.date).localeCompare(String(b.date)));
  let planned = 0;
  const quarters = due.map((d, i) => {
    const requiredCum = r2((required * (i + 1)) / 4);
    const paidCum = r2((est.withholding * (i + 1)) / 4 + pays.filter((p) => String(p.date) <= d).reduce((a, p) => a + num(p.amount), 0));
    const past = d < today;
    const short = r2(Math.max(0, requiredCum - paidCum));
    const toPay = past || exempt ? 0 : r2(Math.max(0, requiredCum - paidCum - planned));
    planned = r2(planned + toPay);
    return { quarter: i + 1, due: d, installment: r2(required / 4), requiredCum, paidCum, shortfall: past ? short : 0, toPay, past };
  });
  const paid = r2(pays.reduce((a, p) => a + num(p.amount), 0));
  return { year, current90, prior, priorPct, required, basis, exempt, withholding: est.withholding, paid, payments: pays, quarters, balanceAtFiling: r2(Math.max(0, est.total - est.withholding - paid - planned)), notes };
}

// Expense category -> Schedule C line. Categories another part of the kit adds, or the
// sitter types, fall to 27a (Other expenses, listed by name in Part V). These are the
// usual places; a preparer may move a row.
export const SCHEDULE_C_LINES = {
  "1": "Gross receipts or sales", "8": "Advertising", "9": "Car and truck expenses", "15": "Insurance (other than health)",
  "22": "Supplies", "25": "Utilities", "27a": "Other expenses (Part V)", "28": "Total expenses", "29": "Tentative profit", "31": "Net profit",
};
export const CATEGORY_LINE = { supplies: "22", training: "27a", advertising: "8", phone: "25", insurance: "15", fees: "27a", other: "27a" };

export function scheduleC(desk, year, today) {
  const s = taxSummary(desk, year, today);
  const lines = [];
  const add = (line, description, amount, category) => { if (amount) lines.push({ line, label: SCHEDULE_C_LINES[line], description, category: category || "", amount: r2(amount) }); };
  add("1", "Payments received from families (cash, check and app payments)", s.income);
  const order = ["8", "9", "15", "22", "25", "27a"];
  const byLine = {};
  for (const [cat, amt] of Object.entries(s.expenseByCat)) {
    const line = CATEGORY_LINE[cat] || "27a";
    (byLine[line] = byLine[line] || []).push({ cat, amt });
  }
  if (s.mileage) (byLine["9"] = byLine["9"] || []).push({ cat: "mileage", amt: s.mileage, label: `Standard mileage: ${s.totalMiles} business miles` });
  for (const line of order) for (const r of byLine[line] || []) add(line, r.label || EXPENSE_CATEGORIES[r.cat] || r.cat, r.amt, r.cat);
  const totalExpenses = r2(lines.filter((l) => l.line !== "1").reduce((a, l) => a + l.amount, 0));
  const lineTotals = {};
  for (const l of lines) lineTotals[l.line] = r2((lineTotals[l.line] || 0) + l.amount);
  const net = r2(s.income - totalExpenses);
  const notes = [
    "Line 1 is the money you received in the year (cash method), including payments that never came with a 1099 form.",
    "Line 9 uses the standard mileage rate; you then cannot also deduct gas, repairs or car insurance. Part IV asks for the business miles and when the car was first used for business.",
    "Category placement is the usual one; your preparer may move a row (training and fees are listed by name under Part V, line 27a).",
  ];
  if (!s.totalMiles) notes.push("No business miles logged this year.");
  return { year, grossReceipts: s.income, lines, lineTotals, totalExpenses, tentativeProfit: net, netProfit: net, businessMiles: s.totalMiles, expenseDetail: expenseDetail(desk, year), notes };
}

function expenseDetail(desk, year) {
  return desk.expenses.filter((e) => String(e.date).startsWith(String(year)) && (num(e.amount) || num(e.miles)))
    .map((e) => ({ date: e.date, category: e.category || "other", line: CATEGORY_LINE[e.category] || "27a", amount: r2(e.amount), miles: num(e.miles), note: e.note || "" }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

const csvCell = (v) => { const s = String(v ?? ""); return /^[=+\-@\t\r]/.test(s) ? `"'${s.replace(/"/g, '""')}"` : /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
export const toCSV = (rows) => rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";

// One CSV a tax preparer can open: the Schedule C lines, then each receipt and miles entry.
export function scheduleCCSV(desk, year, today) {
  const c = scheduleC(desk, year, today);
  const rows = [["section", "schedule_c_line", "line_label", "description", "date", "amount", "miles"]];
  for (const l of c.lines) rows.push(["line", l.line, l.label, l.description, "", l.amount.toFixed(2), l.category === "mileage" ? c.businessMiles : ""]);
  rows.push(["line", "28", SCHEDULE_C_LINES["28"], "Total expenses", "", c.totalExpenses.toFixed(2), ""]);
  rows.push(["line", "31", SCHEDULE_C_LINES["31"], "Net profit (no home-office deduction on line 30)", "", c.netProfit.toFixed(2), ""]);
  for (const e of c.expenseDetail) rows.push(["receipt", e.line, SCHEDULE_C_LINES[e.line], `${EXPENSE_CATEGORIES[e.category] || e.category}${e.note ? `: ${e.note}` : ""}`, e.date, e.amount ? e.amount.toFixed(2) : "", e.miles || ""]);
  return toCSV(rows);
}

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);
const $ = (x) => `$${r2(x).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// A printable one-page year summary: Schedule C lines, the federal estimate beside the
// set-aside, the quarterly plan and the payments made. A standalone HTML document.
export function yearSummaryHTML(desk, year, today) {
  const p = desk.profile;
  const c = scheduleC(desk, year, today);
  const est = federalEstimate(desk, year, { today });
  const sh = safeHarbor(desk, year, { today, estimate: est });
  const row = (a, b) => `<tr><td>${a}</td><td class="n">${b}</td></tr>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(year)} babysitting year summary</title>
<style>body{font:13px/1.45 system-ui,sans-serif;color:#222;max-width:760px;margin:24px auto;padding:0 16px}table{border-collapse:collapse;width:100%;margin:6px 0 14px}td,th{border-bottom:1px solid #ddd;padding:3px 6px;text-align:left}td.n,th.n{text-align:right}h1{font-size:20px}h2{font-size:15px;margin:18px 0 4px}.note{color:#555;font-size:11px}</style></head><body>
<h1>${esc(p.businessName || p.name)}: ${esc(year)} year summary</h1>
<p class="note">Prepared ${esc(today || "")} from the Babysitting Business Kit. ${est.projected ? "The tax estimate is projected to a full year from the year so far." : ""}</p>
<h2>Schedule C (Profit or Loss From Business)</h2>
<table><tr><th>Line</th><th>What</th><th class="n">Amount</th></tr>${c.lines.map((l) => `<tr><td>${esc(l.line)}</td><td>${esc(l.description)}</td><td class="n">${$(l.amount)}</td></tr>`).join("")}
<tr><td>28</td><td>Total expenses</td><td class="n">${$(c.totalExpenses)}</td></tr><tr><td>31</td><td><b>Net profit</b></td><td class="n"><b>${$(c.netProfit)}</b></td></tr></table>
<p class="note">Business miles (Part IV): ${esc(c.businessMiles)}.</p>
<h2>Federal estimate (${esc(est.filingLabel)})</h2>
<table>${row(`Schedule C profit${est.projected ? " (projected full year)" : ""}`, $(est.profit))}${row("Self-employment tax", $(est.se.tax))}${row("Half of SE tax deducted", $(est.halfSe))}${est.wages + est.spouseWages ? row("W-2 wages", $(est.wages + est.spouseWages)) : ""}${est.otherIncome ? row("Other income", $(est.otherIncome)) : ""}${row("Adjusted gross income", $(est.agi))}${row("Standard deduction", $(est.standardDeduction))}${row("QBI deduction (20%)", $(est.qbi))}${row("Taxable income", $(est.taxable))}${row("Income tax", $(est.incomeTax))}${est.addlMedicare ? row("Additional Medicare tax", $(est.addlMedicare)) : ""}${row("<b>Total federal tax</b>", `<b>${$(est.total)}</b>`)}${row("Withheld from paychecks", $(est.withholding))}${row("Estimated payments made", $(est.paidEstimates))}${row("Balance (refund if negative)", $(est.balance))}${row("Conservative set-aside (incl. state)", $(est.setAside))}</table>
<h2>Quarterly estimated payments (required: ${$(sh.required)}, ${esc(sh.basis)})</h2>
<table><tr><th>Due</th><th class="n">Needed by then</th><th class="n">Paid by then</th><th class="n">Pay</th></tr>${sh.quarters.map((q) => `<tr><td>Q${q.quarter} ${esc(q.due)}${q.past ? " (past)" : ""}</td><td class="n">${$(q.requiredCum)}</td><td class="n">${$(q.paidCum)}</td><td class="n">${q.past ? (q.shortfall ? `short ${$(q.shortfall)}` : "") : $(q.toPay)}</td></tr>`).join("")}</table>
${sh.payments.length ? `<p>Payments made: ${sh.payments.map((x) => `${esc(x.date)} ${$(x.amount)}`).join("; ")}</p>` : ""}
<p class="note"><b>No warranty.</b> Provided free and as-is, without warranty of any kind. It is not legal, tax, or financial advice, and it does not replace a qualified professional. Figures use 2026 IRS tables and leave out credits; check them with a tax preparer before you file. Free and open source (MIT): https://github.com/sponsors/Duncan-Haywood</p>
</body></html>`;
}
