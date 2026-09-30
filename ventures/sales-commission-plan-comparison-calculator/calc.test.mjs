import { test } from "node:test";
import assert from "node:assert/strict";
import { commission, steadyPay, firstYearPay, capAttainment, crossovers, analyze, normalizePlan, reportCsv, samplePlans, money } from "./calc.mjs";

const plan = (o) => normalizePlan({ name: "P", base: 100000, target: 100000, threshold: 0, accel: 1, cap: 0, signing: 0, ramp: 0, ...o }).plan;

test("commission is linear to quota, then accelerated", () => {
  const p = plan({ accel: 1.5 });
  assert.equal(commission(p, 0.5), 50000);
  assert.equal(commission(p, 1), 100000);
  assert.ok(Math.abs(commission(p, 1.2) - 130000) < 1e-6);
});

test("threshold zeroes commission below it and pays from the first dollar above", () => {
  const p = plan({ threshold: 50 });
  assert.equal(commission(p, 0.49), 0);
  assert.equal(commission(p, 0.5), 50000);
});

test("cap limits commission and capAttainment reports where it binds", () => {
  const p = plan({ accel: 2, cap: 2 });
  assert.equal(commission(p, 3), 200000);
  assert.equal(capAttainment(p), 1.5);
  assert.equal(capAttainment(plan({ cap: 0 })), null);
  assert.equal(capAttainment(plan({ accel: 1, cap: 1.5 })), 1.5);
});

test("ramp months pay target variable, remaining months pay commission", () => {
  const p = plan({ ramp: 3, signing: 5000 });
  assert.equal(firstYearPay(p, 0), 100000 + 5000 + 25000);
  assert.equal(firstYearPay(p, 1), 100000 + 5000 + 25000 + 75000);
  assert.equal(steadyPay(p, 1), 200000);
});

test("crossovers interpolate where two plans pay the same", () => {
  const hi = plan({ base: 150000, target: 50000 });
  const lo = plan({ base: 100000, target: 100000 });
  // 150k + 50k*a = 100k + 100k*a  ->  a = 1
  const x = crossovers(hi, lo, steadyPay);
  assert.equal(x.length, 1);
  assert.ok(Math.abs(x[0] - 1) < 1e-9);
  assert.deepEqual(crossovers(plan({ base: 200000 }), plan({ base: 100000 }), steadyPay), []);
});

test("the sample shows a higher headline that loses at 70% attainment", () => {
  const s = samplePlans();
  const r = analyze(s.a, s.b, 70);
  assert.equal(r.ote.a, 180000);
  assert.equal(r.ote.b, 180000);
  assert.ok(r.at.b > r.at.a);
  // A leads from about 33% until B\'s threshold jump at 50%, then they tie at 100%.
  assert.equal(r.crossover.length, 3);
  assert.ok(Math.abs(r.crossover[0] - 1 / 3) < 0.011);
  assert.ok(Math.abs(r.crossover[1] - 0.5) < 0.011);
  assert.ok(Math.abs(r.crossover[2] - 1) < 1e-9);
});

test("headline vs expected finding fires when the leaders differ", () => {
  const r = analyze({ name: "A", base: 80000, target: 120000 }, { name: "B", base: 140000, target: 40000, accel: 1 }, 50);
  assert.ok(r.ote.a > r.ote.b);
  assert.ok(r.at.b > r.at.a);
  assert.ok(r.findings.some((f) => /higher headline offer is not the higher expected pay/.test(f.title)));
});

test("validation reports every bad field and never throws", () => {
  const r = analyze({ base: -1, target: "x" }, { base: 0, target: 0 }, 400);
  assert.match(r.error, /base salary/);
  assert.match(r.error, /target variable/);
  assert.match(r.error, /Expected attainment/);
  assert.match(analyze({ base: 1, target: 1, cap: 0.5 }, { base: 1, target: 1 }).error, /cap below 1x/);
});

test("first-year basis counts the guarantee", () => {
  const s = samplePlans();
  assert.ok(analyze(s.a, s.b, 70, "first").at.b > analyze(s.a, s.b, 70, "steady").at.b);
});

test("csv has a header, a row per attainment and the expected row", () => {
  const s = samplePlans();
  const lines = reportCsv(analyze(s.a, s.b, 70)).trim().split("\n");
  assert.equal(lines.length, 1 + 8 + 1);
  assert.match(lines[0], /^attainment_of_quota,"Offer A","Offer B"/);
  assert.match(lines.at(-1), /^expected_70%/);
});

test("money formats and tolerates non-numbers", () => {
  assert.equal(money(1234.6), "$1,235");
  assert.equal(money(null), "n/a");
});
