import { test } from "node:test";
import assert from "node:assert/strict";
import { compute, taxableBenefits, SAMPLE, summaryText, sweepCsv, BASES } from "./calc.mjs";

const raw = (o = {}) => ({ ...SAMPLE, ...o });
const T = (benefits, other, s = "single") => taxableBenefits({ benefits, other, b1: BASES[s].b1, b2: BASES[s].b2 }).taxable;

test("at or under the first base nothing is taxable", () => {
  assert.equal(T(20000, 15000), 0); // PI 25,000
  assert.equal(T(20000, 0), 0);
});

test("between the bases up to 50% is taxable", () => {
  // PI = 20000 + 10000 = 30000 -> half of 5000 = 2500
  assert.equal(T(20000, 20000), 2500);
});

test("above the second base the 85% tier applies (Pub. 915 style example)", () => {
  // benefits 24000, other 30000: PI 42000; tier1 min(12000, 4500)=4500; tier2 .85*8000=6800; cap 20400 -> 11300
  assert.equal(T(24000, 30000), 11300);
});

test("taxable is capped at 85% of benefits", () => {
  assert.equal(T(20000, 100000), 17000);
});

test("married filing jointly uses 32,000 and 44,000", () => {
  // benefits 30000, other 30000: PI 45000; tier1 min(15000,6000)=6000; tier2 .85*1000=850 -> 6850
  assert.equal(T(30000, 30000, "mfj"), 6850);
});

test("married filing separately living together taxes from the first dollar", () => {
  // PI = 1000 + 5000 = 6000 -> tier2 5100, tier1 min(5000,0)=0 -> 5100, cap 8500
  assert.equal(T(10000, 1000, "mfs"), 5100);
});

test("sample result and marginal multiplier", () => {
  const r = compute(raw());
  assert.equal(r.errors.length, 0);
  assert.equal(r.base.pi, 43000);
  // tier1 min(15000,4500)=4500; tier2 .85*9000=7650 -> 12150; cap 25500
  assert.equal(r.base.taxable, 12150);
  assert.ok(Math.abs(r.tax - 2673) < 1e-6);
  assert.ok(Math.abs(r.multiplier - 1.85) < 1e-9);
  assert.ok(Math.abs(r.effectiveMarginal - 22 * 1.85) < 1e-9);
  assert.ok(r.findings.some((f) => f.severity === "high"));
});

test("in the 50% tier the multiplier is 1.5", () => {
  const r = compute(raw({ benefits: 20000, other: 20000 }));
  assert.ok(Math.abs(r.multiplier - 1.5) < 1e-9);
});

test("past the cap more income taxes no more benefits", () => {
  const r = compute(raw({ other: 90000 }));
  assert.equal(r.base.tier, "capped");
  assert.equal(r.multiplier, 1);
});

test("the cap income is where taxable first equals 85%", () => {
  const r = compute(raw());
  const at = taxableBenefits({ benefits: 30000, other: r.capIncome, b1: 25000, b2: 34000 }).taxable;
  assert.ok(Math.abs(at - 25500) < 1e-6);
});

test("validation reports missing and bad inputs", () => {
  assert.ok(compute(raw({ benefits: "" })).errors.length > 0);
  assert.ok(compute(raw({ status: "x" })).errors.length > 0);
  assert.ok(compute(raw({ b1: 40000, b2: 30000 })).errors.length > 0);
  assert.ok(compute(raw({ bracket: 99 })).errors.length > 0);
});

test("summary and csv render", () => {
  const r = compute(raw());
  assert.match(summaryText(r), /Taxable benefits: \$12,150/);
  assert.match(sweepCsv(r), /^other_income,/);
});

test("a blank other-income field is an error, not zero", () => {
  assert.ok(compute(raw({ other: "" })).errors.length > 0);
  assert.ok(compute(raw({ other: null })).errors.length > 0);
  assert.equal(compute(raw({ other: "0" })).errors.length, 0);
});

test("the tier label switches only above the second base", () => {
  const at = (other) => taxableBenefits({ benefits: 20000, other, b1: 25000, b2: 34000 }).tier;
  assert.equal(at(24000), "fifty"); // PI 34,000, exactly the second base
  assert.equal(at(24001), "eighty-five");
});

test("nextEdge is the nearest tier edge above current other income", () => {
  // benefits 30000: first edge at b1 - 15000 = 10,000; second at 34,000 - 15,000 = 19,000
  assert.equal(compute(raw({ other: 5000 })).nextEdge, 10000);
  assert.equal(compute(raw({ other: 12000 })).nextEdge, 19000);
  const r = compute(raw({ other: 20000 }));
  assert.ok(Math.abs(r.nextEdge - r.capIncome) < 1e-9);
  assert.equal(compute(raw({ other: 90000 })).nextEdge, null);
});

test("the sweep includes its top row when the step divides it", () => {
  // benefits 1000, bases 0 / 4000: top = 24,000, step = 2,000
  const r = compute(raw({ benefits: 1000, other: 0, b1: 0, b2: 4000 }));
  assert.equal(r.sweep.length, 13);
  assert.equal(r.sweep.at(-1).other, 24000);
});
