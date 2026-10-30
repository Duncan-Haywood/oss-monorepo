import { test } from "node:test";
import assert from "node:assert/strict";
import { compute, summaryText, SAMPLE, VERIFY, parse } from "./calc.mjs";

const run = (o) => compute({ ...SAMPLE, ...o });

test("sample: 24,500 gain, 3,000 exempt, basic band 25,270 left, all at 18%", () => {
  const r = run({});
  assert.equal(r.gain, 24500);
  assert.equal(r.taxable, 21500);
  assert.equal(r.taxableIncome, 37430);
  assert.equal(r.bandLeft, 270);
  assert.equal(r.atLow, 270);
  assert.equal(r.atHigh, 21230);
  assert.equal(r.tax, r2(270 * 0.18 + 21230 * 0.24));
});
function r2(n) { return Math.round(n * 100) / 100; }

test("low income puts the whole gain in the 18% band", () => {
  const r = run({ income: 12570 });
  assert.equal(r.bandLeft, 37700);
  assert.equal(r.atHigh, 0);
  assert.equal(r.tax, 21500 * 0.18);
});

test("gain inside the exempt amount pays nothing", () => {
  const r = run({ proceeds: 17000 });
  assert.equal(r.taxable, 0);
  assert.equal(r.tax, 0);
});

test("current-year losses offset first, brought-forward only down to the exempt amount", () => {
  const r = run({ lossNow: 4500, lossBf: 100000 });
  assert.equal(r.net, 20000);
  assert.equal(r.lossUsed, 17000);
  assert.equal(r.taxable, 0);
  assert.equal(r.aeaUsed, 3000);
  assert.equal(r.lossAfter, 83000);
});

test("a loss is carried forward and no tax is due", () => {
  const r = run({ proceeds: 10000 });
  assert.equal(r.net, -5500);
  assert.equal(r.lossCarried, 5500);
  assert.equal(r.tax, 0);
});

test("personal allowance is withdrawn above 100,000", () => {
  assert.equal(run({ income: 110000 }).allowance, 7570);
  assert.equal(run({ income: 125140 }).allowance, 0);
  assert.equal(run({ income: 200000 }).bandLeft, 0);
});

test("residential property adds the 60-day duty", () => {
  assert.ok(run({ type: "property" }).obligations.some((o) => /60 days/.test(o.title)));
  assert.ok(!run({}).obligations.some((o) => /60 days/.test(o.title)));
});

test("bad input is rejected, not clamped", () => {
  assert.ok(run({ proceeds: -1 }).errors.length);
  assert.ok(run({ income: "" }).errors.length);
  assert.ok(run({ year: 2020 }).errors.length);
  assert.ok(parse({ ...SAMPLE, lossBf: "x" }).errors.length);
});

test("summary names the source and is not advice", () => {
  const t = summaryText(run({}));
  assert.ok(t.includes(VERIFY));
  assert.match(t, /Not tax advice/);
});

test("2026/27 matches 2025/26 for the same inputs and is labelled", () => {
  const a = run({ ...SAMPLE, year: 2025 }), b = run({ ...SAMPLE, year: 2026 });
  assert.equal(b.label, "2026/27");
  assert.equal(b.tax, a.tax);
});
