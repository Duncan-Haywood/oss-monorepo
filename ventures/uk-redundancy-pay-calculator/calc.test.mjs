import { test } from "node:test";
import assert from "node:assert/strict";
import { compute, summaryText, SAMPLE, VERIFY, parse } from "./calc.mjs";

const run = (o) => compute({ ...SAMPLE, ...o });

test("sample: 47 with 12 years gets 5 weeks at 22-40 rate and 10.5 at 41+ rate, capped pay", () => {
  const r = run({});
  assert.equal(r.eligible, true);
  assert.equal(r.bands[1].years, 5);
  assert.equal(r.bands[2].years, 7);
  assert.equal(r.weeks, 15.5);
  assert.equal(r.capped, 751);
  assert.equal(r.statutory, 11640.5);
  assert.equal(r.lostToCap, 449.5);
});

test("under-22 years get half a week each", () => {
  const r = run({ age: 24, service: 6, pay: 400 });
  assert.equal(r.bands[0].years, 3);
  assert.equal(r.bands[1].years, 3);
  assert.equal(r.weeks, 4.5);
  assert.equal(r.statutory, 1800);
});

test("maximum is 20 years at 1.5 weeks and the cap: 30 weeks", () => {
  const r = run({ age: 62, service: 40, pay: 2000, year: 2025 });
  assert.equal(r.counted, 20);
  assert.equal(r.weeks, 30);
  assert.equal(r.statutory, 21570);
  assert.equal(r.statutory, r.maxStatutory);
  assert.equal(run({ age: 62, service: 40, pay: 2000, year: 2026 }).statutory, 22530);
});

test("below two years of service gets nothing", () => {
  const r = run({ service: 1 });
  assert.equal(r.eligible, false);
  assert.equal(r.statutory, 0);
  assert.ok(r.findings[0].title.includes("below the 2-year minimum"));
  assert.equal(run({ service: 2, age: 30, pay: 500 }).statutory, 1000);
});

test("pay quoted monthly or yearly is converted to a weekly figure", () => {
  assert.equal(run({ pay: 2600, period: "month" }).weekly, 600);
  assert.equal(run({ pay: 26000, period: "year" }).weekly, 500);
});

test("age 41 is the boundary for the higher rate, 22 for the middle rate", () => {
  const a = run({ age: 41, service: 1 + 1, pay: 100 });
  assert.equal(a.bands[2].years, 1);
  assert.equal(a.bands[1].years, 1);
  const b = run({ age: 22, service: 2, pay: 100 });
  assert.equal(b.bands[1].years, 1);
  assert.equal(b.bands[0].years, 1);
});

test("tax-free limit: extra pay pushes redundancy over 30,000; pay in lieu stays taxable", () => {
  const r = run({ age: 62, service: 40, pay: 2000, extra: 20000, pilon: 3000 });
  assert.equal(r.redundancyTotal, 42530);
  assert.equal(r.taxFree, 30000);
  assert.equal(r.taxableExcess, 12530);
  assert.equal(r.taxableTotal, 15530);
  assert.equal(r.grand, 45530);
  assert.ok(r.findings.some((f) => f.title.includes("above the GBP 30,000")));
  const s = run({});
  assert.equal(s.headroom, 30000 - 11640.5);
});

test("service beyond 20 years is noted as not counting", () => {
  assert.ok(run({ age: 60, service: 25 }).findings.some((f) => f.title.includes("do not add")));
});

test("bad input is rejected, never clamped", () => {
  assert.ok(compute({ ...SAMPLE, age: "" }).errors.length);
  assert.ok(compute({ ...SAMPLE, service: 1.5 }).errors.length);
  assert.ok(compute({ ...SAMPLE, pay: 0 }).errors.length);
  assert.ok(compute({ ...SAMPLE, pay: -5 }).errors.length);
  assert.ok(compute({ ...SAMPLE, age: 30, service: 20 }).errors.length);
  assert.ok(compute({ ...SAMPLE, age: 12 }).errors.length);
  assert.ok(compute({ ...SAMPLE, period: "day" }).errors.length);
  assert.ok(compute({ ...SAMPLE, year: 1999 }).errors.length);
  assert.ok(compute({ ...SAMPLE, extra: -1 }).errors.length);
  assert.ok(parse(undefined).errors.length);
});

test("summary names the source and carries the disclaimer", () => {
  const t = summaryText(run({}));
  assert.ok(t.includes(VERIFY));
  assert.ok(t.includes("No warranty"));
  assert.ok(t.includes("Statutory redundancy pay: GBP 11,640.50"));
});
