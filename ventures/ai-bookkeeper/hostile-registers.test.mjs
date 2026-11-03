// Hostile inputs to the loan, prepaid and asset registers (found by probing 2026-11-03).
// Before: amounts of 1e300 or 9e15 were accepted (sums stop being exact past 2^53 cents),
// a loan's months `true` became 1 month and a blank rate became 0%. Invented inputs only.
import test from "node:test";
import assert from "node:assert/strict";
import { addLoan, addLoanExtra } from "./loans.mjs";
import { addPrepaid } from "./prepaid.mjs";
import { addAsset, disposeAsset } from "./assets.mjs";
import { newBooks } from "./engine.mjs";

const b = () => newBooks();
const loan = { name: "x", amount: 1000, rate: 5, months: 12, first: "2026-02-01" };

test("amounts over $100 billion are refused everywhere", () => {
  for (const amt of [1e300, 9e15, 1e12, "9000000000000000"]) {
    assert.throws(() => addLoan(b(), { ...loan, amount: amt }), /at most 100 billion/, `loan ${amt}`);
    assert.throws(() => addPrepaid(b(), { name: "x", date: "2026-01-01", amount: amt, months: 12 }), /at most 100 billion/, `prepaid ${amt}`);
    assert.throws(() => addAsset(b(), { name: "x", date: "2026-01-01", cost: amt, lifeMonths: 12 }), /at most 100 billion/, `asset ${amt}`);
  }
  const { books } = addLoan(b(), loan);
  assert.throws(() => addLoanExtra(books, "LN-1", { amount: 1e300, date: "2026-03-01" }), /at most 100 billion/);
  assert.throws(() => addLoan(b(), { ...loan, payment: 1e300 }), /Payment/);
  const a = addAsset(b(), { name: "x", date: "2026-01-01", cost: 1000, lifeMonths: 12 });
  assert.throws(() => disposeAsset(a.books, "FA-1", { date: "2026-06-01", proceeds: 1e300 }), /100 billion/);
});

test("a sensible large amount still works", () => {
  assert.ok(addLoan(b(), { ...loan, amount: 5e6 }).loan.cents === 5e8);
});

test("months and rate must be typed, not true, null or blank", () => {
  assert.throws(() => addLoan(b(), { ...loan, months: true }), /Months/);
  assert.throws(() => addLoan(b(), { ...loan, months: null }), /Months/);
  assert.throws(() => addLoan(b(), { ...loan, months: "" }), /Months/);
  assert.throws(() => addLoan(b(), { ...loan, rate: "" }), /Rate/);
  assert.throws(() => addLoan(b(), { ...loan, rate: null }), /Rate/);
  assert.throws(() => addLoan(b(), { ...loan, rate: true }), /Rate/);
  assert.ok(addLoan(b(), { ...loan, rate: 0 }).loan.rateBp === 0, "an honest 0% still works");
  assert.ok(addLoan(b(), { ...loan, rate: "0" }).loan.rateBp === 0);
  for (const m of [true, null, ""]) assert.throws(() => addPrepaid(b(), { name: "x", date: "2026-01-01", amount: 100, months: m }), /Months/);
});
