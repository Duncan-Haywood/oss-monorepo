import test from "node:test";
import assert from "node:assert/strict";
import { bundlePlan, setValue, maxDiscountPct, ladder } from "./bundle.mjs";

// Tee 30 (cost 9), trousers 60 (cost 20), jacket 110 (cost 35); ship 5; no fees.
const P = { items: [{ name: "Tee", price: 30, landed: 9 }, { name: "Trousers", price: 60, landed: 20 }, { name: "Jacket", price: 110, landed: 35 }], ship: 5 };

test("list 200, cost 64: 10% off gives 180, earns 111, full price earns 131, one piece (avg 66.67, 21.33) earns 40.33", () => {
  const r = bundlePlan(P, { discountPct: 10 });
  assert.equal(r.listTotal, 200);
  assert.equal(r.bundlePrice, 180);
  assert.equal(r.costTotal, 64);
  assert.equal(r.contributionSet, 111);
  assert.equal(r.contributionFullPrice, 131);
  assert.equal(r.contributionSingle, 40.33);
  assert.equal(r.marginPct, 61.7);
});
test("break-even share of one-piece buyers = (131-111)/(131-40.33) = 22.1%", () => {
  assert.equal(bundlePlan(P, { discountPct: 10 }).breakEvenSinglePct, 22.1);
});
test("at the break-even share the change is about zero; above it positive, below negative", () => {
  const f = 20 / (131 - 40 - 1 / 3);
  assert.ok(Math.abs(setValue(P, { discountPct: 10 }, f * 100).changePerSetOrder) < 0.01);
  assert.ok(setValue(P, { discountPct: 10 }, 50).changePerSetOrder > 0);
  assert.ok(setValue(P, { discountPct: 10 }, 10).changePerSetOrder < 0);
  // 50%: 0.5 x (111 - 40.33) + 0.5 x (111 - 131) = 35.33 - 10 = 25.33
  assert.equal(setValue(P, { discountPct: 10 }, 50).changePerSetOrder, 25.33);
});
test("bundle price can be typed; the discount is derived", () => {
  const r = bundlePlan(P, { bundlePrice: 150 });
  assert.equal(r.discountPct, 25);
  assert.equal(r.contributionSet, 81);
});
test("fees scale with the price: 3% + 0.30 on the 180 set", () => {
  const r = bundlePlan({ ...P, feePct: 3, feeFixed: 0.3 }, { discountPct: 10 });
  assert.equal(r.contributionSet, 105.3);
});
test("max discount for a 50% one-piece share solves exactly: set must keep 0.5x40.33+0.5x131", () => {
  const d = maxDiscountPct(P, 50);
  // keep 85.67 -> price 154.67 -> 22.7% off
  assert.equal(d, 22.7);
  const back = setValue(P, { discountPct: d }, 50);
  assert.ok(Math.abs(back.changePerSetOrder) < 0.1);
  assert.equal(maxDiscountPct(P, 0), 0);
});
test("notes: a set dearer than its pieces, and a loss-making set", () => {
  assert.ok(bundlePlan(P, { bundlePrice: 250 }).notes.some(n => /costs more/.test(n)));
  assert.ok(bundlePlan(P, { bundlePrice: 60 }).notes.some(n => /loses money/.test(n)));
});
test("ladder has nine steps and no discount means nothing to break even", () => {
  const l = ladder(P);
  assert.equal(l.length, 9);
  assert.equal(l[0].breakEvenSinglePct, 0);
  assert.ok(l[8].breakEvenSinglePct > l[1].breakEvenSinglePct);
});
test("bad input is refused with a reason", () => {
  assert.throws(() => bundlePlan({ ...P, items: [P.items[0]] }, { discountPct: 10 }), /2 to 50/);
  assert.throws(() => bundlePlan({ ...P, items: [{ price: -1, landed: 1 }, P.items[1]] }, { discountPct: 10 }), /price of piece 1/);
  assert.throws(() => bundlePlan(P, { discountPct: 100 }), /discount/);
  assert.throws(() => bundlePlan({ ...P, ship: NaN }, { discountPct: 5 }), /shipping/);
});
