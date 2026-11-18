import test from "node:test";
import assert from "node:assert/strict";
import { launchCash } from "./cashflow.mjs";

// 100 pieces at 10: factory 1000, 30% deposit = 300 now, 700 + 100 freight at week 4,
// duty 10% of 1100 = 110 and 2 x 100 other = 200? (otherPerUnit 0 here) at week 6.
// Sales: net 30 each, 10 a week from week 6 for 10 weeks (weeks 6..15), no payout delay.
const base = { units: 100, factoryPerUnit: 10, depositPct: 30, productionWeeks: 4, freightWeeks: 2, freight: 100, dutyPct: 10, netPerUnit: 30, weeklySales: 10 };

test("outflows land in the weeks worked by hand", () => {
  const r = launchCash(base);
  assert.equal(r.deposit, 300);
  assert.equal(r.base.weeks[0].out, 300);
  assert.equal(r.base.weeks[4].out, 800);      // 700 balance + 100 freight
  assert.equal(r.base.weeks[6].out, 110);      // 10% of 1100
  assert.equal(r.base.weeks[6].in, 300);       // first 10 pieces at 30
});

test("lowest point and payback by hand", () => {
  const r = launchCash(base);
  // balance: -300, ..., -1100 at week 4, week 5 same, week 6: -1100 -110 +300 = -910
  assert.equal(r.base.lowest, -1100);
  assert.equal(r.base.lowestWeek, 4);
  // total out 1210, in 3000; cumulative -1210 + 300 x k >= 0 at k = 5 sales weeks (1500) -> week 10
  assert.equal(r.base.paybackWeek, 10);
  assert.equal(r.base.sellOutWeek, 15);
  assert.equal(r.base.profit, 1790);
});

test("pre-orders bring cash in at week 0 and shrink the dip", () => {
  const r = launchCash({ ...base, preorders: 40 });
  assert.equal(r.base.weeks[0].in, 1200);
  assert.ok(r.base.lowest > launchCash(base).base.lowest);
  assert.equal(r.base.sellOutWeek, 11);        // 60 left at 10 a week from week 6
});

test("half-rate case is slower and a payout delay shifts cash", () => {
  const r = launchCash(base);
  assert.equal(r.slow.sellOutWeek, 25);
  assert.ok(r.slow.paybackWeek > r.base.paybackWeek);
  assert.equal(launchCash({ ...base, payoutWeeks: 2 }).base.weeks[8].in, 300);
});

test("returns cut revenue, opening cash lifts the balance", () => {
  const r = launchCash({ ...base, returnsPct: 10, openingCash: 2000 });
  assert.equal(r.base.profit, 1790 - 300);
  assert.equal(r.base.lowest, 900);
  assert.match(r.notes.join(" "), /stays at or above 900/);
});

test("refuses bad input with a reason", () => {
  assert.match(launchCash({ ...base, units: "100" }).error, /Pieces ordered/);
  assert.match(launchCash({ ...base, preorders: 101 }).error, /Pre-orders/);
  assert.match(launchCash(null).error, /Give the order size/);
  assert.match(launchCash({ ...base, depositPct: 101 }).error, /Deposit/);
});
