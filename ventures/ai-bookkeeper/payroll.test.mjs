import { test } from "node:test";
import assert from "node:assert/strict";
import { newBooks, importStatement, journal, confirm } from "./engine.mjs";
import { balances } from "./ledger.mjs";
import { readPayrollRegister, addPayroll, planPayroll, applyPayroll, payrollSummary, form941, form940 } from "./payroll.mjs";

const HEAD = "Pay Date,Employee,Gross Pay,Federal Income Tax,Social Security,Medicare,State Income Tax,Other Deductions,Net Pay,Employer Social Security,Employer Medicare,FUTA,SUTA";
// 2,000.00 gross: SS 124.00, Medicare 29.00 each side.
const REG = `${HEAD}
2026-03-13,Ana,2000.00,150.00,124.00,29.00,60.00,0.00,1637.00,124.00,29.00,12.00,20.00
2026-03-13,Ben,1000.00,60.00,62.00,14.50,30.00,50.00,783.50,62.00,14.50,6.00,10.00
2026-03-27,Ana,2000.00,150.00,124.00,29.00,60.00,0.00,1637.00,124.00,29.00,12.00,20.00
`;
// Run 1: net 2,420.50; federal 150+60+186+43.5+186+43.5 = 669.00; state 90.00.
// Run 2: net 1,637.00; federal 150+124+29+124+29 = 456.00; state 60.00. Month's federal: 1,125.00.
const BANK = [
  ["2026-03-13", "GUSTO NET PAY", "-2420.50"],
  ["2026-03-27", "GUSTO NET PAY", "-1637.00"],
  ["2026-04-15", "IRS USATAXPYMT", "-1125.00"],
  ["2026-04-15", "STATE DOR WITHHOLDING", "-150.00"],
  ["2026-03-14", "Coffee", "-4.00"],
];
const withBank = () => importStatement(newBooks(), "Date,Description,Amount\n" + BANK.map((r) => r.join(",")).join("\n") + "\n", "1000").books;

test("rows group by pay date and net must equal gross less deductions", () => {
  const { runs, problems } = readPayrollRegister(REG);
  assert.deepEqual(problems, []);
  assert.equal(runs.length, 2);
  assert.equal(runs[0].employees, 2);
  assert.equal(runs[0].gross, 300000);
  assert.equal(runs[0].net, 242050);
  const bad = readPayrollRegister(REG.replace("1637.00,124.00,29.00,12.00,20.00\n2026-03-13,Ben", "1600.00,124.00,29.00,12.00,20.00\n2026-03-13,Ben"));
  assert.equal(bad.runs[0].employees, 1);
  assert.match(bad.problems[0], /net pay 1600.00 is not gross 2000.00/);
});

test("a register without a net pay column is refused", () => {
  assert.throws(() => readPayrollRegister("Pay Date,Gross Pay\n2026-01-01,100.00\n"), /net pay column/);
});

test("a run books wages and employer cost against payroll liabilities, balanced", () => {
  const { books, added } = addPayroll(newBooks(), REG);
  assert.equal(added.length, 2);
  const j = journal(books);
  const run1 = j.find((e) => e.id === "PR-2026-03-13");
  const sum = (k) => run1.lines.reduce((a, l) => a + l[k], 0);
  assert.equal(sum("debit"), sum("credit"));
  const b = balances(j);
  assert.equal(b.get("6150"), 500000);
  // employer cost: run 1 = 124+29+12+20 + 62+14.5+6+10 = 277.50; run 2 = 185.00
  assert.equal(b.get("6155"), 27750 + 18500);
  assert.equal(b.get("2300"), -(500000 + 27750 + 18500));
});

test("the same report twice changes nothing", () => {
  const once = addPayroll(newBooks(), REG).books;
  const twice = addPayroll(once, REG);
  assert.deepEqual(twice.added, []);
  assert.equal(twice.skipped.length, 2);
  assert.equal(twice.books.payroll.length, 2);
});

test("bank lines are matched: net pay, a month's federal deposit as one, state", () => {
  const { books } = addPayroll(withBank(), REG);
  const plan = planPayroll(books);
  assert.equal(plan.matched.filter((m) => m.kind === "net pay").length, 2);
  assert.equal(plan.matched.find((m) => m.kind === "federal deposit (month)").amount, 112500);
  // the second run's state withholding (60.00) has no line; the first (90.00) not either: one 150.00 line pays both
  assert.ok(plan.unmatched.every((u) => u.kind === "state withholding"));
});

test("apply files the lines to 2300 and the liability shows what is still owed", () => {
  const { books } = addPayroll(withBank(), REG);
  const r = applyPayroll(books, planPayroll(books));
  assert.equal(r.posted, 3);
  const s = payrollSummary(r.books);
  assert.equal(s.accrued, 500000 + 46250);
  assert.equal(s.paid, 242050 + 163700 + 112500);
  assert.equal(s.owed, s.accrued - s.paid);
  const b = balances(journal(r.books));
  assert.equal(b.get("2300"), -s.owed);
  assert.equal(b.get("1000"), -(242050 + 163700 + 112500));
});

test("a net pay line already filed is not matched twice", () => {
  const { books } = addPayroll(withBank(), REG);
  const once = applyPayroll(books, planPayroll(books)).books;
  const again = planPayroll(once);
  assert.equal(again.matched.length, 0);
});

test("form 941 sums the quarter and flags a social security rate that is off", () => {
  const { books } = addPayroll(newBooks(), REG);
  const f = form941(books, 2026, 1);
  assert.equal(f.runs, 2);
  assert.equal(f.wages, 500000);
  assert.equal(f.federalWithheld, 36000);
  assert.deepEqual(f.warnings, []);
  assert.equal(f.totalTaxes, f.federalWithheld + f.socialSecurityTax + f.medicareTax);
  assert.equal(form941(books, 2026, 2).runs, 0);
  const off = addPayroll(newBooks(), `${HEAD}\n2026-03-27,Ana,2000.00,150.00,100.00,29.00,60.00,0.00,1661.00,124.00,29.00,12.00,20.00\n`).books;
  assert.match(form941(off, 2026, 1).warnings.join("\n"), /social security/);
});

test("form 941 stops social security at the wage base, per employee", () => {
  // Ana is paid 100,000.00 a run; 2026 base is 184,500.00. Run 1 taxes all of it, run 2 taxes 84,500.00, run 3 none.
  const row = (d, ss) => `${d},Ana,100000.00,0.00,${ss},1450.00,0.00,0.00,${(100000 - ss / 1 - 1450).toFixed(2)},${ss},1450.00,0.00,0.00`;
  const reg = `${HEAD}\n${row("2026-01-15", "6200.00")}\n${row("2026-02-15", "5239.00")}\n${row("2026-03-15", "0.00")}\n`;
  const { books } = addPayroll(newBooks(), reg);
  const f = form941(books, 2026, 1);
  assert.deepEqual(f.warnings, []);
  assert.equal(f.socialSecurityWages, 18450000);
  assert.equal(f.socialSecurityTax, 2 * (620000 + 523900));
  // Withholding the full 6.2% in run 3 is flagged.
  const bad = addPayroll(newBooks(), `${HEAD}\n${row("2026-01-15", "6200.00")}\n${row("2026-02-15", "5239.00")}\n${row("2026-03-15", "6200.00")}\n`).books;
  assert.match(form941(bad, 2026, 1).warnings.join("\n"), /Ana.*taxable wages/);
  // Wages from an earlier quarter count toward the base.
  assert.equal(form941(books, 2026, 2).runs, 0);
});

test("form 940 caps FUTA wages at 7,000 per employee and flags a rate that ignores the cap", () => {
  const row = (d, futa) => `${d},Ana,5000.00,0.00,0.00,0.00,0.00,0.00,5000.00,0.00,0.00,${futa},0.00`;
  const reg = `${HEAD}\n${row("2026-01-15", "30.00")}\n${row("2026-04-15", "12.00")}\n${row("2026-07-15", "0.00")}\n`;
  const { books } = addPayroll(newBooks(), reg);
  const f = form940(books, 2026);
  assert.deepEqual(f.warnings, []);
  assert.equal(f.wages, 1500000);
  assert.equal(f.futaWages, 700000);
  assert.equal(f.futa, 4200);
  assert.equal(f.computed, 4200);
  assert.deepEqual(f.quarters, [3000, 1200, 0, 0]);
  assert.equal(f.dueWithReturn, 4200);
  const bad = addPayroll(newBooks(), `${HEAD}\n${row("2026-01-15", "30.00")}\n${row("2026-04-15", "30.00")}\n`).books;
  assert.match(form940(bad, 2026).warnings.join("\n"), /Ana.*taxable wages/);
  assert.equal(form940(books, 2025).runs, 0);
});

test("form 940 asks for a deposit once the running FUTA passes 500", () => {
  // 15 people each over the base: 42.00 FUTA each, 630.00 in Q1.
  const rows = Array.from({ length: 15 }, (_, i) => `2026-02-01,P${i},100000.00,0.00,0.00,0.00,0.00,0.00,100000.00,0.00,0.00,42.00,0.00`);
  const f = form940(addPayroll(newBooks(), `${HEAD}\n${rows.join("\n")}\n`).books, 2026);
  assert.deepEqual(f.warnings, []);
  assert.equal(f.futa, 63000);
  assert.deepEqual(f.deposits, [63000, 0, 0, 0]);
  assert.equal(f.dueWithReturn, 0);
});

test("the bank line nearest the pay date wins when two have the same amount", () => {
  const bank = importStatement(newBooks(), "Date,Description,Amount\n2026-03-11,GUSTO NET PAY,-2420.50\n2026-03-14,GUSTO NET PAY,-2420.50\n", "1000").books;
  const { books } = addPayroll(bank, REG);
  const m = planPayroll(books).matched.find((x) => x.kind === "net pay" && x.amount === 242050);
  assert.equal(m.lineDate, "2026-03-14");
  assert.equal(m.ambiguous, false);
});

test("form 941 takes quarters 1 to 4 only", () => {
  const { books } = addPayroll(newBooks(), REG);
  for (const q of [1, 2, 3, 4]) assert.doesNotThrow(() => form941(books, 2026, q));
  for (const q of [0, 5]) assert.throws(() => form941(books, 2026, q), /Quarter is 1 to 4/);
});

test("form 940 reports the wages over the FUTA base as exempt", () => {
  const row = (d, futa) => `${d},Ana,5000.00,0.00,0.00,0.00,0.00,0.00,5000.00,0.00,0.00,${futa},0.00`;
  const { books } = addPayroll(newBooks(), `${HEAD}\n${row("2026-01-15", "30.00")}\n${row("2026-04-15", "12.00")}\n${row("2026-07-15", "0.00")}\n`);
  assert.equal(form940(books, 2026).exemptOverBase, 800000);
});
