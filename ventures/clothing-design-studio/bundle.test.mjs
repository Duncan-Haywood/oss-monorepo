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
  // keep 85.67 -> price 154.67 -> 22.67% off, reported rounded down as 22.6
  // (22.7% would lose money; before 2026-11-13 it was rounded up to 22.7)
  assert.equal(d, 22.6);
  const back = setValue(P, { discountPct: d }, 50);
  assert.ok(Math.abs(back.changePerSetOrder) < 0.2);
  assert.ok(back.pays);
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

// Red-team guards, 2026-11-13.
test("shipping defaults to 0 for one piece and for the set when left out", () => {
  const r = bundlePlan({ items: P.items }, { discountPct: 10 });
  // 180 - 64 = 116 for the set; one piece 66.67 - 21.33 = 45.33, no shipping taken off
  assert.equal(r.contributionSet, 116);
  assert.equal(r.contributionSingle, 45.33);
  assert.equal(r.contributionFullPrice, 136);
});
test("a set priced exactly at its list total is not called dearer than its pieces", () => {
  assert.ok(!bundlePlan(P, { discountPct: 0 }).notes.some(n => /costs more/.test(n)));
});
test("a one-piece share over 100% is refused", () => {
  assert.throws(() => setValue(P, { discountPct: 10 }, 100.5), /share of set buyers/);
});
test("max discount with fees solves the fee-inclusive price: 20% + 0.30, 50% share", () => {
  // c1 = 66.67 x 0.8 - 0.3 - 21.33 - 5 = 26.70, cFull = 160 - 0.3 - 64 - 5 = 90.70;
  // keep 58.70 -> price = (58.70 + 0.30 + 64 + 5) / 0.8 = 160 -> exactly 20% off
  const Q = { ...P, feePct: 20, feeFixed: 0.3 };
  const d = maxDiscountPct(Q, 50);
  assert.equal(d, 20);
  assert.ok(setValue(Q, { discountPct: d }, 50).pays);
});
test("the biggest discount reported always still pays (rounded down, never up)", () => {
  const Q = { items: [{ price: 30, landed: 10 }, { price: 30, landed: 10 }], ship: 5, shipBundle: 7, feePct: 3, feeFixed: 0.3 };
  for (const f of [0, 10, 25, 33, 50, 77, 100]) {
    const d = maxDiscountPct(Q, f);
    assert.ok(setValue(Q, { discountPct: d }, f).pays, `share ${f}%: ${d}% off loses money`);
  }
});
test("the biggest discount never exceeds what a discount can be (one piece alone loses money)", () => {
  const Q = { items: [{ price: 10, landed: 0 }, { price: 10, landed: 0 }], ship: 100, shipBundle: 0 };
  const d = maxDiscountPct(Q, 100);
  assert.ok(d >= 0 && d < 100, `got ${d}%`);
  assert.doesNotThrow(() => bundlePlan(Q, { discountPct: d }));
});
