// A Gusto-style "Payroll Journal Report": title and company block, the pay day
// on its own line above the table, one column per tax with the side in
// brackets ("FUTA (Employer)"), state-prefixed columns ("NC State Tax
// (Employee)"), net pay before reimbursements and donations, then the check
// amount, and a "Payroll Totals" row. Layout from a public fixture set
// (README, 2026-11-15); every name and amount here is made up.
import test from "node:test";
import assert from "node:assert/strict";
import { readPayrollRegister, addPayroll, form941 } from "./payroll.mjs";
import { newBooks } from "./engine.mjs";

const HEAD = `"Last Name","First Name","Work Address","Employee Type","Payment","Regular (Hours)","Regular (Rate)","Regular (Amount)","Additional Earnings","Paycheck Tips","Gross Earnings","Employee Taxes","Federal Income Tax (Employee)","Social Security (Employee)","Medicare (Employee)","Additional Medicare (Employee)","NC State Tax (Employee)","Employer Taxes","Social Security (Employer)","Medicare (Employer)","FUTA (Employer)","NC Unemployment Tax (Employer)","Net Pay","Reimbursements","Donations","Check Amount","Employer Cost"`;
const journal = (rows, payDay = "09/04/2026", head = HEAD) => `"Payroll Journal Report"

"Example Lawn Co"
"1 Main St"
"Raleigh","NC","27601"

"Employee Earnings"
"Weekly Payroll payroll period"," 08/24/2026 - 08/30/2026"
"Pay day"," ${payDay}"
${head}
${rows.join("\n")}
"Payroll Totals","","","","","70.00","","1100.00","0.00","0.00","1100.00","","","","","","","","","","","","","","","",""
`;
// gross 600.00: fed 48.00, ss 37.20, med 8.70, state 27.00 -> taxes 120.90, net 479.10
const A = `"Doe","Sam","1 Main St","Paid by the hour","Direct Deposit","40.00","15.00","600.00","0.00","","600.00","120.90","48.00","37.20","8.70","0.00","27.00","58.50","37.20","8.70","3.60","9.00","479.10","0.00","0.00","479.10","658.50"`;
// gross 500.00 incl. 20.00 tips: fed 40.00, ss 31.00, med 7.25, state 22.50 -> 100.75, net 399.25; reimbursed 35.00, donated 10.00 -> check 424.25
const B = `"Roe","Kim","1 Main St","Paid by the hour","Check","30.00","16.00","480.00","0.00","20.00","500.00","100.75","40.00","31.00","7.25","0.00","22.50","48.75","31.00","7.25","3.00","7.50","399.25","35.00","10.00","424.25","548.75"`;

test("pay day above the table: every row is booked on it, and the totals row is skipped", () => {
  const { runs, problems, notes } = readPayrollRegister(journal([A]));
  assert.deepEqual(problems, []);
  assert.equal(runs.length, 1);
  const r = runs[0];
  assert.equal(r.date, "2026-09-04");
  assert.equal(r.employees, 1);
  assert.equal(r.gross, 60000);
  assert.deepEqual([r.fed, r.ss, r.med, r.state], [4800, 3720, 870, 2700]);
  assert.deepEqual([r.erSs, r.erMed, r.futa, r.suta, r.erOther], [3720, 870, 360, 900, 0]);
  assert.equal(r.net, 47910);
  assert.equal(r.people[0].employee, "Sam Doe");
  assert.ok(notes.some((n) => /pay day \(2026-09-04\)/.test(n)));
});

test("the check amount is what is paid: reimbursements added, donations deducted", () => {
  const { runs, problems } = readPayrollRegister(journal([A, B]));
  assert.deepEqual(problems, []);
  const r = runs[0];
  assert.equal(r.employees, 2);
  assert.equal(r.gross, 110000);
  assert.equal(r.net, 47910 + 42425);
  assert.equal(r.reimb, 3500);
  assert.equal(r.other, 1000);
});

test("a tax column the reader does not know is caught by the employee-taxes total", () => {
  const head = HEAD.replace(`"NC State Tax (Employee)"`, `"Mystery Levy"`);
  const { runs, problems } = readPayrollRegister(journal([A], undefined, head));
  assert.equal(runs.length, 0);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /employee taxes 120\.90 but the tax columns read add to 93\.90/);
});

test("an employer tax the reader does not name is kept as other employer cost", () => {
  const head = HEAD.replace(`"NC Unemployment Tax (Employer)"`, `"Workforce Levy"`);
  const { runs, problems, notes } = readPayrollRegister(journal([A], undefined, head));
  assert.deepEqual(problems, []);
  assert.equal(runs[0].suta, 0);
  assert.equal(runs[0].erOther, 900);
  assert.ok(notes.some((n) => /more than the employer tax columns/.test(n)));
});

test("other states and sides: CA SDI withheld, an OR transit tax, a CA ETT (Employer)", () => {
  const head = `"Pay Date","Employee","Gross Earnings","Federal Income Tax (Employee)","Social Security (Employee)","Medicare (Employee)","CA SDI (Employee)","CA State Tax (Employee)","FUTA (Employer)","CA SUI (Employer)","CA ETT (Employer)","Net Pay"`;
  const { runs, problems } = readPayrollRegister(`${head}\n2026-09-04,Ana Lee,1000.00,80.00,62.00,14.50,12.00,30.00,6.00,34.00,1.00,801.50\n`);
  assert.deepEqual(problems, []);
  assert.deepEqual([runs[0].state, runs[0].futa, runs[0].suta], [4200, 600, 3500]);
});

test("the journal books and its 941 worksheet carries both halves of FICA", () => {
  const { books, added } = addPayroll(newBooks(), journal([A, B]));
  assert.deepEqual(added, ["PR-2026-09-04"]);
  const w = form941(books, 2026, 3);
  assert.equal(w.wages, 110000);
  assert.equal(w.socialSecurityTax, 2 * (3720 + 3100));
  assert.equal(w.medicareTax, 2 * (870 + 725));
  assert.equal(addPayroll(books, journal([A, B])).added.length, 0);
});
