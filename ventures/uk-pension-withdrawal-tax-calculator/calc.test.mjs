import { test } from "node:test";
import assert from "node:assert/strict";
import { compute, incomeTax, emergencyTax, allowanceFor, SAMPLE, summaryText } from "./calc.mjs";

test("income tax bands and taper", () => {
  assert.equal(incomeTax(12570), 0);
  assert.equal(incomeTax(50270), 7540);
  assert.equal(allowanceFor(110000), 7570);
  assert.equal(allowanceFor(125140), 0);
  assert.equal(incomeTax(125140), 7540 + (125140 - 37700) * 0.4);
});

test("worked example: £40k UFPLS on £18k other income", () => {
  const r = compute(SAMPLE);
  assert.deepEqual(r.errors, []);
  assert.equal(r.taxFree, 10000);
  assert.equal(r.taxable, 30000);
  assert.equal(r.tax, 6000);
  assert.equal(r.net, 34000);
  assert.equal(r.emergency, Math.round(emergencyTax(30000) * 100) / 100);
  assert.ok(r.overpaid > 5800 && r.overpaid < 5900);
});

test("spreading over two years saves nothing when already basic rate, and saves when it crosses higher", () => {
  const a = compute(SAMPLE);
  assert.equal(a.spread[1].saving, 0);
  const b = compute({ ...SAMPLE, amount: "100000", otherIncome: "30000" });
  assert.ok(b.spread[1].saving > 0);
  assert.ok(b.spread[3].saving >= b.spread[1].saving);
});

test("lump sum allowance caps tax-free cash", () => {
  const r = compute({ ...SAMPLE, amount: "1200000", taxFreeUsed: "0" });
  assert.equal(r.taxFree, 268275);
});

test("taxable-only method and flags", () => {
  const r = compute({ ...SAMPLE, method: "taxable", amount: "10000" });
  assert.equal(r.taxFree, 0);
  assert.equal(r.taxable, 10000);
  assert.ok(r.findings.some((f) => /money purchase annual allowance/.test(f.title)));
  assert.ok(compute({ ...SAMPLE, age: "50" }).findings.some((f) => /before 55/.test(f.title)));
  const hi = compute({ ...SAMPLE, amount: "60000", otherIncome: "90000" });
  assert.ok(hi.findings.some((f) => /£100,000/.test(f.title)));
});

test("scotland and bad input are refused", () => {
  assert.match(compute({ ...SAMPLE, region: "scotland" }).errors[0], /Scotland/);
  assert.ok(compute({ ...SAMPLE, amount: "0" }).errors.length);
  assert.ok(compute({ ...SAMPLE, otherIncome: "-1" }).errors.length);
  assert.match(summaryText(compute(SAMPLE)), /Not tax advice/);
});
