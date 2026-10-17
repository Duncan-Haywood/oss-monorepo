import { test } from "node:test";
import assert from "node:assert/strict";
import { analyze, doyle, sawnBf, costPerHour, jobEconomics, byDiameter, money, sampleInput, toCsv, DEFAULTS } from "./calc.mjs";

test("Doyle rule matches the published table values", () => {
  assert.equal(doyle(16, 16), 144);   // ((16-4)/4)^2 * 16
  assert.equal(doyle(24, 10), 250);
  assert.equal(doyle(4, 16), 0);
  assert.equal(doyle(12, 0), 0);
});

test("sawn board feet follow true volume, recovery and taper", () => {
  // 12 in small end, 8 ft, 0 taper: pi/4 * 1^2 * 8 = 6.2832 cu ft * 12 * 0.5
  assert.ok(Math.abs(sawnBf(12, 8, 0, 50) - 37.699) < 0.01);
  assert.ok(sawnBf(12, 8, 2, 50) > sawnBf(12, 8, 0, 50));
});

test("hand-computed cost per hour", () => {
  const v = { ...DEFAULTS, millPrice: 20000, resalePct: 50, years: 10, annualHours: 500, interestPct: 6, fuelGalPerHour: 1, fuelPrice: 4,
    bladePrice: 20, resharpensPerBlade: 4, sharpenCost: 5, hoursPerSharpen: 2, maintPerHour: 5, helpers: 1, helperWage: 20, ownerWage: 30 };
  const c = costPerHour(v);
  // depreciation 10000/10/500 = 2; interest 20000*1.5/2*.06/500 = 1.8 -> 3.8
  assert.equal(c.ownership, 3.8);
  assert.equal(c.fuel, 4);
  assert.equal(c.blade, 4); // (20 + 20) / (2 * 5)
  assert.equal(c.machine, 16.8);
  assert.equal(c.labor, 50);
  assert.equal(c.total, 66.8);
});

test("job: clock hours include handling and setup, setup costs labor only", () => {
  const v = { ...DEFAULTS, logs: 10, handlingMinPerLog: 6, bfPerHour: 100, setupHours: 2, tripMiles: 10, perMile: 1 };
  const j = jobEconomics(v);
  const bf = sawnBf(v.smallEndIn, v.lengthFt, v.taperInPer8Ft, v.recoveryPct) * 10;
  assert.equal(j.sawHours, Math.round((bf / 100 + 1) * 100) / 100);
  assert.equal(j.trip, 20);
  assert.equal(j.clockHours, Math.round((bf / 100 + 1 + 2) * 100) / 100);
  const c = costPerHour(v);
  assert.ok(Math.abs(j.cost - ((bf / 100 + 1) * c.total + 2 * c.labor + 20)) < 0.02);
});

test("quote at break-even rate nets about zero; quote with margin nets positive", () => {
  const base = { ...DEFAULTS };
  const j = jobEconomics(base);
  const atBreakEven = jobEconomics({ ...base, ratePerBf: j.breakEvenPerBf });
  assert.ok(Math.abs(atBreakEven.perBf.net) < 0.01 * j.cost);
  const withMargin = jobEconomics({ ...base, ratePerBf: j.quotePerBf });
  assert.ok(withMargin.perBf.net > 0);
  assert.ok(Math.abs(withMargin.perBf.net / withMargin.perBf.revenue - base.marginPct / 100) < 0.01);
});

test("small logs lose at a flat per-bf rate; threshold diameter is reported", () => {
  const rows = byDiameter({ ...DEFAULTS });
  assert.ok(rows[0].net < rows[rows.length - 1].net);
  const r = analyze({});
  assert.equal(r.minPayingDiameter, 10);
  assert.match(r.advice.join(" "), /logs under 10 in\./);
});

test("a too-low rate is called out as covering no log size", () => {
  const r = analyze({ ratePerBf: 0.1 });
  assert.equal(r.minPayingDiameter, null);
  assert.match(r.advice.join(" "), /no log size/);
  assert.equal(r.profitable || r.job.hourly.net >= 0, true);
});

test("validation", () => {
  for (const bad of [{ bfPerHour: 0 }, { annualHours: -1 }, { resalePct: 120 }, { smallEndIn: 3 }, { logs: 0 }, { marginPct: 100 }, { helperWage: -5 }, { recoveryPct: 101 }]) {
    assert.ok(analyze(bad).error, JSON.stringify(bad));
  }
});

test("money, sample and csv", () => {
  assert.equal(money(-1234.6), "-$1,235");
  assert.equal(analyze(sampleInput()).error, undefined);
  const csv = toCsv(analyze(sampleInput()));
  assert.equal(csv.trim().split("\n").length, 9);
});
