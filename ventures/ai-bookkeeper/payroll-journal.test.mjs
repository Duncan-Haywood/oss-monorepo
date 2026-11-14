// A payroll-journal layout like Gusto's (one row per worker per pay date, an
// "Employee type" column, one total each for employee and employer taxes, and a
// reimbursements column). Before 2026-11-14 the reader booked a 1099
// contractor's pay as W-2 wages, ignored the employer-tax total (no employer
// cost booked) and dropped any employee whose check carried a reimbursement
// (net pay did not equal gross less taxes). Hand-written rows; the layout was
// checked against a public redacted fixture of the same report, not a real
// company's export.
import { test } from "node:test";
import assert from "node:assert/strict";
import { newBooks, importStatement, journal } from "./engine.mjs";
import { readPayrollRegister, addPayroll, planPayroll, applyPayroll, payrollSummary, form941, w2Summary } from "./payroll.mjs";

const JOURNAL = `Payroll Journal,,,,,,,,,,
Employee,Employee type,Pay period start,Pay period end,Check date,Gross pay,Employee taxes,Employer taxes,Employer benefits,Reimbursements,Net pay
"Rivera, Ana",Salary,03/01/2026,03/15/2026,03/20/2026,"4,000.00",900.00,350.00,200.00,0.00,"3,100.00"
Ben Okafor,Hourly,03/01/2026,03/15/2026,03/20/2026,"2,000.00",400.00,175.00,0.00,60.00,"1,660.00"
Kim Lee,1099 contractor,03/01/2026,03/15/2026,03/20/2026,"1,200.00",0.00,0.00,0.00,0.00,"1,200.00"
Totals,,,,,"7,200.00",1300.00,525.00,200.00,60.00,"5,960.00"
`;

test("a contractor row is contract labor, a reimbursement keeps the row, the employer-tax total is booked", () => {
  const { runs, problems, notes } = readPayrollRegister(JOURNAL);
  assert.deepEqual(problems, []);
  assert.equal(runs.length, 1);
  const r = runs[0];
  assert.equal(r.employees, 2);
  assert.equal(r.gross, 600000, "wages leave the contractor out");
  assert.equal(r.net, 476000, "employees' net pay, reimbursement included");
  assert.equal(r.reimb, 6000);
  assert.equal(r.contract, 120000);
  assert.deepEqual(r.contractors, [{ name: "Kim Lee", cents: 120000 }]);
  // Employer taxes 525.00: 6.2% and 1.45% of 6,000 = 372.00 and 87.00; the rest (66.00) is unemployment.
  assert.equal(r.erSs, 37200);
  assert.equal(r.erMed, 8700);
  assert.equal(r.suta, 6600);
  assert.equal(r.erOther, 20000);
  assert.ok(r.people.every((p) => p.employee !== "Kim Lee"));
  assert.ok(notes.some((n) => /contract labor/.test(n)));
  assert.ok(notes.some((n) => /employer taxes/.test(n)));
  assert.ok(notes.some((n) => /reimbursements/i.test(n)));
});

test("Form 941 and W-2 count only employees", () => {
  const { books } = addPayroll(newBooks(), JOURNAL);
  const f = form941(books, 2026, 1);
  assert.equal(f.wages, 600000);
  assert.equal(f.socialSecurityTax, Math.round(600000 * 0.062) * 2);
  assert.ok(!w2Summary(books, 2026).employees?.some?.((e) => e.employee === "Kim Lee"));
});

test("the run balances: wages, employer cost, contract labor and reimbursements against 2300", () => {
  const { books } = addPayroll(newBooks(), JOURNAL);
  const e = journal(books).find((x) => x.source === "payroll");
  const by = Object.fromEntries(e.lines.map((l) => [l.account, l.debit - l.credit]));
  assert.equal(by["6150"], 600000);
  assert.equal(by["6155"], 37200 + 8700 + 6600 + 20000);
  assert.equal(by["6020"], 120000);
  assert.equal(by["9999"], 6000);
  assert.equal(by["2300"], -(600000 + 72500 + 120000 + 6000));
  assert.ok(books.accounts.some((a) => a.code === "6020"));
});

test("contractor pay is matched as its own debit, or inside one debit with net pay", () => {
  const bank = (rows) => importStatement(newBooks(), "Date,Description,Amount\n" + rows.map((r) => r.join(",")).join("\n") + "\n", "1000").books;
  let { books } = addPayroll(bank([["2026-03-20", "GUSTO NET", "-4760.00"], ["2026-03-20", "GUSTO CND", "-1200.00"]]), JOURNAL);
  let plan = planPayroll(books);
  assert.deepEqual(plan.matched.filter((m) => m.kind !== "federal deposit").map((m) => [m.kind, m.amount]), [["net pay", 476000], ["contractor payments", 120000]]);
  ({ books } = addPayroll(bank([["2026-03-20", "GUSTO PAYROLL", "-5960.00"]]), JOURNAL));
  plan = planPayroll(books);
  assert.deepEqual(plan.matched.map((m) => [m.kind, m.amount]), [["net pay and contractor payments", 596000]]);
  assert.ok(!plan.unmatched.some((u) => u.kind === "net pay"));
  const done = applyPayroll(books, plan).books;
  const s = payrollSummary(done);
  assert.equal(s.paid, 596000);
  assert.equal(s.accrued, 600000 + 72500 + 120000 + 6000);
  assert.equal(s.owed, 130000 + 72500, "withheld and employer taxes are still owed: no deposit in the bank yet");
});

test("a contractor row with tax withheld is refused, not booked as wages", () => {
  const bad = JOURNAL.replace('Kim Lee,1099 contractor,03/01/2026,03/15/2026,03/20/2026,"1,200.00",0.00', 'Kim Lee,1099 contractor,03/01/2026,03/15/2026,03/20/2026,"1,200.00",100.00').replace('"1,200.00"\nTotals', '"1,100.00"\nTotals');
  const { runs, problems } = readPayrollRegister(bad);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /contractor/);
  assert.equal(runs[0].contract ?? 0, 0);
  assert.equal(runs[0].gross, 600000);
});

test("separate employer-tax columns still win over the total", () => {
  const t = "Check date,Employee,Gross pay,Federal income tax,Social security,Medicare,Net pay,Employer social security,Employer medicare,Employer taxes\n2026-03-20,Ana,1000.00,100.00,62.00,14.50,823.50,62.00,14.50,90.00\n";
  const r = readPayrollRegister(t).runs[0];
  assert.equal(r.erSs, 6200);
  assert.equal(r.suta, 0);
});
