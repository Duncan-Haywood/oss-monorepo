// Payroll register -> books. A payroll provider (Gusto, ADP, Paychex, Square
// Payroll, QuickBooks Payroll ...) debits net pay and then the tax deposits
// from the bank, and the bank lines say nothing about wages, withholding or
// the employer's share. This reads the provider's pay-run report (company
// totals, or one row per employee, grouped by pay date), books each run, then
// finds the bank lines that paid it.
//
// A run books: Dr Wages (6150) gross pay, Dr Payroll taxes and benefits (6155,
// added on first use) the employer's share of FICA, FUTA, state unemployment
// and benefits; Cr Payroll liabilities (2300) for both. The bank lines that
// pay it (net pay, the federal deposit, the state deposit) are then filed to
// 2300, so 2300 shows what is still owed. A federal deposit for a month's runs
// paid together (monthly depositors) is matched against the month's sum.
//
// Columns (matched by name, any order): pay date, gross pay, net pay, federal
// income tax, social security and medicare withheld (employee), state income
// tax, other deductions (benefits, retirement, garnishments), employer social
// security, employer medicare, FUTA, state unemployment (SUTA), other employer
// cost. A row where net pay is not gross less the employee deductions is
// refused and named. Form 941 worksheet figures are summed from the register;
// tips are not modelled. Integer cents.
// Hand-written fixtures in the documented layout only; no real provider export
// has been tried. Not payroll, tax or accounting advice.

import { parseCsv, parseCents, parseDate } from "./bank.mjs";
import { confirm } from "./engine.mjs";

// Annual social security wage base (SSA announcements); a year not listed is
// checked at a flat 6.2% as before.
export const SS_WAGE_BASE = { 2023: 16020000, 2024: 16860000, 2025: 17610000, 2026: 18450000, 2027: 19230000 };
// FUTA: 6.0% on the first $7,000 of each employee's wages a year, less up to 5.4% credit for state unemployment paid on time: 0.6% net.
export const FUTA_WAGE_BASE = 700000;
// Additional Medicare Tax: employees only, 0.9% of wages above $200,000 in the calendar year; withholding starts in the pay period that crosses it.
export const ADDL_MEDICARE_THRESHOLD = 20000000;
export const WAGES = "6150", PAYROLL_TAX = "6155", LIABILITY = "2300";

const key = (h) => String(h).trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
const ALIASES = {
  date: ["pay_date", "check_date", "payment_date", "date", "pay_day", "payday"],
  gross: ["gross_pay", "gross", "gross_wages", "total_gross", "gross_earnings"],
  net: ["net_pay", "net", "net_wages", "take_home"],
  fed: ["federal_income_tax", "federal_withholding", "fed_income_tax", "federal_tax", "fit", "federal_income_tax_withheld", "federal_w_h", "fed_income_tax_withheld", "federal_withholding_tax", "federal_income_tax_ee", "federal_tax_withheld", "fed_w_h", "fed_withholding", "federal_income_tax_employee"],
  ss: ["social_security", "social_security_employee", "employee_social_security", "ss_employee", "oasdi", "ee_social_security", "social_security_tax", "fica_ss", "social_security_ee", "social_security_tax_ee", "social_security_employee_tax", "employee_social_security_tax", "oasdi_ee", "fica_social_security", "social_security_withheld"],
  med: ["medicare", "medicare_employee", "employee_medicare", "medicare_ee", "ee_medicare", "medicare_tax", "fica_medicare", "medicare_tax_ee", "medicare_ee_tax", "employee_medicare_tax", "medicare_withheld", "medicare_employee_tax", "additional_medicare", "additional_medicare_tax", "addl_medicare", "addl_medicare_tax", "additional_medicare_ee", "medicare_additional"],
  taxTotal: ["total_employee_taxes", "total_taxes", "employee_taxes", "total_employee_tax", "total_tax_withheld", "total_withholdings", "total_taxes_withheld", "employee_taxes_withheld"],
  state: ["state_income_tax", "state_withholding", "state_tax", "state_income_tax_withheld", "state_w_h", "state_withholding_tax", "state_tax_withheld", "state_income_tax_ee", "state_withholding_ee", "state_income_tax_employee"],
  other: ["other_deductions", "deductions", "benefits_deductions", "employee_deductions", "retirement_401k", "garnishments", "total_deductions", "401_k", "401k", "401_k_employee", "roth_401_k", "retirement", "health_insurance", "medical", "dental", "vision", "hsa", "fsa", "garnishment", "child_support", "other_deductions_pre_tax", "pre_tax_deductions", "post_tax_deductions"],
  erSs: ["employer_social_security", "social_security_employer", "er_social_security", "ss_employer", "employer_oasdi", "social_security_er", "social_security_tax_er", "employer_social_security_tax", "social_security_employer_tax", "oasdi_er", "er_social_security_tax"],
  erMed: ["employer_medicare", "medicare_employer", "er_medicare", "medicare_er", "medicare_tax_er", "employer_medicare_tax", "medicare_employer_tax", "er_medicare_tax"],
  futa: ["futa", "federal_unemployment", "employer_futa", "federal_unemployment_tax", "employer_futa_tax", "futa_er", "futa_tax", "er_futa"],
  suta: ["suta", "state_unemployment", "employer_suta", "state_unemployment_tax", "sui", "employer_suta_tax", "employer_sui", "suta_er", "suta_tax", "er_suta", "state_unemployment_insurance"],
  erOther: ["employer_other", "employer_benefits", "other_employer_cost", "employer_contributions", "employer_401k", "employer_401_k", "employer_health_insurance", "employer_benefit_contributions", "er_401k"],
  employee: ["employee", "employee_name", "name", "full_name", "employee_full_name"],
  last: ["last_name", "surname", "family_name"],
  first: ["first_name", "given_name", "forename"],
  // Earnings columns, summed into gross pay when the report has no gross column (Gusto, ADP and Paychex exports often list only the kinds of pay).
  earn: ["regular_pay", "regular_wages", "regular_earnings", "regular", "salary", "hourly", "overtime", "overtime_pay", "double_time", "double_overtime", "bonus", "commission", "commissions", "holiday", "holiday_pay", "pto", "pto_pay", "vacation", "vacation_pay", "sick", "sick_pay", "paid_time_off", "severance", "retro_pay"],
};

const fieldOf = (header) => {
  const k = key(header);
  for (const [f, names] of Object.entries(ALIASES)) if (names.includes(k)) return f;
  return null;
};

// -> { runs: [{ id, date, employees, gross, net, fed, ss, med, state, other, erSs, erMed, futa, suta, erOther }], problems }
export function readPayrollRegister(text) {
  let table = parseCsv(text).filter((r) => r.some((c) => String(c).trim() !== ""));
  if (table.length < 2) throw new Error("The payroll register has no rows.");
  // Exports often start with a title, the company and the period before the header: the header is the first row that names a pay date and a net pay column.
  const at = table.findIndex((r) => { const f = r.map(fieldOf); return f.includes("date") && f.includes("net"); });
  if (at > 0) table = table.slice(at);
  const cols = table[0].map(fieldOf);
  const hasEarn = cols.includes("earn");
  for (const need of ["date", "gross", "net"]) if (!cols.includes(need) && !(need === "gross" && hasEarn)) throw new Error(`The payroll register needs a ${need === "date" ? "pay date" : need === "gross" ? "gross pay" : "net pay"} column. Found: ${table[0].join(", ")}.`);
  const problems = [], notes = [], byDate = new Map();
  const taxOnly = cols.includes("taxTotal") && !cols.some((f) => ["fed", "ss", "med", "state"].includes(f));
  if (taxOnly) notes.push("The register has one total for employee taxes. Social Security (6.2%) and Medicare (1.45%) are taken from gross pay and the rest is booked as federal income tax; split columns would be exact, so the Form 941 worksheet is only as good as that guess.");
  // Provider exports end with a "Total" row (which would count every run twice) and often print the pay date only on a group's first row.
  const nameCol = cols.indexOf("employee"), dateCol = cols.indexOf("date");
  let lastDate = "";
  table.slice(1).forEach((r, i) => {
    if (/^(grand\s+)?totals?\b/i.test(String(r[nameCol >= 0 ? nameCol : dateCol] ?? "").trim())) return;
    if (nameCol >= 0 && String(r[dateCol] ?? "").trim() === "" && String(r[nameCol] ?? "").trim() !== "" && lastDate) r = r.map((c, j) => (j === dateCol ? lastDate : c));
    else lastDate = String(r[dateCol] ?? "").trim() || lastDate;
    const row = { employee: null };
    // Several columns can feed one field (a 401(k) and a health plan are both "other"; kinds of pay add up to gross), so money adds.
    cols.forEach((f, j) => {
      if (!f) return;
      if (f === "date") row.date = parseDate(r[j]);
      else if (f === "employee" || f === "last" || f === "first") row[f] = String(r[j] ?? "").trim();
      else { const v = String(r[j] ?? "").trim() === "" ? 0 : parseCents(r[j]); row[f] = row[f] === undefined ? v : row[f] + v; }
    });
    if (row.last || row.first) row.employee = row.employee || [row.first, row.last].filter(Boolean).join(" ");
    if (!cols.includes("gross")) row.gross = row.earn;
    if (taxOnly && Number.isFinite(row.taxTotal) && Number.isFinite(row.gross)) {
      row.ss = Math.min(Math.round(row.gross * 0.062), row.taxTotal);
      row.med = Math.min(Math.round(row.gross * 0.0145), row.taxTotal - row.ss);
      row.fed = row.taxTotal - row.ss - row.med;
    }
    const label = `Row ${i + 2}`;
    if (!row.date) { problems.push(`${label}: no readable pay date.`); return; }
    for (const f of ["gross", "net", "fed", "ss", "med", "state", "other", "erSs", "erMed", "futa", "suta", "erOther"]) {
      row[f] ??= 0;
      if (!Number.isFinite(row[f])) { problems.push(`${label}: cannot read the ${f} amount.`); return; }
    }
    // Employee deductions are shown as positives; a negative one is the provider's sign convention.
    for (const f of ["fed", "ss", "med", "state", "other", "erSs", "erMed", "futa", "suta", "erOther"]) row[f] = Math.abs(row[f]);
    if (row.gross < 0) { problems.push(`${label}: negative gross pay; file a reversal by hand.`); return; }
    const deducted = row.fed + row.ss + row.med + row.state + row.other;
    if (row.net !== row.gross - deducted) { problems.push(`${label} (${row.date}${row.employee ? ", " + row.employee : ""}): net pay ${(row.net / 100).toFixed(2)} is not gross ${(row.gross / 100).toFixed(2)} less deductions ${(deducted / 100).toFixed(2)}; row left out.`); return; }
    const run = byDate.get(row.date) ?? { id: `PR-${row.date}`, date: row.date, employees: 0, gross: 0, net: 0, fed: 0, ss: 0, med: 0, state: 0, other: 0, erSs: 0, erMed: 0, futa: 0, suta: 0, erOther: 0 };
    run.employees += 1;
    if (row.employee) (run.people ??= []).push({ employee: row.employee, gross: row.gross, fed: row.fed, ss: row.ss, med: row.med, erMed: row.erMed, state: row.state, other: row.other, erSs: row.erSs, futa: row.futa });
    for (const f of ["gross", "net", "fed", "ss", "med", "state", "other", "erSs", "erMed", "futa", "suta", "erOther"]) run[f] += row[f];
    byDate.set(row.date, run);
  });
  const runs = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  return { runs, problems, notes };
}

export const employerCost = (r) => r.erSs + r.erMed + r.futa + r.suta + r.erOther;
const clone = (x) => JSON.parse(JSON.stringify(x));

// Add runs to the books. A pay date already in the register is skipped, so the
// same report twice changes nothing.
export function addPayroll(booksIn, text) {
  const { runs, problems } = readPayrollRegister(text);
  const books = clone(booksIn);
  if (!books.accounts.some((a) => a.code === WAGES)) throw new Error(`No account ${WAGES} (wages) in the chart of accounts.`);
  if (!books.accounts.some((a) => a.code === LIABILITY)) throw new Error(`No account ${LIABILITY} (payroll liabilities) in the chart of accounts.`);
  if (!books.accounts.some((a) => a.code === PAYROLL_TAX)) {
    books.accounts.push({ code: PAYROLL_TAX, name: "Payroll taxes and benefits", type: "expense" });
    books.accounts.sort((x, y) => x.code.localeCompare(y.code));
  }
  books.payroll ??= [];
  const have = new Set(books.payroll.map((r) => r.id));
  const added = [], skipped = [];
  for (const r of runs) {
    if (books.lockedThrough && r.date <= books.lockedThrough) { problems.push(`${r.id}: in the period locked through ${books.lockedThrough}; left out.`); continue; }
    if (have.has(r.id)) { skipped.push(r.id); continue; }
    books.payroll.push(r); added.push(r.id);
  }
  books.payroll.sort((a, b) => a.date.localeCompare(b.date));
  return { books, added, skipped, problems };
}

export function payrollEntries(books) {
  return (books.payroll ?? []).map((r) => {
    const er = employerCost(r);
    const lines = [{ account: WAGES, debit: r.gross, credit: 0 }];
    if (er) lines.push({ account: PAYROLL_TAX, debit: er, credit: 0 });
    lines.push({ account: LIABILITY, debit: 0, credit: r.gross + er });
    return { id: r.id, date: r.date, memo: `Payroll ${r.date}, ${r.employees} employee${r.employees === 1 ? "" : "s"}`, source: "payroll", lines };
  }).filter((e) => e.lines.some((l) => l.debit || l.credit));
}

const addDays = (d, n) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
const gap = (a, b) => Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 864e5;
const monthEnd = (d) => { const y = +d.slice(0, 4), m = +d.slice(5, 7); return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); };
const OPEN = new Set(["new", "review", "auto"]);

// What each run should have paid out of the bank.
export const federalDeposit = (r) => r.fed + r.ss + r.med + r.erSs + r.erMed;

// Find the bank outflows that paid each run. Nothing is posted by `plan`.
// -> { matched: [{ run, kind, amount, line, lineDate, desc, ambiguous }], unmatched: [{ run, kind, amount, why }] }
export function planPayroll(books) {
  const taken = new Set();
  const matched = [], unmatched = [];
  const free = () => books.transactions.filter((t) => t.cents < 0 && OPEN.has(t.status) && !taken.has(t.id));
  const find = (amount, from, to, near) => {
    if (!amount) return null;
    const c = free().filter((t) => -t.cents === amount && t.date >= from && t.date <= to).sort((a, b) => gap(a.date, near) - gap(b.date, near) || a.id.localeCompare(b.id));
    return c.length ? { line: c[0], ambiguous: c.length > 1 && gap(c[1].date, near) === gap(c[0].date, near) } : null;
  };
  const note = (label, run, kind, amount, hit, why) => {
    if (hit) { taken.add(hit.line.id); matched.push({ run, kind, amount, line: hit.line.id, lineDate: hit.line.date, desc: hit.line.desc, ambiguous: hit.ambiguous }); }
    else unmatched.push({ run, kind, amount, why });
  };
  const runs = books.payroll ?? [];
  for (const r of runs) {
    note("net", r.id, "net pay", r.net, find(r.net, addDays(r.date, -3), addDays(r.date, 5), r.date), `no unfiled bank outflow of ${(r.net / 100).toFixed(2)} from 3 days before to 5 days after ${r.date}`);
  }
  // Federal deposits: per run first, then a month's runs paid as one deposit.
  const fedLeft = [];
  for (const r of runs) {
    const amt = federalDeposit(r), hit = find(amt, r.date, addDays(r.date, 45), r.date);
    if (hit) note("fed", r.id, "federal deposit", amt, hit); else if (amt) fedLeft.push(r);
  }
  const months = new Map();
  for (const r of fedLeft) months.set(r.date.slice(0, 7), [...(months.get(r.date.slice(0, 7)) ?? []), r]);
  for (const [, rs] of months) {
    const amt = rs.reduce((a, r) => a + federalDeposit(r), 0), end = monthEnd(rs[0].date);
    const hit = rs.length > 1 ? find(amt, rs[0].date, addDays(end, 25), end) : null;
    const id = rs.map((r) => r.id).join("+");
    if (hit) note("fed", id, "federal deposit (month)", amt, hit);
    else for (const r of rs) unmatched.push({ run: r.id, kind: "federal deposit", amount: federalDeposit(r), why: `no unfiled bank outflow of ${(federalDeposit(r) / 100).toFixed(2)} within 45 days of ${r.date}${rs.length > 1 ? ` (nor ${(amt / 100).toFixed(2)} for the month)` : ""}` });
  }
  for (const r of runs) {
    const hit = find(r.state, r.date, addDays(r.date, 45), r.date);
    if (r.state) note("state", r.id, "state withholding", r.state, hit, `no unfiled bank outflow of ${(r.state / 100).toFixed(2)} within 45 days of ${r.date}`);
  }
  return { matched, unmatched };
}

// File every unambiguous matched line to 2300.
export function applyPayroll(books, plan, { force = false } = {}) {
  const choices = {}, skipped = [];
  for (const m of plan.matched) {
    if (m.ambiguous && !force) { skipped.push(m); continue; }
    choices[m.line] = LIABILITY;
  }
  return { books: Object.keys(choices).length ? confirm(books, choices) : books, posted: Object.keys(choices).length, skipped };
}

// Accrued, paid and still owed, from the register and the lines filed to 2300.
export function payrollSummary(books) {
  const runs = books.payroll ?? [];
  const accrued = runs.reduce((a, r) => a + r.gross + employerCost(r), 0);
  const paid = books.transactions.filter((t) => t.posted === LIABILITY && t.cents < 0 && t.status !== "review" && t.status !== "new").reduce((a, t) => a - t.cents, 0);
  return { runs: runs.length, gross: runs.reduce((a, r) => a + r.gross, 0), net: runs.reduce((a, r) => a + r.net, 0), employerCost: runs.reduce((a, r) => a + employerCost(r), 0), accrued, paid, owed: accrued - paid };
}

// Form 941 worksheet for a quarter, summed from the register.
export function form941(books, year, quarter, opts = {}) {
  if (![1, 2, 3, 4].includes(+quarter)) throw new Error("Quarter is 1 to 4.");
  const from = `${year}-${String((quarter - 1) * 3 + 1).padStart(2, "0")}-01`, to = monthEnd(`${year}-${String(quarter * 3).padStart(2, "0")}-01`);
  const rs = (books.payroll ?? []).filter((r) => r.date >= from && r.date <= to);
  const sum = (f) => rs.reduce((a, r) => a + r[f], 0);
  const out = {
    year: +year, quarter: +quarter, from, to, runs: rs.length,
    wages: sum("gross"), federalWithheld: sum("fed"),
    socialSecurityTax: sum("ss") + sum("erSs"), medicareTax: sum("med") + sum("erMed"),
    futa: sum("futa"),
  };
  out.totalTaxes = out.federalWithheld + out.socialSecurityTax + out.medicareTax;
  out.deposited = rs.reduce((a, r) => a + federalDeposit(r), 0);
  // Line 16: the liability by pay date, one figure per month of the quarter.
  // Monthly depositors fill these in; semiweekly ones use Schedule B instead.
  out.monthlyLiability = [0, 1, 2].map((i) => {
    const m = `${year}-${String((quarter - 1) * 3 + i + 1).padStart(2, "0")}`;
    return rs.filter((r) => r.date.startsWith(m)).reduce((a, r) => a + federalDeposit(r), 0);
  });
  // Schedule B (semiweekly depositors): the same liability by day of the
  // month the wages were paid, one figure per pay date, with each month's total.
  out.scheduleB = [0, 1, 2].map((i) => {
    const m = `${year}-${String((quarter - 1) * 3 + i + 1).padStart(2, "0")}`;
    const days = new Map();
    for (const r of rs.filter((x) => x.date.startsWith(m))) days.set(+r.date.slice(8, 10), (days.get(+r.date.slice(8, 10)) ?? 0) + federalDeposit(r));
    return { month: m, days: [...days].sort((a, b) => a[0] - b[0]).map(([day, cents]) => ({ day, cents })), total: out.monthlyLiability[i] };
  });
  // Line 13 against the total: pass the amount deposited (cents) to get the
  // balance due (line 14) or overpayment (line 15).
  if (opts.depositedCents != null) {
    out.depositsMade = opts.depositedCents;
    const diff = out.totalTaxes - opts.depositedCents;
    if (diff > 0) out.balanceDue = diff; else if (diff < 0) out.overpayment = -diff;
  }
  out.warnings = [];
  // 6.2% social security and 1.45% medicare, each side. Off by more than a
  // cent per run means a wage over the base, a pre-tax benefit or a typo.
  // Rows by employee are checked against the year's social security wage
  // base: tax stops once an employee's year-to-date wages pass it.
  const base = SS_WAGE_BASE[year];
  const ytd = new Map(), medYtd = new Map();
  let ssWages = 0, addlWages = 0, allPeople = rs.length > 0;
  for (const r of (books.payroll ?? []).filter((x) => x.date >= `${year}-01-01` && x.date <= to)) {
    const inQ = r.date >= from;
    const money = (c) => (c / 100).toFixed(2);
    let ssExpected = null, medExpected = null;
    if (r.people) {
      medExpected = 0;
      for (const p of r.people) {
        const before = medYtd.get(p.employee) ?? 0;
        const over = Math.max(0, p.gross - Math.max(0, ADDL_MEDICARE_THRESHOLD - before));
        medYtd.set(p.employee, before + p.gross);
        const want = Math.round(p.gross * 0.0145) + Math.round(over * 0.009);
        medExpected += want;
        if (inQ) {
          addlWages += over;
          if (Math.abs(p.med - want) > 1 || Math.abs(p.erMed - Math.round(p.gross * 0.0145)) > 1) out.warnings.push(`${r.id}, ${p.employee}: medicare ${money(p.med)} withheld and ${money(p.erMed)} employer; 1.45% of ${money(p.gross)} plus 0.9% additional Medicare tax on ${money(over)} above $200,000 (${money(before)} paid earlier in the year) is ${money(want)} withheld, ${money(Math.round(p.gross * 0.0145))} employer. The employer share has no additional tax.`);
        }
      }
    }
    if (r.people && base) {
      ssExpected = 0;
      for (const p of r.people) {
        const before = ytd.get(p.employee) ?? 0;
        const taxable = Math.max(0, Math.min(p.gross, base - before));
        ytd.set(p.employee, before + p.gross);
        const want = Math.round(taxable * 0.062);
        ssExpected += want;
        if (inQ) {
          ssWages += taxable;
          if (Math.abs(p.ss - want) > 1 || Math.abs(p.erSs - want) > 1) out.warnings.push(`${r.id}, ${p.employee}: social security ${money(p.ss)} withheld and ${money(p.erSs)} employer, 6.2% of ${money(taxable)} taxable wages (${year} base ${money(base)}, ${money(before)} paid earlier in the year) is ${money(want)}. A pre-tax benefit can explain it; otherwise check the provider.`);
        }
      }
    } else if (inQ) allPeople = false;
    if (!inQ) continue;
    const ss = ssExpected ?? Math.round(r.gross * 0.062), med = Math.round(r.gross * 0.0145);
    if (medExpected !== null) continue;
    const tol = r.employees + 1;
    if (ssExpected === null && (Math.abs(r.ss - ss) > tol || Math.abs(r.erSs - ss) > tol)) out.warnings.push(`${r.id}: social security ${money(r.ss)} withheld and ${money(r.erSs)} employer, 6.2% of ${money(r.gross)} is ${money(ss)}. Wages over the annual base or pre-tax benefits can explain it; otherwise check the provider.`);
    if (Math.abs(r.med - med) > tol || Math.abs(r.erMed - med) > tol) out.warnings.push(`${r.id}: medicare ${money(r.med)} withheld and ${money(r.erMed)} employer, 1.45% of ${money(r.gross)} is ${money(med)}. Pre-tax benefits or the additional Medicare tax can explain it; otherwise check the provider.`);
  }
  out.socialSecurityWages = allPeople && base ? ssWages : null;
  out.additionalMedicareWages = allPeople ? addlWages : null;
  if (out.additionalMedicareWages) out.additionalMedicareTax = Math.round(addlWages * 0.009);
  return out;
}

// Form 940 worksheet for a year, summed from the register. Rows by employee
// are checked against the $7,000 FUTA wage base at the 0.6% net rate; the
// state credit reduction, exempt payments and multi-state lines are not modelled.
// FUTA credit reduction: a state with an unpaid federal unemployment loan loses
// part of the 5.4% credit, so its employers owe extra on the same $7,000 wages.
// Only rates checked against published notices are built in (California 2025,
// 1.2%, per the DOL announcement of November 2025); for any other state or
// year pass the rate from the DOL list as `creditReduction` (percent).
export const CREDIT_REDUCTION = { CA: { 2025: 1.2 } };

export function form940(books, year, opts = {}) {
  const from = `${year}-01-01`, to = `${year}-12-31`;
  const rs = (books.payroll ?? []).filter((r) => r.date >= from && r.date <= to);
  const money = (c) => (c / 100).toFixed(2);
  const out = { year: +year, from, to, runs: rs.length, wages: 0, futaWages: null, futa: 0, quarters: [0, 0, 0, 0], warnings: [] };
  const ytd = new Map();
  let futaWages = 0, allPeople = rs.length > 0;
  for (const r of rs) {
    out.wages += r.gross; out.futa += r.futa;
    out.quarters[Math.floor((+r.date.slice(5, 7) - 1) / 3)] += r.futa;
    if (!r.people) { allPeople = false; continue; }
    for (const p of r.people) {
      const before = ytd.get(p.employee) ?? 0;
      const taxable = Math.max(0, Math.min(p.gross, FUTA_WAGE_BASE - before));
      ytd.set(p.employee, before + p.gross);
      futaWages += taxable;
      const want = Math.round(taxable * 0.006);
      if (Math.abs(p.futa - want) > 1) out.warnings.push(`${r.id}, ${p.employee}: FUTA ${money(p.futa)}, 0.6% of ${money(taxable)} taxable wages (base ${money(FUTA_WAGE_BASE)}, ${money(before)} paid earlier in the year) is ${money(want)}. Check the provider, or the state credit.`);
    }
  }
  if (allPeople) out.futaWages = futaWages;
  out.exemptOverBase = allPeople ? out.wages - futaWages : null;
  out.computed = allPeople ? Math.round(futaWages * 0.006) : null;
  // Deposit quarterly once the running liability passes $500; else it rides with the next quarter or the return.
  let carry = 0;
  out.deposits = out.quarters.map((q) => { carry += q; if (carry > 50000) { const d = carry; carry = 0; return d; } return 0; });
  out.dueWithReturn = carry;
  let pct = opts.creditReduction;
  if (pct == null && opts.state) {
    pct = CREDIT_REDUCTION[String(opts.state).toUpperCase()]?.[year];
    if (pct == null) out.warnings.push(`No built-in credit reduction for ${opts.state} in ${year}; pass the rate from the DOL list (--credit-reduction PCT).`);
  }
  if (pct != null) {
    out.creditReductionPct = +pct;
    if (allPeople) out.creditReduction = Math.round(futaWages * pct / 100);
    else { out.creditReduction = null; out.warnings.push("Credit reduction needs one row per employee (taxable FUTA wages); not computed."); }
    if (out.creditReduction != null) out.balanceDue = out.creditReduction;
  }
  return out;
}

// W-2 box figures per employee for a year, from a register with one row per
// employee. Box 1 is shown as gross wages: the register does not say which
// "other deductions" are pre-tax (401(k), health premiums reduce box 1), so
// that is flagged, not guessed. Boxes 3 and 4 stop at the year's Social
// Security wage base. Registers written before 2026-10-22 lack the per-person
// withholding and must be re-imported (delete the runs first); runs without
// names are listed. Hand-made registers only; not payroll or tax advice.
export function w2Summary(books, year) {
  const rs = (books.payroll ?? []).filter((r) => r.date >= `${year}-01-01` && r.date <= `${year}-12-31`);
  const base = SS_WAGE_BASE[year], money = (c) => (c / 100).toFixed(2);
  const by = new Map(), warnings = [];
  const unnamed = rs.filter((r) => !r.people).length;
  if (unnamed) warnings.push(`${unnamed} run${unnamed === 1 ? "" : "s"} in ${year} have no employee names (company totals); their wages are not in any W-2 row.`);
  for (const r of rs) for (const p of r.people ?? []) {
    if (p.fed === undefined) { warnings.push(`${r.id}, ${p.employee}: stored before withholding was kept per employee; re-import the register.`); continue; }
    const e = by.get(p.employee) ?? { employee: p.employee, box1: 0, box2: 0, box3: 0, box4: 0, box5: 0, box6: 0, state: 0, otherDeductions: 0, runs: 0 };
    const before = e.box1;
    e.box1 += p.gross; e.box5 += p.gross; e.box2 += p.fed; e.box4 += p.ss; e.box6 += p.med; e.state += p.state; e.otherDeductions += p.other; e.runs += 1;
    e.box3 += base ? Math.max(0, Math.min(p.gross, base - before)) : p.gross;
    by.set(p.employee, e);
  }
  const employees = [...by.values()].sort((a, b) => a.employee.localeCompare(b.employee));
  for (const e of employees) {
    if (e.otherDeductions) warnings.push(`${e.employee}: ${money(e.otherDeductions)} of other deductions. If any are pre-tax (401(k), health premiums), box 1 is lower than the ${money(e.box1)} shown.`);
    if (base && e.box3 < e.box1 && Math.abs(e.box4 - Math.round(e.box3 * 0.062)) > e.runs) warnings.push(`${e.employee}: box 4 ${money(e.box4)} is not 6.2% of box 3 ${money(e.box3)}; check the provider.`);
  }
  if (!base) warnings.push(`No Social Security wage base for ${year}; box 3 is shown as all wages.`);
  return { year: +year, employees, warnings };
}

// Year-end tie-out: the four quarters' Form 941 figures against the W-2 totals
// (what Form W-3 carries). The IRS compares the two and sends a notice when
// they differ, so a wage, withholding or tax figure that disagrees is worth
// finding before filing. Needs one row per employee; rounding of a cent per
// person-run is tolerated. Hand-made registers only; not payroll or tax advice.
export function reconcile941W2(books, year) {
  const qs = [1, 2, 3, 4].map((q) => form941(books, year, q));
  const w2 = w2Summary(books, year);
  const rs = (books.payroll ?? []).filter((r) => r.date >= `${year}-01-01` && r.date <= `${year}-12-31`);
  const warnings = [...w2.warnings.filter((x) => /no employee names/.test(x))];
  const tol = rs.reduce((a, r) => a + (r.people?.length ?? r.employees ?? 1), 0) + 1;
  const sumQ = (f) => qs.reduce((a, q) => a + (q[f] ?? 0), 0);
  const sumW = (f) => w2.employees.reduce((a, e) => a + e[f], 0);
  const ssWages = qs.every((q) => q.socialSecurityWages != null) ? sumQ("socialSecurityWages") : null;
  const rows = [
    { label: "Wages: 941 line 2 against W-2 box 1", f941: sumQ("wages"), w2: sumW("box1"), note: "box 1 is lower by any pre-tax 401(k) or health deductions" },
    { label: "Income tax withheld: 941 line 3 against box 2", f941: sumQ("federalWithheld"), w2: sumW("box2") },
    ...(ssWages == null ? [] : [{ label: "Social security wages: 941 line 5a against box 3", f941: ssWages, w2: sumW("box3") }]),
    { label: "Social security tax: 941 line 5a against 2 x box 4", f941: sumQ("socialSecurityTax"), w2: 2 * sumW("box4") },
    { label: "Medicare wages: 941 line 5c against box 5", f941: sumQ("wages"), w2: sumW("box5") },
    { label: "Medicare tax: 941 lines 5c and 5d against 2 x box 6 (less the employer's missing additional tax)", f941: sumQ("medicareTax") + sumQ("additionalMedicareTax"), w2: 2 * sumW("box6") - sumQ("additionalMedicareTax") },
  ];
  for (const r of rows) {
    r.diff = r.f941 - r.w2;
    const strict = !r.note;
    r.ok = strict ? Math.abs(r.diff) <= tol : r.diff >= -tol;
    if (!r.ok) warnings.push(`${r.label}: 941 total ${(r.f941 / 100).toFixed(2)}, W-2 total ${(r.w2 / 100).toFixed(2)}, difference ${(r.diff / 100).toFixed(2)}.`);
  }
  return { year: +year, employees: w2.employees.length, rows, warnings };
}
