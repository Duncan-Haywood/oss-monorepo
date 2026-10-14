import { test } from "node:test";
import assert from "node:assert/strict";
import { compute, incomeTax, usc, prsi, SAMPLE, summaryText } from "./calc.mjs";

const run = (o) => compute({ ...SAMPLE, ...o });

test("income tax is 20% to the cut-off, 40% above, less 4,000 credits", () => {
  assert.equal(incomeTax(10000, "2025"), 0);
  assert.equal(incomeTax(44000, "2025"), 4800);
  assert.equal(incomeTax(70000, "2025"), 15200);
});
test("USC is exempt at 13,000, banded above, with a surcharge over 100,000", () => {
  assert.equal(usc(13000, "2025"), 0);
  assert.equal(usc(70000, "2025"), 1646);
  assert.equal(usc(120000, "2025"), 6243.8);
});
test("PRSI Class S has a 500 minimum and none under 5,000", () => {
  assert.equal(prsi(4999, "2025"), 0);
  assert.equal(prsi(6000, "2025"), 500);
  assert.equal(prsi(70000, "2025"), 2887.5);
});
test("worked example is consistent", () => {
  const r = run({});
  assert.equal(r.net, 70000);
  assert.equal(r.tax, 15200);
  assert.equal(r.usc, 1646);
  assert.equal(r.prsi, 2887.5);
  assert.equal(r.total, 19733.5);
  assert.equal(r.afterTax, 50266.5);
});
test("pension relief lowers income tax only and is capped at 15% of profit", () => {
  const r = run({ pension: "5000" });
  assert.equal(r.pension, 5000);
  assert.equal(r.tax, incomeTax(65000, "2025"));
  assert.equal(r.usc, 1646);
  const big = run({ pension: "50000" });
  assert.equal(big.pension, 10500);
  assert.ok(big.findings.some((f) => /15% of profit/.test(f.title)));
});
test("expenses above income give nothing to set aside", () => {
  assert.equal(run({ revenue: "1000", expenses: "5000" }).total, 0);
});
test("VAT finding", () => {
  assert.ok(run({}).findings.some((f) => /€42,500/.test(f.title)));
  assert.ok(!run({ revenue: "40000", expenses: "0" }).findings.some((f) => /€42,500/.test(f.title)));
});
test("validation", () => {
  assert.ok(run({ revenue: "" }).errors.length);
  assert.ok(run({ revenue: "-5" }).errors.length);
  assert.ok(run({ expenses: "x" }).errors.length);
  assert.ok(run({ pension: "-1" }).errors.length);
});
test("summary tells the reader to verify", () => {
  assert.match(summaryText(run({})), /Verify figures on revenue\.ie/);
});
