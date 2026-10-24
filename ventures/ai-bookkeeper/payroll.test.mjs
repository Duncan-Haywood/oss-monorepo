import { test } from "node:test";
import assert from "node:assert/strict";
import { newBooks, importStatement, journal, confirm } from "./engine.mjs";
import { balances } from "./ledger.mjs";
import { readPayrollRegister, addPayroll, planPayroll, applyPayroll, payrollSummary, form941, form940, w2Summary, reconcile941W2 } from "./payroll.mjs";

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
  // Run 3 also carries the 0.9% additional Medicare tax on the 100,000.00 above 200,000.00.
  const row = (d, ss, med = 1450) => `${d},Ana,100000.00,0.00,${ss},${med.toFixed(2)},0.00,0.00,${(100000 - ss - med).toFixed(2)},${ss},1450.00,0.00,0.00`;
  const reg = `${HEAD}\n${row("2026-01-15", "6200.00")}\n${row("2026-02-15", "5239.00")}\n${row("2026-03-15", "0.00", 2350)}\n`;
  const { books } = addPayroll(newBooks(), reg);
  const f = form941(books, 2026, 1);
  assert.deepEqual(f.warnings, []);
  assert.equal(f.socialSecurityWages, 18450000);
  assert.equal(f.socialSecurityTax, 2 * (620000 + 523900));
  assert.equal(f.additionalMedicareWages, 10000000);
  assert.equal(f.additionalMedicareTax, 90000);
  // Withholding the full 6.2% in run 3 is flagged.
  const bad = addPayroll(newBooks(), `${HEAD}\n${row("2026-01-15", "6200.00")}\n${row("2026-02-15", "5239.00")}\n${row("2026-03-15", "6200.00", 2350)}\n`).books;
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

test("form 941 flags additional Medicare tax missing, or charged to the employer", () => {
  const row = (d, med, erMed) => `${d},Ana,150000.00,0.00,0.00,${med},0.00,0.00,${(150000 - med).toFixed(2)},0.00,${erMed},0.00,0.00`;
  const reg = (m2, e2) => `${HEAD}\n${row("2026-01-15", 2175, 2175)}\n${row("2026-02-15", m2, e2)}\n`;
  // Run 2 crosses 200,000.00 with 100,000.00 over: 1.45% of 150,000.00 is 2,175.00 plus 900.00.
  const ok = form941(addPayroll(newBooks(), reg(3075, 2175)).books, 2026, 1);
  assert.deepEqual(ok.warnings.filter((w) => /medicare/i.test(w)), []);
  assert.equal(ok.additionalMedicareWages, 10000000 / 2 + 5000000);
  assert.equal(ok.additionalMedicareTax, 90000 / 2 + 45000);
  assert.match(form941(addPayroll(newBooks(), reg(2175, 2175)).books, 2026, 1).warnings.join("\n"), /additional Medicare tax/);
  assert.match(form941(addPayroll(newBooks(), reg(3075, 3075)).books, 2026, 1).warnings.join("\n"), /employer share has no additional/);
  // Under 200,000.00 there is nothing extra.
  const small = form941(addPayroll(newBooks(), `${HEAD}\n${row("2026-01-15", 2175, 2175)}\n`).books, 2026, 1);
  assert.equal(small.additionalMedicareTax, undefined);
});

test("w-2 summary adds up each employee's year and caps box 3 at the wage base", () => {
  const { books } = addPayroll(newBooks(), REG);
  const w = w2Summary(books, 2026);
  const ana = w.employees.find((e) => e.employee === "Ana"), ben = w.employees.find((e) => e.employee === "Ben");
  assert.deepEqual([ana.box1, ana.box2, ana.box3, ana.box4, ana.box5, ana.box6, ana.state], [400000, 30000, 400000, 24800, 400000, 5800, 12000]);
  assert.equal(ben.box1, 100000);
  assert.match(w.warnings.join("\n"), /Ben.*50\.00 of other deductions/);
  const row = (d, ss) => `${d},Ana,100000.00,0.00,${ss},1450.00,0.00,0.00,${(100000 - ss - 1450).toFixed(2)},${ss},1450.00,0.00,0.00`;
  const big = addPayroll(newBooks(), `${HEAD}\n${row("2026-01-15", "6200.00")}\n${row("2026-02-15", "5239.00")}\n${row("2026-03-15", "0.00")}\n`).books;
  const a = w2Summary(big, 2026).employees[0];
  assert.equal(a.box1, 30000000);
  assert.equal(a.box3, 18450000);
  assert.equal(a.box4, 1143900);
  assert.deepEqual(w2Summary(big, 2026).warnings, []);
  assert.equal(w2Summary(big, 2025).employees.length, 0);
});

test("form 940 adds the state credit reduction on taxable FUTA wages", () => {
  const row = (d) => `${d},Ana,5000.00,0.00,0.00,0.00,0.00,0.00,5000.00,0.00,0.00,42.00,0.00`;
  const { books } = addPayroll(newBooks(), `${HEAD}\n${row("2025-01-15")}\n${row("2025-04-15")}\n`);
  const ca = form940(books, 2025, { state: "ca" });
  assert.equal(ca.creditReductionPct, 1.2);
  assert.equal(ca.creditReduction, 8400); // 1.2% of 7,000.00
  assert.equal(form940(books, 2025, { creditReduction: 0.3 }).creditReduction, 2100);
  assert.equal(form940(books, 2025).creditReduction, undefined);
  const pot = form940(books, 2026, { state: "CA" });
  assert.match(pot.warnings.join("\n"), /potential credit reduction list for 2026/);
  assert.equal(pot.creditReduction, undefined);
  assert.match(form940(books, 2025, { state: "NY" }).warnings.join("\n"), /No built-in credit reduction for NY/);
});

test("form 941 splits the liability by month and finds balance due or overpayment", () => {
  const { books } = addPayroll(newBooks(), REG);
  const f = form941(books, 2026, 1);
  assert.equal(f.monthlyLiability.length, 3);
  assert.equal(f.monthlyLiability.reduce((a, b) => a + b, 0), f.deposited);
  assert.equal(f.balanceDue, undefined);
  const short = form941(books, 2026, 1, { depositedCents: f.totalTaxes - 500 });
  assert.equal(short.balanceDue, 500);
  const over = form941(books, 2026, 1, { depositedCents: f.totalTaxes + 700 });
  assert.equal(over.overpayment, 700);
  assert.equal(form941(books, 2026, 1, { depositedCents: f.totalTaxes }).balanceDue, undefined);
});

test("form 941 Schedule B lists the liability by pay day within each month", () => {
  const f = form941(addPayroll(newBooks(), REG).books, 2026, 1);
  assert.equal(f.scheduleB.length, 3);
  assert.deepEqual(f.scheduleB[2].days, [{ day: 13, cents: 66900 }, { day: 27, cents: 45600 }]);
  assert.equal(f.scheduleB[2].total, 112500);
  assert.equal(f.scheduleB[0].days.length, 0);
  assert.equal(f.scheduleB.reduce((a, m) => a + m.days.reduce((b, d) => b + d.cents, 0), 0), f.totalTaxes);
});

test("941 totals tie to W-2 totals, and a missing run in one is found", () => {
  const { books } = addPayroll(newBooks(), REG);
  const t = reconcile941W2(books, 2026);
  assert.deepEqual(t.warnings, []);
  assert.equal(t.rows[1].f941, 150 * 2 * 100 + 6000);
  assert.equal(t.rows[1].w2, t.rows[1].f941);
  const broken = structuredClone(books);
  broken.payroll[0].fed += 5000; // 941 side only
  const bad = reconcile941W2(broken, 2026);
  assert.match(bad.warnings.join("\n"), /Income tax withheld.*difference 50.00/);
});

test("a provider's Total row is skipped and a pay date printed once fills down", () => {
  const csv = `Employee,Check Date,Gross Pay,Net Pay,Federal Income Tax,Social Security,Medicare
Ann,2026-01-15,"$2,000.00","$1,747.00",$100.00,$124.00,$29.00
Bob,,"$1,000.00",$873.50,$50.00,$62.00,$14.50
Total,2026-01-15,"$3,000.00","$2,620.50",$150.00,$186.00,$43.50`;
  const { runs, problems } = readPayrollRegister(csv);
  assert.deepEqual(problems, []);
  assert.equal(runs.length, 1);
  assert.equal(runs[0].employees, 2);
  assert.equal(runs[0].gross, 300000);
});

// Header probes, 2026-10-23: layouts recalled from provider exports, hand-written rows (no real export).
test("a title block above the header, kinds of pay without a gross column, and split names are read", () => {
  const csv = `Payroll Register\nAcme LLC\nPeriod 3/1/2026-3/31/2026\n\nCheck Date,Last Name,First Name,Regular Pay,Overtime,Bonus,Federal Income Tax,Social Security,Medicare,Net Pay\n3/13/2026,Lee,Ana,"$1,800.00",150,50,150,124,29,1697\n`;
  const { runs, problems } = readPayrollRegister(csv);
  assert.deepEqual(problems, []);
  assert.equal(runs[0].gross, 200000);
  assert.equal(runs[0].net, 169700);
  assert.equal(runs[0].people[0].employee, "Ana Lee");
});

test("several columns feed one field: a 401(k) and a health plan both count as other deductions", () => {
  const csv = "Pay Date,Employee,Gross Pay,401(k),Health Insurance,Federal Income Tax,Social Security (EE),Medicare (EE),Net Pay,Social Security (ER),Medicare (ER)\n2026-03-13,Ana,2000,100,50,150,124,29,1547,124,29\n";
  const { runs, problems } = readPayrollRegister(csv);
  assert.deepEqual(problems, []);
  assert.equal(runs[0].other, 15000);
  assert.equal(runs[0].ss, 12400);
  assert.equal(runs[0].erSs, 12400);
  assert.equal(runs[0].erMed, 2900);
});

test("a reversal row with negative amounts is named as a reversal, not as a net-pay mismatch", () => {
  const csv = "Pay Date,Employee,Gross Pay,Federal Income Tax,Social Security,Medicare,Net Pay\n2026-03-20,Ana,-2000,-150,-124,-29,-1697\n";
  const { runs, problems } = readPayrollRegister(csv);
  assert.equal(runs.length, 0);
  assert.match(problems[0], /negative gross pay/);
});

test("an Additional Medicare column adds to Medicare withheld", () => {
  const csv = "Pay Date,Employee,Gross Pay,Federal Income Tax,Social Security,Medicare,Additional Medicare,Net Pay\n2026-12-11,Cy,50000.00,12000.00,0.00,725.00,225.00,37050.00\n";
  const { runs, problems } = readPayrollRegister(csv);
  assert.deepEqual(problems, []);
  assert.equal(runs[0].med, 95000);
});

test("a single Total Employee Taxes column is split by statutory rates and noted", () => {
  const csv = "Pay Date,Employee,Gross Pay,Total Employee Taxes,Net Pay\n2026-03-13,Ana,2000.00,400.00,1600.00\n";
  const { runs, problems, notes } = readPayrollRegister(csv);
  assert.deepEqual(problems, []);
  assert.equal(runs[0].ss, 12400);
  assert.equal(runs[0].med, 2900);
  assert.equal(runs[0].fed, 40000 - 12400 - 2900);
  assert.equal(notes.length, 1);
});
