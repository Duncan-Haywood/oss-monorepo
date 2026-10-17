import { test } from "node:test";
import assert from "node:assert/strict";
import { compute, RATES, SAMPLE, summaryText } from "./calc.mjs";

const run = (o) => compute({ ...SAMPLE, ...o });
const near = (a, b) => assert.ok(Math.abs(a - b) < 0.011, `${a} vs ${b}`);

test("a clean 21+ week at the minimum passes", () => {
  const r = run({ pay: String(12.71 * 40), hours: "40", deductions: "0", accommodation: "none" });
  assert.equal(r.ok, true);
  assert.equal(r.shortfall, 0);
});

test("one penny under fails", () => {
  const r = run({ pay: "507", hours: "40", deductions: "0", accommodation: "none" });
  assert.equal(r.ok, false);
  near(r.shortfall, 12.71 * 40 - 507);
});

test("unpaid hours drag the effective rate down", () => {
  const paid = run({ pay: "480", hours: "35", deductions: "0", accommodation: "none" });
  const worked = run({ pay: "480", hours: "40", deductions: "0", accommodation: "none" });
  assert.equal(paid.ok, true);
  assert.equal(worked.ok, false);
});

test("deductions for the employer's benefit reduce counted pay", () => {
  const r = run({ pay: "520", hours: "40", deductions: "25", accommodation: "none" });
  near(r.nmwPay, 495);
  assert.equal(r.ok, false);
});

test("free accommodation credits the offset for the period", () => {
  const r = run({ pay: "400", hours: "40", deductions: "0", accommodation: "free" });
  near(r.nmwPay, 400 + 11.1 * 7);
});

test("a charge under the offset is not a deduction and gives no credit", () => {
  const r = run({ pay: "480", hours: "40", deductions: "0", accommodation: "charged", accommodationCharge: "50" });
  near(r.nmwPay, 480);
});

test("a charge over the offset reduces pay by the excess only", () => {
  const r = run({ pay: "480", hours: "40", deductions: "0", accommodation: "charged", accommodationCharge: "100" });
  near(r.nmwPay, 480 - (100 - 11.1 * 7));
});

test("age bands and years use different minimums", () => {
  assert.equal(run({ ageBand: "18-20" }).min, 10.85);
  assert.equal(run({ ageBand: "apprentice" }).min, 8);
  assert.equal(run({ taxYear: "2025/26" }).min, RATES["2025/26"]["21+"]);
});

test("arrears and penalty: 200%, capped at 20,000, halved if prompt", () => {
  const r = run({ pay: "400", hours: "40", deductions: "0", accommodation: "none", periodsUnderpaid: "10" });
  near(r.arrears, r.shortfall * 10);
  near(r.penaltyFull, Math.min(20000, r.arrears * 2));
  near(r.penaltyPrompt, r.penaltyFull / 2);
  const big = run({ pay: "100", hours: "40", deductions: "0", accommodation: "none", periodsUnderpaid: "500" });
  assert.equal(big.penaltyFull, 20000);
});

test("validation and summary", () => {
  assert.ok(run({ pay: "" }).errors.length);
  assert.ok(run({ hours: "0" }).errors.length);
  assert.ok(run({ periodDays: "40" }).errors.length);
  assert.ok(run({ periodsUnderpaid: "1.5" }).errors.length);
  assert.ok(run({ taxYear: "1999/00" }).errors.length);
  assert.match(summaryText(run({})), /No warranty/);
});
