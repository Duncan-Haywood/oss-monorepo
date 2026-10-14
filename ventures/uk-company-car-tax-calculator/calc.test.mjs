import { test } from "node:test";
import assert from "node:assert/strict";
import { compute, summaryText, SAMPLE, VERIFY, hybridPercent, carCost, ZEV_SCHEDULE } from "./calc.mjs";

const run = (extra = {}) => compute({ ...SAMPLE, ...extra });

test("electric car at 4 percent on GBP 45,000 matches hand arithmetic", () => {
  const r = run();
  // 45,000 x 4% = 1,800 benefit; 40% = 720 tax; Class 1A 15% = 270
  assert.equal(r.pct, 4);
  assert.equal(r.a.benefit, 1800);
  assert.equal(r.a.tax, 720);
  assert.equal(r.a.monthlyTax, 60);
  assert.equal(r.a.employerClass1A, 270);
  assert.equal(r.a.fuelBenefit, 0);
});

test("zero-emission schedule rises 4, 5, 7, 9 percent and totals the four years", () => {
  const r = run();
  assert.deepEqual(r.schedule.map((s) => s.pct), [4, 5, 7, 9]);
  assert.deepEqual(r.schedule.map((s) => s.totalTax), [720, 900, 1260, 1620]);
  assert.equal(r.scheduleTotal, 4500);
  assert.equal(ZEV_SCHEDULE.length, 4);
});

test("comparison petrol car at 28 percent on GBP 32,000", () => {
  const r = run();
  // 32,000 x 28% = 8,960 x 40% = 3,584
  assert.equal(r.b.benefit, 8960);
  assert.equal(r.b.totalTax, 3584);
  assert.equal(r.diff, 2864);
});

test("plug-in hybrid bands follow the electric range", () => {
  assert.equal(hybridPercent(130).pct, 4);
  assert.equal(hybridPercent(129).pct, 7);
  assert.equal(hybridPercent(70).pct, 7);
  assert.equal(hybridPercent(69).pct, 10);
  assert.equal(hybridPercent(40).pct, 10);
  assert.equal(hybridPercent(39).pct, 14);
  assert.equal(hybridPercent(30).pct, 14);
  assert.equal(hybridPercent(29).pct, 16);
  assert.equal(hybridPercent(0).pct, 16);
  assert.equal(run({ carType: "hybrid", range: 45 }).pct, 10);
  assert.equal(run({ carType: "hybrid", range: 45 }).schedule, null);
  assert.ok(run({ carType: "hybrid", range: 150 }).schedule);
});

test("capital contribution reduces the price by at most GBP 5,000", () => {
  assert.equal(run({ capContribution: 3000 }).a.bikPrice, 42000);
  assert.equal(run({ capContribution: 9000 }).a.bikPrice, 40000);
  assert.ok(run({ capContribution: 9000 }).findings.some((f) => /4,000 gets no relief/.test(f.title)));
});

test("accessories add to the price and private contributions reduce the benefit, never below zero", () => {
  assert.equal(run({ accessories: 5000 }).a.bikPrice, 50000);
  assert.equal(run({ privateContribution: 500 }).a.benefit, 1300);
  assert.equal(run({ privateContribution: 5000 }).a.benefit, 0);
});

test("part-year availability pro-rates the benefit", () => {
  const r = run({ days: 183 });
  assert.equal(r.a.benefit, carCost({ listPrice: 45000, pct: 4, days: 183, taxRate: 0.4 }).benefit);
  assert.equal(r.a.benefit, 902.47);
});

test("free private fuel adds list multiplier x percentage on a petrol car, but never on an electric one", () => {
  const petrol = run({ carType: "other", otherPct: 28, listPrice: 32000, fuel: "yes", bPrice: 0 });
  // 29,200 x 28% = 8,176 ; tax 3,270.40
  assert.equal(petrol.a.fuelBenefit, 8176);
  assert.equal(petrol.a.fuelTax, 3270.4);
  assert.equal(petrol.a.totalTax, 3584 + 3270.4);
  assert.equal(run({ fuel: "yes" }).a.fuelBenefit, 0);
});

test("diesel that is not RDE2 adds four points, capped at 37", () => {
  assert.equal(run({ carType: "other", otherPct: 28, diesel: "yes", bPrice: 0 }).pct, 32);
  assert.equal(run({ carType: "other", otherPct: 35, diesel: "yes", bPrice: 0 }).pct, 37);
});

test("bad input is rejected, not clamped", () => {
  for (const bad of [{ listPrice: "" }, { listPrice: -5 }, { listPrice: 3000000 }, { carType: "boat" }, { carType: "hybrid", range: "" }, { carType: "other", otherPct: "" }, { carType: "other", otherPct: 50 }, { days: 0 }, { days: 400 }, { days: 1.5 }, { taxRate: "33" }, { fuel: "maybe" }, { capContribution: -1 }, { bPct: 99 }]) {
    const r = run(bad);
    assert.ok(r.errors.length > 0, JSON.stringify(bad));
  }
  assert.equal(compute({}).errors.length > 0, true);
});

test("the comparison is skipped when no second car is given", () => {
  const r = run({ bPrice: "", bPct: "" });
  assert.equal(r.b, null);
});

test("summary names the source and carries the disclaimer", () => {
  const s = summaryText(run());
  assert.ok(s.includes(VERIFY));
  assert.match(s, /Not tax advice/);
});
