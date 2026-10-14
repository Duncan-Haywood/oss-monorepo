import { test } from "node:test";
import assert from "node:assert/strict";
import { compute, incomeTax, SAMPLE, summaryText } from "./calc.mjs";

const run = (o) => compute({ ...SAMPLE, ...o });

test("brackets match the published 2025-26 amounts", () => {
  assert.equal(incomeTax(15600), 1638);
  assert.equal(incomeTax(53500), 8270.5);
  assert.equal(incomeTax(78100), 15650.5);
  assert.equal(incomeTax(180000), 49277.5);
  assert.equal(incomeTax(200000), 57077.5);
});
test("worked example is consistent", () => {
  const r = run({});
  assert.equal(r.net, 75000);
  assert.equal(r.tax, 14720.5);
  assert.equal(r.acc, 1252.5);
  assert.equal(r.total, 15973);
  assert.equal(r.afterTax, 59027);
});
test("ACC levy is capped at maximum liable earnings", () => {
  assert.equal(run({ revenue: "300000", expenses: "0" }).acc, 2551.59);
});
test("student loan adds 12% over the threshold", () => {
  const r = run({ studentLoan: "yes" });
  assert.equal(r.studentLoan, 6104.64);
  assert.equal(r.total, 15973 + 6104.64);
  assert.equal(run({ revenue: "20000", expenses: "0", studentLoan: "yes" }).studentLoan, 0);
});
test("expenses above income give nothing to set aside", () => {
  assert.equal(run({ revenue: "1000", expenses: "5000" }).total, 0);
});
test("GST and provisional tax findings", () => {
  assert.ok(run({}).findings.some((f) => /\$60,000/.test(f.title)));
  assert.ok(!run({ revenue: "40000", expenses: "0" }).findings.some((f) => /\$60,000/.test(f.title)));
  assert.ok(run({}).findings.some((f) => /provisional/.test(f.title)));
  assert.ok(!run({ revenue: "20000", expenses: "0" }).findings.some((f) => /provisional/.test(f.title)));
});
test("validation", () => {
  assert.ok(run({ revenue: "" }).errors.length);
  assert.ok(run({ revenue: "-5" }).errors.length);
  assert.ok(run({ expenses: "x" }).errors.length);
});
test("summary tells the reader to verify", () => {
  assert.match(summaryText(run({})), /Verify figures on ird\.govt\.nz/);
});
