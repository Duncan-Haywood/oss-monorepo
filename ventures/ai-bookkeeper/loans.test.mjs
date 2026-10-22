import { test } from "node:test";
import assert from "node:assert/strict";
import { newBooks, importStatement, journal } from "./engine.mjs";
import { trialBalance } from "./ledger.mjs";
import { addLoan, loanSchedule, loanRegister, applyLoanPayments, levelPayment } from "./loans.mjs";

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
