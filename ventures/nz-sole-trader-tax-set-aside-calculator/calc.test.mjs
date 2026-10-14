import { test } from "node:test";
import assert from "node:assert/strict";
import { compute, incomeTax, accLevy, studentLoan, SAMPLE, summaryText } from "./calc.mjs";

const run = (o) => compute({ ...SAMPLE, ...o });

test("2025-26 brackets match the published rates", () => {
  assert.equal(incomeTax(15600, "2025-26"), 1638);
  assert.equal(incomeTax(53500, "2025-26"), 8270.5);
  assert.equal(incomeTax(78100, "2025-26"), 15650.5);
  assert.equal(incomeTax(180000, "2025-26"), 49277.5);
  assert.equal(incomeTax(200000, "2025-26"), 57077.5);
});
test("ACC levy is capped at maximum liable earnings", () => {
  assert.equal(accLevy(100000, "2025-26"), 1670);
  assert.equal(accLevy(500000, "2025-26"), accLevy(152790, "2025-26"));
});
test("student loan is 12% above the threshold", () => {
  assert.equal(studentLoan(20000, "2025-26"), 0);
  assert.equal(studentLoan(34128, "2025-26"), 1200);
});
test("worked example is consistent", () => {
  const r = run({});
  assert.equal(r.net, 86000);
  assert.equal(r.tax, 18257.5);
  assert.equal(r.acc, 1436.2);
  assert.equal(r.total, 19693.7);
  assert.equal(r.afterTax, 66306.3);
});
test("student loan option adds to the total", () => {
  const r = run({ studentLoan: "yes" });
  assert.equal(r.loan, 7424.64);
  assert.equal(r.total, r2(19693.7 + 7424.64));
});
const r2 = (n) => Math.round(n * 100) / 100;
test("expenses above income give nothing to set aside", () => {
  assert.equal(run({ revenue: "1000", expenses: "5000" }).total, 0);
});
test("GST and provisional tax findings", () => {
  assert.ok(run({}).findings.some((f) => /\$60,000/.test(f.title)));
  assert.ok(!run({ revenue: "40000", expenses: "0" }).findings.some((f) => /\$60,000/.test(f.title)));
  assert.ok(run({}).findings.some((f) => /provisional/.test(f.title)));
  assert.ok(!run({ revenue: "30000", expenses: "0" }).findings.some((f) => /provisional/.test(f.title)));
});
test("validation", () => {
  assert.ok(run({ revenue: "" }).errors.length);
  assert.ok(run({ revenue: "-5" }).errors.length);
  assert.ok(run({ expenses: "x" }).errors.length);
});
test("summary tells the reader to verify", () => {
  assert.match(summaryText(run({})), /Verify figures on ird\.govt\.nz/);
});
