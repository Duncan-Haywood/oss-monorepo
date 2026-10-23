// Preparer pack: one folder of files for a bookkeeper or tax preparer, for one
// calendar year. It only collects what the other modules already work out
// (trial balance, profit and loss, balance sheet, journal, Schedule C lines,
// self-employment tax, 1099-NEC list, payroll worksheets, sales tax, tax
// depreciation, mileage, close checks) and says in INDEX.txt which files exist,
// which were left out because there is nothing behind them, and what to look at
// first. A worksheet bundle, not a return: nothing here is filed or advice.
// taxPack(books, year) -> { files: { name: text }, skipped: [{ file, why }], notes: [string] }

import { journal, closeChecks, exportJournal, salesTax } from "./engine.mjs";
import { trialBalance, profitAndLoss, balanceSheet } from "./ledger.mjs";
import { scheduleE, scheduleECsv } from "./rental.mjs";
import { scheduleC, scheduleCCsv, selfEmployment, contractors1099, contractors1099Csv, nec1099FilingCsv } from "./taxforms.mjs";
import { form941, form940 } from "./payroll.mjs";
import { taxDepreciation, taxDepreciationCsv } from "./taxdepr.mjs";
import { mileageDeduction } from "./deductions.mjs";

const d = (c) => (c / 100).toFixed(2);
const q = (s) => (/[",\n]/.test(String(s)) ? `"${String(s).replace(/"/g, '""')}"` : String(s));
const csv = (rows) => rows.map((r) => r.map(q).join(",")).join("\n") + "\n";

export function taxPack(books, year) {
  year = Number(year);
  if (!Number.isInteger(year) || year < 2000 || year > 2100) throw new Error("Give a four-digit year.");
  const from = `${year}-01-01`, to = `${year}-12-31`;
  const entries = journal(books);
  const files = {}, skipped = [], notes = [];
  const add = (name, text) => { files[name] = text; };
  const skip = (file, why) => skipped.push({ file, why });

  const tb = trialBalance(entries, books.accounts, { to });
  add("trial_balance.csv", csv([["Code", "Account", "Type", "Debit", "Credit"], ...tb.rows.map((r) => [r.code, r.name, r.type, d(r.debit), d(r.credit)]), ["", "Total", "", d(tb.debit), d(tb.credit)]]));
  if (!tb.balanced) notes.push("The trial balance does not balance; fix that before anyone relies on the rest.");

  const pl = profitAndLoss(entries, books.accounts, { from, to });
  const plRows = [["Section", "Code", "Account", "Total", ...pl.months]];
  for (const [sec, list] of [["Income", pl.income], ["Expense", pl.expense]]) for (const r of list) plRows.push([sec, r.code, r.name, d(r.total), ...r.months.map(d)]);
  plRows.push(["", "", "Net profit", d(pl.net)]);
  add("profit_and_loss.csv", csv(plRows));

  const bs = balanceSheet(entries, books.accounts, { to });
  const bsRows = [["Section", "Code", "Account", "Amount"]];
  for (const [sec, list] of [["Assets", bs.assets], ["Liabilities", bs.liabilities], ["Equity", bs.equity]]) for (const r of list) bsRows.push([sec, r.code, r.name, d(r.amount)]);
  bsRows.push(["Equity", "", "Current earnings", d(bs.currentEarnings)]);
  add("balance_sheet.csv", csv(bsRows));

  add("journal.csv", exportJournal({ ...books }, "csv"));

  const sc = scheduleC(books, { from, to, year });
  add("schedule_c.csv", scheduleCCsv(sc));
  if ((books.properties ?? []).length) {
    const sched = scheduleE(books, { from, to });
    add("schedule_e.csv", scheduleECsv(sched));
    for (const w of sched.warnings.slice(0, 3)) notes.push(`Schedule E: ${w}`);
  }
  const se = selfEmployment(Math.max(0, sc.netProfit), { year });
  add("self_employment.csv", csv([["Measure", "Amount"], ...Object.entries(se).filter(([, v]) => typeof v === "number").map(([k, v]) => [k, Number.isInteger(v) && Math.abs(v) > 1000 ? d(v) : v])]));
  for (const u of sc.unmapped ?? []) notes.push(`Account ${u.code} ${u.name} (${d(u.cents)}) has no Schedule C line and went to 27a.`);

  const nec = contractors1099(books, { year });
  if (nec.payees.length) {
    add("contractors_1099.csv", contractors1099Csv(nec));
    if (nec.payees.some((p) => p.over)) add("1099_nec_filing.csv", nec1099FilingCsv(nec));
    const missing = nec.payees.filter((p) => p.over && !p.w9);
    if (missing.length) notes.push(`${missing.length} contractor(s) over the 1099-NEC line have no W-9 on file: ${missing.map((p) => p.name).join(", ")}.`);
  } else skip("contractors_1099.csv", "no contract labor paid this year");

  const runs = (books.payroll ?? []).filter((r) => r.date >= from && r.date <= to);
  if (runs.length) {
    const rows = [["Form", "Period", "Wages", "Federal withheld", "Social Security tax", "Medicare tax", "FUTA", "Total taxes", "Deposited"]];
    for (let qn = 1; qn <= 4; qn++) { const f = form941(books, year, qn); if (f.runs) rows.push(["941", `${year} Q${qn}`, d(f.wages), d(f.federalWithheld), d(f.socialSecurityTax), d(f.medicareTax), d(f.futa), d(f.totalTaxes), d(f.deposited)]); }
    const f0 = form940(books, year);
    rows.push(["940", String(year), d(f0.wages ?? 0), "", "", "", d(f0.futa ?? f0.futaTax ?? 0), "", ""]);
    add("payroll_worksheets.csv", csv(rows));
  } else skip("payroll_worksheets.csv", "no payroll runs this year");

  const st = salesTax(books, { from, to });
  if (st.months.length) add("sales_tax.csv", csv([["Month", "Sales", "Collected", "Credited", "Remitted"], ...st.months.map((m) => [m.month, d(m.sales), d(m.collected), d(m.credited), d(m.remitted)]), ["Owed at year end", "", "", "", d(st.owed)]]));
  else skip("sales_tax.csv", "nothing booked to the sales tax account");

  const dep = taxDepreciation(books, year);
  if (dep.rows.length) add("tax_depreciation.csv", taxDepreciationCsv(dep)); else skip("tax_depreciation.csv", "no assets with a tax class");

  const mi = mileageDeduction(books, year);
  if (mi.trips.length) add("mileage.csv", csv([["Date", "Miles", "Purpose", "From", "To"], ...mi.trips.map((t) => [t.date, t.miles, t.purpose, t.from ?? "", t.to ?? ""]), ["Total", mi.miles, `at ${mi.rate / 100} per mile = ${d(mi.cents)}`]]));
  else skip("mileage.csv", "no trips logged");

  const checks = closeChecks(books);
  add("close_checks.txt", checks.map((c) => `[${c.severity}] ${c.message}`).join("\n") + "\n");
  for (const c of checks) if (c.severity === "error" || c.severity === "warn") notes.push(`Close check: ${c.message}`);

  const lines = [`PREPARER PACK ${year}: ${books.name ?? "books"}`, `Period ${from} to ${to}. Net profit ${d(pl.net)}; Schedule C line 31 ${d(sc.netProfit)}.`, "", "FILES"];
  for (const f of Object.keys(files)) lines.push(`  ${f}`);
  if (skipped.length) lines.push("", "LEFT OUT (nothing behind them)", ...skipped.map((s) => `  ${s.file}: ${s.why}`));
  if (notes.length) lines.push("", "LOOK AT FIRST", ...notes.map((n) => `  - ${n}`));
  lines.push("", "Worksheets from the books as filed, not a return and not tax or accounting advice. Check them before you rely on them.");
  files["INDEX.txt"] = lines.join("\n") + "\n";
  return { files, skipped, notes };
}
