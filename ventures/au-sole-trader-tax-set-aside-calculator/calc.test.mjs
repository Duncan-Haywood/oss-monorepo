import { test } from "node:test";
import assert from "node:assert/strict";
import { compute, incomeTax, lito, SAMPLE, summaryText } from "./calc.mjs";

const run = (o) => compute({ ...SAMPLE, ...o });

test("2025-26 brackets match the published base amounts", () => {
  assert.equal(incomeTax(18200, "2025-26"), 0);
  assert.equal(incomeTax(45000, "2025-26"), 4288);
  assert.equal(incomeTax(135000, "2025-26"), 31288);
  assert.equal(incomeTax(190000, "2025-26"), 51638);
  assert.equal(incomeTax(200000, "2025-26"), 56138);
});
test("2026-27 lowers the second bracket to 15%", () => {
  assert.equal(incomeTax(45000, "2026-27"), 4020);
  assert.ok(incomeTax(80000, "2026-27") < incomeTax(80000, "2025-26"));
});
test("low income tax offset phases out", () => {
  assert.equal(lito(30000), 700);
  assert.equal(lito(45000), 325);
  assert.ok(lito(66667) < 0.01);
  assert.equal(lito(80000), 0);
});
test("offset never exceeds tax", () => {
  const r = run({ revenue: "20000", expenses: "0" });
  assert.equal(r.tax, 0);
  assert.equal(r.offset, 288);
  assert.equal(r.medicare, 400);
});
test("worked example is consistent", () => {
  const r = run({});
  assert.equal(r.net, 86000);
  assert.equal(r.grossTax, 16588); // 4,288 + 30% of 41,000
  assert.equal(r.medicare, 1720);
  assert.equal(r.total, 18308);
  assert.equal(r.afterTax, 67692);
});
test("HELP rate adds to the total", () => {
  assert.equal(run({ helpRate: "4" }).helpRepay, 3440);
  assert.equal(run({ helpRate: "4" }).total, 18308 + 3440);
});
test("expenses above income give nothing to set aside", () => {
  const r = run({ revenue: "1000", expenses: "5000" });
  assert.equal(r.total, 0);
});
test("GST and instalment findings", () => {
  assert.ok(run({}).findings.some((f) => /\$75,000/.test(f.title)));
  assert.ok(!run({ revenue: "50000", expenses: "0" }).findings.some((f) => /\$75,000/.test(f.title)));
  assert.ok(run({}).findings.some((f) => /PAYG instalments/.test(f.title)));
});
test("validation", () => {
  assert.ok(run({ revenue: "" }).errors.length);
  assert.ok(run({ revenue: "-5" }).errors.length);
  assert.ok(run({ helpRate: "50" }).errors.length);
  assert.ok(run({ expenses: "x" }).errors.length);
});
test("summary tells the reader to verify", () => {
  assert.match(summaryText(run({})), /Verify figures on ato\.gov\.au/);
});
