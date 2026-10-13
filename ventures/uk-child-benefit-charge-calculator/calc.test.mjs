import { test } from "node:test";
import assert from "node:assert/strict";
import { compute, summaryText, SAMPLE, VERIFY, chargePercent, benefit, parse } from "./calc.mjs";

const run = (o) => compute({ ...SAMPLE, ...o });

test("charge percent: nil to 60,000, 1% per full 200, 100% from 80,000", () => {
  assert.equal(chargePercent(60000), 0);
  assert.equal(chargePercent(60199), 0);
  assert.equal(chargePercent(60200), 1);
  assert.equal(chargePercent(70000), 50);
  assert.equal(chargePercent(79999), 99);
  assert.equal(chargePercent(80000), 100);
  assert.equal(chargePercent(120000), 100);
});

test("benefit: 2025/26 two children for 52 weeks is 2,251.60", () => {
  assert.equal(benefit(2, 52, 26.05, 17.25), 2251.6);
  assert.equal(benefit(1, 52, 26.05, 17.25), 1354.6);
});

test("sample: 68,000 less 2,000 pension is ANI 66,000, 30% charge", () => {
  const r = run({});
  assert.equal(r.ani, 66000);
  assert.equal(r.pct, 30);
  assert.equal(r.received, 2251.6);
  assert.equal(r.charge, 675.48);
  assert.equal(r.net, 1576.12);
  assert.equal(r.toBelow, 6000);
});

test("pension and Gift Aid both reduce adjusted net income", () => {
  assert.equal(run({ income: 70000, pension: 5000, giftAid: 5000 }).ani, 60000);
  assert.equal(run({ income: 70000, pension: 5000, giftAid: 5000 }).charge, 0);
});

test("at or under the threshold there is no charge and no reduction advice", () => {
  const r = run({ income: 55000, pension: 0 });
  assert.equal(r.charge, 0);
  assert.equal(r.toBelow, 0);
  assert.ok(!r.findings.some((f) => /would take adjusted net income/.test(f.title)));
});

test("full clawback above 80,000", () => {
  const r = run({ income: 95000, pension: 0 });
  assert.equal(r.charge, r.received);
  assert.equal(r.net, 0);
});

test("marginal add-on inside the band is benefit over 20,000 per pound", () => {
  const r = run({ income: 65000, pension: 0 });
  assert.equal(r.marginalAddOn, Math.round(r.received / 200 * 100) / 100);
  assert.equal(run({ income: 90000, pension: 0 }).marginalAddOn, 0);
});

test("2026/27 reuses 2025/26 rates and says so unless rates are typed", () => {
  const a = run({ year: 2026 });
  assert.ok(a.findings.some((f) => /2026\/27 weekly rates/.test(f.title)));
  const b = run({ year: 2026, eldestRate: 27, otherRate: 18 });
  assert.ok(!b.findings.some((f) => /2026\/27 weekly rates/.test(f.title)));
  assert.equal(b.received, (27 + 18) * 52);
});

test("bad input is rejected, not clamped", () => {
  assert.ok(compute({ ...SAMPLE, income: "" }).errors.length);
  assert.ok(compute({ ...SAMPLE, income: -1 }).errors.length);
  assert.ok(compute({ ...SAMPLE, children: 0 }).errors.length);
  assert.ok(compute({ ...SAMPLE, weeks: 60 }).errors.length);
  assert.ok(compute({ ...SAMPLE, year: 1999 }).errors.length);
  assert.ok(parse({}).errors.length);
});

test("deadlines follow the tax year and the summary names its source", () => {
  const r = run({});
  assert.equal(r.deadlines.register, "2026-10-05");
  assert.equal(r.deadlines.returnAndPay, "2027-01-31");
  assert.ok(summaryText(r).includes(VERIFY));
});
