import { test } from "node:test";
import assert from "node:assert/strict";
import { compute, incomeTax, SAMPLE, summaryText } from "./calc.mjs";

const run = (o) => compute({ ...SAMPLE, ...o });

test("2025-26 brackets: tax-free threshold and stacking", () => {
  assert.equal(incomeTax(18200, "2026"), 0);
  assert.equal(incomeTax(45000, "2026"), 4288);
  assert.equal(incomeTax(135000, "2026"), 31288);
  assert.equal(incomeTax(190000, "2026"), 51638);
  assert.equal(incomeTax(200000, "2026"), 56138);
});
test("2026-27 lowers the 16% rate to 15%", () => {
  assert.equal(incomeTax(45000, "2027"), 4020);
  assert.ok(incomeTax(60000, "2027") < incomeTax(60000, "2026"));
});
test("worked example is consistent", () => {
  const r = run({});
  assert.equal(r.net, 86000);
  assert.equal(r.gross, incomeTax(86000, "2026"));
  assert.equal(r.offset, 1000);
  assert.equal(r.medicare, 1720);
  assert.equal(r.total, Math.round((r.incomeTax + r.medicare) * 100) / 100);
  assert.equal(r.afterTax, Math.round((r.net - r.total) * 100) / 100);
});
test("small business offset is 16% of tax, capped at $1,000", () => {
  const r = run({ revenue: "30000", expenses: "0" });
  assert.equal(r.gross, 1888);
  assert.equal(r.offset, 302.08);
});
test("super deduction lowers taxable income but cannot create a loss", () => {
  const a = run({ superDeduction: "10000" });
  assert.equal(a.taxable, 76000);
  assert.ok(a.total < run({}).total);
  const b = run({ revenue: "1000", expenses: "0", superDeduction: "5000" });
  assert.equal(b.taxable, 0);
  assert.equal(b.total, 0);
});
test("GST, cap and instalment findings", () => {
  const big = run({});
  assert.ok(big.findings.some((f) => /GST turnover/.test(f.title)));
  assert.ok(big.findings.some((f) => /PAYG instalments/.test(f.title)));
  assert.ok(!run({ revenue: "50000", expenses: "0" }).findings.some((f) => /GST turnover/.test(f.title)));
  assert.ok(run({ superDeduction: "35000" }).findings.some((f) => /concessional cap/.test(f.title)));
});
test("expenses above income give nothing to set aside", () => {
  const r = run({ revenue: "1000", expenses: "5000" });
  assert.equal(r.total, 0);
});
test("validation and summary", () => {
  assert.ok(run({ revenue: "" }).errors.length);
  assert.ok(run({ revenue: "-5" }).errors.length);
  assert.ok(run({ expenses: "x" }).errors.length);
  assert.match(summaryText(run({})), /ato\.gov\.au/);
});
