import { test } from "node:test";
import assert from "node:assert/strict";
import { rateOutcome, truckRates, validate, DEFAULTS } from "./calc.mjs";

const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);

// Hand check, default inputs:
//   fixed/hr = (1500 + 600) / 150 = 14; hourly = 14 + 25 = 39
//   per-mile = 4 / 8 + 0.25 = 0.75
//   drive miles = 10 + 20 = 30 -> 1.0 h; on scene 0.5 h; job = 1.5 h
//   cost = 1.5 x 39 + 30 x 0.75 = 58.5 + 22.5 = 81
//   revenue = 125 + (20 - 5) x 4 = 185; profit 104; margin 104/185

test("truck rates from payment, insurance, driver and fuel", () => {
  const r = truckRates(validate({}).input);
  close(r.fixedPerHour, 14);
  close(r.hourlyCost, 39);
  close(r.perMileCost, 0.75);
});

test("base job: cost, revenue, profit, margin, break-even", () => {
  const r = rateOutcome({});
  close(r.hours, 1.5);
  close(r.trueCost, 81);
  close(r.revenue, 185);
  close(r.profit, 104);
  close(r.margin, 104 / 185);
  close(r.breakEven, 81);
});

test("target price is cost / (1 - margin)", () => {
  const r = rateOutcome({ targetMarginPct: 30 });
  close(r.targetPrice, 81 / 0.7);
  close(r.gapToTarget, 81 / 0.7 - 185);
});

test("winch recovery adds fee and on-scene time", () => {
  // +30 min -> 2.0 h x 39 = 78; + 22.5 miles = 100.5. Revenue 185 + 75 = 260.
  const r = rateOutcome({ winchFee: 75, winchMinutes: 30 });
  close(r.trueCost, 100.5);
  close(r.revenue, 260);
  close(r.profit, 159.5);
});

test("after-hours and weather surcharges are revenue only", () => {
  const r = rateOutcome({ afterHoursFee: 40, weatherFee: 25 });
  close(r.revenue, 250);
  close(r.trueCost, 81);
});

test("storage: 3 days at $45 billed, $10/day lot cost", () => {
  const r = rateOutcome({ storageDays: 3, storageFeePerDay: 45, storageCostPerDay: 10 });
  close(r.revenue, 185 + 135);
  close(r.trueCost, 81 + 30);
});

test("levers are ranked by profit gain with hand-checked values", () => {
  const r = rateOutcome({});
  assert.deepEqual(r.levers.map((l) => [l.key, l.gain]), [
    ["hookup", 10],
    ["rate", 7.5],
    ["scene", 6.5],     // 10/60 x 39
    ["deadhead", 5.13], // 2.5 mi x (0.75 + 39/30) = 5.125
  ]);
});

test("storage lever appears only when storage days are billed", () => {
  const r = rateOutcome({ storageDays: 2, storageFeePerDay: 40 });
  const s = r.levers.find((l) => l.key === "storage");
  assert.equal(s.gain, 10);
});

test("break-even loaded rate holds other charges fixed", () => {
  // hook-up 50: other revenue 50, cost 81, 15 billable miles -> (81-50)/15
  close(rateOutcome({ hookup: 50 }).breakEvenRate, 31 / 15);
  // hook-up alone covers cost -> 0
  assert.equal(rateOutcome({}).breakEvenRate, 0);
  // no billable miles -> null
  assert.equal(rateOutcome({ includedMiles: 20 }).breakEvenRate, null);
});

test("a losing job is flagged high severity", () => {
  const r = rateOutcome({ hookup: 40, ratePerMile: 1 });
  // revenue 40 + 15 = 55 vs cost 81 -> -26
  close(r.profit, -26);
  assert.equal(r.findings[0].severity, "high");
});

test("below-target margin is flagged medium; meeting it is info", () => {
  assert.equal(rateOutcome({ targetMarginPct: 80 }).findings[0].severity, "medium");
  assert.equal(rateOutcome({ targetMarginPct: 30 }).findings[0].severity, "info");
});

test("deadhead longer than loaded miles is called out", () => {
  const r = rateOutcome({ deadheadMiles: 30, loadedMiles: 10 });
  assert.ok(r.findings.some((f) => /deadhead/i.test(f.title)));
});

test("validation rejects bad input instead of returning NaN", () => {
  assert.match(rateOutcome({ mpg: 0 }).invalid, /Miles per gallon/);
  assert.match(rateOutcome({ billableHours: 0 }).invalid, /Billable hours/);
  assert.match(rateOutcome({ avgMph: 0 }).invalid, /speed/);
  assert.match(rateOutcome({ hookup: -1 }).invalid, /negative/);
  assert.match(rateOutcome({ targetMarginPct: 95 }).invalid, /Target margin/);
  assert.match(rateOutcome({ hookup: "abc" }).invalid, /number/);
  assert.equal(DEFAULTS.hookup, 125);
});
