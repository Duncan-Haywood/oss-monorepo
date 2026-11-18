import test from "node:test";
import assert from "node:assert/strict";
import { clearancePlan } from "./clearance.mjs";

const plan = { salesTaxPct: 0, channelFeePct: 0, paymentFeePct: 0, paymentFixed: 0 };
const base = { landed: 10, price: 40, quantity: 100, weeklyRate: 5, fullPriceWeeks: 8 };

test("full price only, by hand", () => {
  const r = clearancePlan(base, plan);
  assert.equal(r.rows[0].sold, 40);         // 5 x 8
  assert.equal(r.unsold, 60);
  assert.equal(r.totalProfit, 40 * 40 - 1000); // 1600 - 1000
  assert.equal(r.sellThroughPct, 40);
  assert.match(r.notes[0], /60 of 100/);
});

test("a markdown ladder moves stock at the elasticity rate", () => {
  // 50% off -> price 20, rate 5 x 2^2 = 20 a week, 3 weeks = 60 units.
  const r = clearancePlan({ ...base, steps: [{ offPct: 50, weeks: 3 }] }, plan);
  assert.equal(r.rows[1].price, 20);
  assert.equal(r.rows[1].sold, 60);
  assert.equal(r.unsold, 0);
  assert.equal(r.totalProfit, 1600 + 1200 - 1000);
  assert.equal(r.fullPriceSharePct, 40);
});

test("stock caps a stage and zero elasticity ignores price", () => {
  const r = clearancePlan({ ...base, quantity: 45, elasticity: 0, steps: [{ offPct: 50, weeks: 10 }] }, plan);
  assert.equal(r.rows[1].sold, 5);          // 45 - 40
  const s = clearancePlan({ ...base, elasticity: 0, steps: [{ offPct: 50, weeks: 4 }] }, plan);
  assert.equal(s.rows[1].sold, 20);         // 5 x 4
});

test("tax and fees come off the marked-down price; a loss is flagged", () => {
  const r = clearancePlan({ ...base, steps: [{ offPct: 80, weeks: 20 }] }, { ...plan, channelFeePct: 10 });
  assert.equal(r.rows[1].price, 8);
  assert.ok(r.rows[1].profitPerSale < 0);
  assert.ok(r.notes.some(n => /lose money/.test(n)));
});

test("leftover value is counted and hostile input is refused", () => {
  const r = clearancePlan({ ...base, scrapPerUnit: 2 }, plan);
  assert.equal(r.scrapCash, 120);
  for (const bad of [null, { ...base, price: NaN }, { ...base, quantity: "100" }, { ...base, steps: [{ offPct: 100, weeks: 1 }] }, { ...base, steps: "x" }, { ...base, elasticity: 99 }])
    assert.throws(() => clearancePlan(bad, plan), /Give|must be/);
});
