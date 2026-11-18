import test from "node:test";
import assert from "node:assert/strict";
import { discountPlan, maxDiscountPct, ladder, secondPieceOffer } from "./discount.mjs";

const P = { price: 50, landed: 15, ship: 5, feePct: 0, feeFixed: 0, orders: 100 };

test("20% off 50 with 20 of cost: 30 -> 20 per order, needs 50% more orders", () => {
  const r = discountPlan(P, 20, 0);
  assert.equal(r.newPrice, 40);
  assert.equal(r.contributionBefore, 30);
  assert.equal(r.contributionAfter, 20);
  assert.equal(r.breakEvenLiftPct, 50);
  assert.equal(r.profitChange, -1000);
  assert.equal(r.pays, false);
});
test("a 50% lift exactly pays for it; 60% beats it", () => {
  assert.equal(discountPlan(P, 20, 50).profitChange, 0);
  assert.equal(discountPlan(P, 20, 60).profitChange, 200);
});
test("fees scale with price: 3% fee and 0.30 fixed", () => {
  const q = { ...P, feePct: 3, feeFixed: 0.3 };
  const r = discountPlan(q, 10, 0);
  assert.equal(r.contributionBefore, 28.2);
  assert.equal(r.contributionAfter, 23.35);
});
test("sale price below cost: no lift can pay", () => {
  const r = discountPlan(P, 60, 0);
  assert.equal(r.breakEvenLiftPct, null);
  assert.match(r.notes[0], /no lift/);
});
test("largest discount a lift pays for is solved exactly", () => {
  assert.equal(maxDiscountPct(P, 50), 20); // matches the 20%/50% case
  assert.equal(maxDiscountPct(P, 0), 0);
  const d = maxDiscountPct({ ...P, feePct: 3, feeFixed: 0.3 }, 40);
  assert.ok(Math.abs(discountPlan({ ...P, feePct: 3, feeFixed: 0.3 }, d, 40).profitChange) < 20);
});
test("ladder lists break-even lift per step", () => {
  const l = ladder(P, [10, 20]);
  assert.deepEqual(l.map(x => x.breakEvenLiftPct), [METHOD(10), 50]);
  function METHOD(d) { return Math.round((30 / (50 * (1 - d / 100) - 20) - 1) * 1000) / 10; }
});
test("second piece at 30% off, 20% of buyers take it", () => {
  const r = secondPieceOffer(P, 30, 20);
  assert.equal(r.secondPieceEarns, 20); // 35 - 15
  assert.equal(r.extraPerOrder, 4);
  assert.equal(r.vsNoOffer, 400);
});
test("bad input throws", () => {
  assert.throws(() => discountPlan({ ...P, price: 0 }, 10, 0), /price/);
  assert.throws(() => discountPlan(P, 100, 0), /discount/);
});
