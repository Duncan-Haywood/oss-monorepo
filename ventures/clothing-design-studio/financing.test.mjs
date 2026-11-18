import test from "node:test";
import assert from "node:assert/strict";
import { monthlyRate, optionCost, compareFinancing } from "./financing.mjs";

test("a one-month factor of 1.1 is 10% a month: 120% nominal, 213.8% effective", () => {
  const r = optionCost({ kind: "factor", factor: 1.1, months: 1 }, 10000);
  assert.equal(r.repaid, 11000); assert.equal(r.cost, 1000);
  assert.equal(r.nominalAprPct, 120); assert.equal(r.effectiveAprPct, 213.8);
});

test("a 12% APR loan over 12 months with no fee is 12% nominal, 12.7% effective; payments total 6.62% interest", () => {
  const r = optionCost({ kind: "loan", aprPct: 12, months: 12 }, 10000);
  assert.equal(r.nominalAprPct, 12); assert.equal(r.effectiveAprPct, 12.7);
  assert.equal(r.cost, 661.85); // 12 x 888.49 - 10000
});

test("a fee comes out of what you receive and raises the rate", () => {
  const r = optionCost({ kind: "loan", aprPct: 12, months: 12, feePct: 2 }, 10000);
  assert.equal(r.received, 9800);
  const i = r.nominalAprPct / 1200, pay = 888.49; // level payment for 10,000 at 1% a month
  const pv = Array.from({ length: 12 }, (_, t) => pay / Math.pow(1 + i, t + 1)).reduce((a, b) => a + b);
  assert.ok(Math.abs(pv - 9800) < 8, String(pv)); // the solved rate discounts the payments to what was received
});

test("a factor of 1.3 over 6 months: present value of the payments at the solved rate equals the advance", () => {
  const r = optionCost({ kind: "factor", factor: 1.3, months: 6 }, 10000);
  const i = r.nominalAprPct / 1200, p = 13000 / 6;
  const pv = Array.from({ length: 6 }, (_, t) => p / Math.pow(1 + i, t + 1)).reduce((a, b) => a + b);
  assert.ok(Math.abs(pv - 10000) < 15, String(pv)); // rate is rounded to 0.1%
  assert.equal(r.cost, 3000);
  assert.ok(r.effectiveAprPct > 100);
});

test("2/10 net 30: 2/98 over 20 days is 37.2% nominal, 44.6% compounded", () => {
  const r = optionCost({ kind: "deferral", discountPct: 2, discountDays: 10, netDays: 30 }, 9800);
  assert.equal(r.nominalAprPct, 37.2); assert.equal(r.effectiveAprPct, 44.6); assert.equal(r.cost, 200);
});

test("monthlyRate is zero when you repay what you got", () => {
  assert.equal(monthlyRate([100, -50, -50]), 0);
});

test("comparison ranks by rate, notes when the cheapest rate is not the cheapest bill, and prices per piece", () => {
  const r = compareFinancing({ amount: 10000, pieces: 200, profitPerPiece: 20, options: [
    { name: "Advance", kind: "factor", factor: 1.1, months: 1 },
    { name: "Loan", kind: "loan", aprPct: 20, months: 12 } ] });
  assert.deepEqual(r.ranked, ["Loan", "Advance"]);
  assert.equal(r.cheapestMoney, "Advance"); // 1000 vs about 1117 on the loan
  assert.ok(r.notes.some(n => n.includes("lowest yearly rate")));
  const adv = r.rows[0];
  assert.equal(adv.costPerPiece, 5); assert.equal(adv.shareOfProfitPct, 25);
  assert.ok(r.notes.some(n => n.includes("25% of the profit")));
});

test("bad input is refused with a reason", () => {
  assert.ok(compareFinancing({ amount: 0, options: [{ kind: "loan", months: 3 }] }).error);
  assert.ok(compareFinancing({ amount: 100, options: [] }).error);
  assert.ok(compareFinancing({ amount: 100, options: [{ kind: "factor", factor: 0.9, months: 3 }] }).error.includes("factor"));
  assert.ok(compareFinancing({ amount: 100, options: [{ kind: "deferral", discountPct: 2, discountDays: 30, netDays: 30 }] }).error);
  assert.ok(compareFinancing({ amount: 100, options: [{ kind: "wire" }] }).error);
});
