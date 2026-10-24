import { test } from "node:test";
import assert from "node:assert/strict";
import { newBooks, importStatement, journal } from "./engine.mjs";
import { trialBalance } from "./ledger.mjs";
import { addLoan, addLoanExtra, loanSchedule, loanRegister, applyLoanPayments, levelPayment } from "./loans.mjs";

test("level payment matches the textbook figure and the schedule clears to zero", () => {
  // 20,000 at 6% over 36 months: 608.44 a month (standard annuity table)
  assert.equal(levelPayment(2000000, 600, 36), 60844);
  const { loan } = addLoan(newBooks(), { name: "Van", amount: "20000", rate: "6", months: 36, first: "2026-02-01" });
  const s = loanSchedule(loan);
  assert.equal(s.length, 36);
  assert.equal(s[0].interest, 10000); // 20,000 x 0.5%
  assert.equal(s.at(-1).balance, 0);
  assert.equal(s.reduce((a, r) => a + r.principal, 0), 2000000);
  assert.ok(Math.abs(s.at(-1).payment - 60844) < 40);
});

test("zero rate and month-end dates", () => {
  const { loan } = addLoan(newBooks(), { name: "Friend", amount: "1200", rate: 0, months: 12, first: "2026-01-31" });
  const s = loanSchedule(loan);
  assert.ok(s.every((r) => r.interest === 0 && r.payment === 10000));
  assert.equal(s[1].date, "2026-02-28");
  assert.equal(s[2].date, "2026-03-31");
});

test("rejects bad input", () => {
  assert.throws(() => addLoan(newBooks(), { name: "", amount: "1", rate: 5, months: 12, first: "2026-01-01" }), /name/);
  assert.throws(() => addLoan(newBooks(), { name: "x", amount: "1000", rate: 5, months: 12, first: "2026-13-01" }), /date/);
  assert.throws(() => addLoan(newBooks(), { name: "x", amount: "1000", rate: 5, months: 12, first: "2026-01-01", payment: "10" }), /too small/);
});

test("scheduled bank payments split into interest and principal, books balance, lookalikes left alone", () => {
  let { books, loan } = addLoan(newBooks(), { name: "Van", amount: "20000", rate: "6", months: 36, first: "2026-02-01" });
  const csv = `Date,Description,Amount
2026-02-02,SBA LOAN PMT,-608.44
2026-03-01,SBA LOAN PMT,-608.44
2026-03-15,SOMETHING ELSE,-608.44
2026-04-01,SBA LOAN PMT,-600.00
`;
  books = importStatement(books, csv, "1000").books;
  const r = applyLoanPayments(books, loan.id);
  assert.equal(r.matched.length, 2);
  const s = loanSchedule(loan);
  const t = r.books.transactions.find((x) => x.id === r.matched[0].id);
  assert.equal(t.status, "split");
  assert.deepEqual(t.split, [{ account: "6040", cents: -s[0].interest }, { account: "2200", cents: -s[0].principal }]);
  assert.equal(r.books.transactions.filter((x) => x.status === "split").length, 2);
  const tb = trialBalance(journal(r.books), r.books.accounts);
  assert.ok(tb.balanced);
  const g = loanRegister(r.books).rows[0];
  assert.equal(g.paid, 2);
  assert.equal(g.balance, 2000000 - s[0].principal - s[1].principal);
  assert.equal(g.next.n, 3);
  // running it again changes nothing
  assert.equal(applyLoanPayments(r.books, loan.id).matched.length, 0);
});

test("a 0% loan files each payment plainly to the loan account", () => {
  let { books, loan } = addLoan(newBooks(), { name: "Friend", amount: "1200", rate: 0, months: 12, first: "2026-01-05" });
  books = importStatement(books, "Date,Description,Amount\n2026-01-05,PAYMENT TO FRIEND,-100.00\n", "1000").books;
  const r = applyLoanPayments(books, loan.id);
  const t = r.books.transactions[0];
  assert.equal(t.status, "confirmed");
  assert.equal(t.posted, "2200");
});

test("payments and total interest match widely published mortgage-table figures", () => {
  // Figures printed in standard payment tables / lender calculators (30 years, monthly):
  //   100,000 at 6%   -> 599.55 a month, about 115,838 interest in total
  //   200,000 at 6.5% -> 1,264.14 a month
  //   300,000 at 4%   -> 1,432.25 a month
  assert.equal(levelPayment(10000000, 600, 360), 59955);
  assert.equal(levelPayment(20000000, 650, 360), 126414);
  assert.equal(levelPayment(30000000, 400, 360), 143225);
  const { loan } = addLoan(newBooks(), { name: "Mortgage", amount: "100000", rate: "6", months: 360, first: "2026-02-01" });
  const s = loanSchedule(loan);
  assert.equal(s[0].interest, 50000);
  assert.equal(s[0].principal, 9955);
  const interest = s.reduce((a, r) => a + r.interest, 0);
  assert.ok(Math.abs(interest - 11583819) < 100, `total interest ${interest}`);
  assert.equal(s.at(-1).balance, 0);
});

test("a zero amount is refused", () => {
  assert.throws(() => addLoan(newBooks(), { name: "x", amount: "0", rate: 5, months: 12, first: "2026-01-01" }), /positive/);
});

test("the register counts matched payments, and has no next payment once all are matched", () => {
  let { books, loan } = addLoan(newBooks(), { name: "Short", amount: "1200", rate: 0, months: 2, first: "2026-01-05" });
  books = importStatement(books, "Date,Description,Amount\n2026-01-05,PAYMENT TO SHORT,-600.00\n", "1000").books;
  books = applyLoanPayments(books, loan.id).books;
  let r = loanRegister(books).rows[0];
  assert.equal(r.paid, 1); assert.equal(r.principalPaid, 60000); assert.equal(r.balance, 60000);
  assert.equal(r.next.n, 2); assert.equal(r.next.payment, 60000);
  books = importStatement(books, "Date,Description,Amount\n2026-02-05,PAYMENT TO SHORT,-600.00\n", "1000").books;
  books = applyLoanPayments(books, loan.id).books;
  r = loanRegister(books).rows[0];
  assert.equal(r.paid, 2); assert.equal(r.balance, 0); assert.equal(r.next, null);
});

test("extra principal shortens the schedule and saves interest; the bank line is filed to 2200", () => {
  let { books, loan } = addLoan(newBooks(), { name: "Van", amount: "20000", rate: "6", months: 36, first: "2026-02-01" });
  const base = loanSchedule(loan);
  books = addLoanExtra(books, loan.id, { amount: "2000", date: "2026-06-10" }).books;
  loan = books.loans[0];
  const s = loanSchedule(loan);
  assert.ok(s.length < 36 && s.at(-1).balance === 0);
  assert.equal(s.reduce((a, r) => a + r.principal + r.extra, 0), 2000000);
  assert.equal(s[4].extra, 200000); // after the 2026-06-01 instalment (n=5)
  assert.ok(s.reduce((a, r) => a + r.interest, 0) < base.reduce((a, r) => a + r.interest, 0));
  books = importStatement(books, "Date,Description,Amount\n2026-06-10,EXTRA PRINCIPAL VAN,-2000.00\n", "1000").books;
  const r = applyLoanPayments(books, loan.id);
  assert.equal(r.matched.length, 1); assert.equal(r.matched[0].extra, 0);
  assert.equal(loanRegister(r.books).rows[0].extraPaid, 200000);
  assert.equal(loanRegister(r.books).rows[0].balance, 1800000);
  assert.equal(applyLoanPayments(r.books, loan.id).matched.length, 0);
});

test("a bad extra payment is refused", () => {
  const { books, loan } = addLoan(newBooks(), { name: "V", amount: "1000", rate: 5, months: 12, first: "2026-01-01" });
  assert.throws(() => addLoanExtra(books, loan.id, { amount: "0", date: "2026-02-01" }), /positive/);
  assert.throws(() => addLoanExtra(books, loan.id, { amount: "5", date: "soon" }), /date/);
  assert.throws(() => addLoanExtra(books, "LN-9", { amount: "5", date: "2026-02-01" }), /No loan/);
});

test("lender schedule check: identical, rounding, different payment, day-count interest", async () => {
  const { checkLenderSchedule } = await import("./loans.mjs");
  const { loan } = addLoan(newBooks(), { name: "Van", amount: "20000", rate: "6", months: 12, first: "2026-02-01" });
  const s = loanSchedule(loan);
  const csv = (f) => "Date,Payment,Interest,Principal,Balance\n" + s.map((r, i) => { const o = f(r, i); return `${o.date},${(o.payment / 100).toFixed(2)},${(o.interest / 100).toFixed(2)},${(o.principal / 100).toFixed(2)},${(o.balance / 100).toFixed(2)}`; }).join("\n");
  const same = checkLenderSchedule(loan, csv((r) => r));
  assert.equal(same.first, null);
  assert.match(same.notes[0], /matches/);
  const cents = checkLenderSchedule(loan, csv((r, i) => (i === 4 ? { ...r, interest: r.interest + 1, principal: r.principal - 1 } : r)));
  assert.equal(cents.first, null);
  assert.match(cents.notes.join(" "), /rounding/);
  const pay = checkLenderSchedule(loan, csv((r, i) => ({ ...r, payment: r.payment + 500 })));
  assert.match(pay.notes.join(" "), /--payment/);
  // actual/365 style interest: January-length months differ from 1/12 of the year, so the first row is off
  const dc = checkLenderSchedule(loan, csv((r, i) => (i === 0 ? { ...r, interest: r.interest + 150 } : r)));
  assert.equal(dc.first.n, 1);
  assert.match(dc.notes.join(" "), /actual days/);
  const mid = checkLenderSchedule(loan, csv((r, i) => (i === 6 ? { ...r, interest: r.interest + 900 } : r)));
  assert.equal(mid.first.n, 7);
  assert.match(mid.notes.join(" "), /through payment 6/);
  assert.throws(() => checkLenderSchedule(loan, "Date,Memo\n2026-02-01,x"), /No interest/);
});
