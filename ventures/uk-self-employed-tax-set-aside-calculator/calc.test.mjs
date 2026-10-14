import { test } from "node:test";
import assert from "node:assert/strict";
import { compute, incomeTax, class4, studentLoan, personalAllowance, SAMPLE, summaryText } from "./calc.mjs";

const run = (o) => compute({ ...SAMPLE, ...o });

test("income tax: allowance, 20% basic band, 40% higher, 45% additional", () => {
  assert.equal(incomeTax(12570, "2026-27").tax, 0);
  assert.equal(incomeTax(48000, "2026-27").tax, 7086);
  assert.equal(incomeTax(100000, "2026-27").tax, 27432);
  assert.equal(incomeTax(150000, "2026-27").tax, 53703);
});
test("personal allowance tapers £1 per £2 over 100,000 and is gone at 125,140", () => {
  assert.equal(personalAllowance(100000, "2026-27"), 12570);
  assert.equal(personalAllowance(110000, "2026-27"), 7570);
  assert.equal(personalAllowance(125140, "2026-27"), 0);
});
test("Class 4: 6% between 12,570 and 50,270, 2% above", () => {
  assert.equal(class4(12570, "2026-27"), 0);
  assert.equal(class4(48000, "2026-27"), 2125.8);
  assert.equal(class4(60000, "2026-27"), 2456.6);
});
test("student loan plans use their own thresholds; postgraduate is 6%", () => {
  assert.equal(studentLoan(48000, "plan2", "2026-27"), 1675.35);
  assert.equal(studentLoan(48000, "plan1", "2026-27"), 1899);
  assert.equal(studentLoan(48000, "pg", "2026-27"), 1620);
  assert.equal(studentLoan(20000, "plan2", "2026-27"), 0);
  assert.equal(studentLoan(48000, "none", "2026-27"), 0);
  assert.equal(studentLoan(48000, "plan2", "2025-26"), 1757.7);
});
test("worked example is consistent", () => {
  const r = run({});
  assert.equal(r.profit, 48000);
  assert.equal(r.tax, 7086);
  assert.equal(r.class4, 2125.8);
  assert.equal(r.total, 9211.8);
  assert.equal(r.afterTax, 38788.2);
  assert.equal(r.poaEach, 4605.9);
});
test("trading allowance replaces small expenses and cannot exceed income", () => {
  const r = run({ revenue: "800", expenses: "0" });
  assert.equal(r.allowanceUsed, true);
  assert.equal(r.profit, 0);
  assert.equal(run({ revenue: "5000", expenses: "300" }).profit, 4000);
  assert.equal(run({ revenue: "5000", expenses: "2000" }).allowanceUsed, false);
});
test("payments on account finding appears at £1,000 and above only", () => {
  assert.ok(run({}).findings.some((f) => /Payments on account/.test(f.title)));
  assert.ok(!run({ revenue: "15000", expenses: "0" }).findings.some((f) => /Payments on account/.test(f.title)));
});
test("VAT and allowance-taper findings", () => {
  assert.ok(run({ revenue: "95000", expenses: "0" }).findings.some((f) => /register for VAT/.test(f.title)));
  assert.ok(!run({}).findings.some((f) => /register for VAT/.test(f.title)));
  assert.ok(run({ revenue: "110000", expenses: "0" }).findings.some((f) => /personal allowance/.test(f.title)));
});
test("expenses above income give nothing to set aside", () => {
  assert.equal(run({ revenue: "1000", expenses: "5000" }).total, 0);
});
test("validation", () => {
  assert.ok(run({ revenue: "" }).errors.length);
  assert.ok(run({ revenue: "-5" }).errors.length);
  assert.ok(run({ expenses: "x" }).errors.length);
});
test("summary tells the reader to verify", () => {
  assert.match(summaryText(run({})), /Verify figures on gov\.uk/);
});
