// Lenders that round the instalment up to the cent (eval/lendingclub-loans-2026-11-15.md):
// three LendingClub loans issued in December 2013, amount, rate, term and LendingClub's own
// instalment as published in its loan book; the exact payment is 0.38 to 0.58 of a cent
// over a whole cent, so rounding to the nearest cent is one cent short on each.
import { test } from "node:test";
import assert from "node:assert/strict";
import { newBooks } from "./engine.mjs";
import { addLoan, levelPayment, loanSchedule, checkLenderSchedule } from "./loans.mjs";

const LC = [
  { cents: 2705000, rateBp: 1099, months: 36, theirs: 88546 },
  { cents: 1200000, rateBp: 662, months: 36, theirs: 36845 },
  { cents: 1200000, rateBp: 1199, months: 36, theirs: 39852 },
];

test("rounded up, the payment is LendingClub's own; to the nearest cent it is a cent short", () => {
  for (const l of LC) {
    assert.equal(levelPayment(l.cents, l.rateBp, l.months, "up"), l.theirs);
    assert.equal(levelPayment(l.cents, l.rateBp, l.months), l.theirs - 1);
  }
});

test("a payment that is a whole number of cents is not pushed up by float noise", () => {
  assert.equal(levelPayment(1200000, 0, 12, "up"), 100000);
  assert.equal(levelPayment(1000000, 0, 3, "up"), 333334);
  assert.equal(levelPayment(1000000, 0, 3), 333333);
  // the textbook 20,000 at 6% over 36 months is 608.4387...: nearest 608.44, up 608.44
  assert.equal(levelPayment(2000000, 600, 36, "up"), 60844);
});

test("loan add --round up keeps the setting, and the last payment is the smaller one", () => {
  const { loan } = addLoan(newBooks(), { name: "LC 36", amount: "27050", rate: "10.99", months: 36, first: "2014-01-01", rounding: "up" });
  assert.equal(loan.payment, 88546);
  assert.equal(loan.rounding, "up");
  const s = loanSchedule(loan);
  assert.equal(s.length, 36);
  assert.equal(s.at(-1).balance, 0);
  assert.ok(s.at(-1).payment < 88546, `last payment ${s.at(-1).payment}`);
  assert.equal(s.reduce((a, r) => a + r.principal, 0), 2705000);
  const plain = addLoan(newBooks(), { name: "LC 36", amount: "27050", rate: "10.99", months: 36, first: "2014-01-01" }).loan;
  assert.equal(plain.payment, 88545);
  assert.equal(plain.rounding, undefined);
  assert.throws(() => addLoan(newBooks(), { name: "x", amount: "1000", rate: "5", months: 12, first: "2026-01-01", rounding: "down" }), /nearest.*up/);
});

test("loan check names the round-up when the lender's schedule is a cent higher every month", () => {
  const books = newBooks();
  const theirsLoan = addLoan(books, { name: "LC", amount: "12000", rate: "6.62", months: 36, first: "2014-01-01", rounding: "up" }).loan;
  const ours = addLoan(books, { name: "LC", amount: "12000", rate: "6.62", months: 36, first: "2014-01-01" }).loan;
  const csv = ["Date,Payment,Interest,Principal,Balance", ...loanSchedule(theirsLoan).map((r) => [r.date, r.payment, r.interest, r.principal, r.balance].map((v) => (typeof v === "number" ? (v / 100).toFixed(2) : v)).join(","))].join("\n");
  const r = checkLenderSchedule(ours, csv);
  assert.ok(r.notes.some((n) => /rounds the payment up/.test(n) && /--round up/.test(n)), r.notes.join(" | "));
  // and re-added with --round up, it matches on every row
  const again = checkLenderSchedule(theirsLoan, csv);
  assert.equal(again.first, null);
  assert.ok(!again.notes.some((n) => /rounds the payment up/.test(n)));
});
