import { test } from "node:test";
import assert from "node:assert/strict";
import { compute, incomeTax, earnersLevy, studentLoan, SAMPLE, summaryText } from "./calc.mjs";

const run = (o) => compute({ ...SAMPLE, ...o });

test("income tax brackets stack", () => {
  assert.equal(incomeTax(15600, "2025"), 1638);
  assert.equal(incomeTax(60000, "2025"), 10220.5);
  assert.equal(incomeTax(0, "2025"), 0);
});
test("top bracket is 39% above $180,000", () => {
  assert.equal(incomeTax(200000, "2025"), r(incomeTax(180000, "2025") + 20000 * 0.39));
});
function r(n) { return Math.round(n * 100) / 100; }
test("earners' levy is capped at maximum liable earnings", () => {
  assert.equal(earnersLevy(50000, "2025"), 835);
  assert.equal(earnersLevy(500000, "2025"), earnersLevy(152790, "2025"));
});
test("student loan is 12% over the threshold", () => {
  assert.equal(studentLoan(24128, "2025"), 0);
  assert.equal(studentLoan(44128, "2025"), 2400);
});
test("sample runs and totals add up", () => {
  const x = run({});
  assert.deepEqual(x.errors, []);
  assert.equal(x.net, 75000);
  assert.equal(x.work, 525);
  assert.equal(x.total, r(x.tax + x.earners + x.work + x.loan));
  assert.equal(x.loan, 0);
});
test("student loan toggle adds repayments", () => {
  assert.ok(run({ studentLoan: "yes" }).loan > 0);
});
test("flags GST above $60,000 and provisional tax", () => {
  const x = run({});
  assert.ok(x.findings.some((f) => /GST registration/.test(f.title)));
  assert.ok(x.findings.some((f) => /provisional/.test(f.title)));
  assert.ok(!run({ revenue: "40000", expenses: "0" }).findings.some((f) => /GST registration/.test(f.title)));
});
test("expenses above revenue give zero tax", () => {
  const x = run({ revenue: "1000", expenses: "5000" });
  assert.equal(x.total, 0);
});
test("bad input is rejected", () => {
  assert.ok(compute({ ...SAMPLE, revenue: "abc" }).errors.length);
  assert.ok(compute({ ...SAMPLE, revenue: "" }).errors.length);
  assert.ok(compute({ ...SAMPLE, expenses: "-1" }).errors.length);
  assert.ok(compute({ ...SAMPLE, workLevyRate: "50" }).errors.length);
});
test("summary carries the verify line", () => {
  assert.match(summaryText(run({})), /Not tax advice/);
});
