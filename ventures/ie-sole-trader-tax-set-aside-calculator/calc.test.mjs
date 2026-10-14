import { test } from "node:test";
import assert from "node:assert/strict";
import { compute, incomeTaxGross, usc, prsi, SAMPLE, summaryText } from "./calc.mjs";

const run = (o) => compute({ ...SAMPLE, ...o });

test("income tax is 20% to the standard band and 40% above", () => {
  assert.equal(incomeTaxGross(44000, "2026"), 8800);
  assert.equal(incomeTaxGross(70000, "2026"), 19200);
});
test("USC bands and the self-employed surcharge", () => {
  assert.equal(usc(13000, "2026"), 0);
  assert.equal(usc(28700, "2026"), 393.82);
  assert.equal(usc(70000, "2026"), 1632.82);
  assert.equal(usc(120000, "2026"), 6230.62);
});
test("PRSI has a floor and a minimum", () => {
  assert.equal(prsi(3000, "2026"), 0);
  assert.equal(prsi(6000, "2026"), 500);
  assert.equal(prsi(70000, "2026"), 2966.25);
});
test("worked example is consistent", () => {
  const r = run({});
  assert.equal(r.net, 70000);
  assert.equal(r.tax, 15200);
  assert.equal(r.usc, 1632.82);
  assert.equal(r.prsi, 2966.25);
  assert.equal(r.total, 19799.07);
  assert.equal(r.afterTax, 50200.93);
});
test("pension lowers income tax only", () => {
  const r = run({ pension: "10000" });
  assert.equal(r.tax, 11200);
  assert.equal(r.usc, 1632.82);
});
test("credits cannot make tax negative", () => {
  assert.equal(run({ revenue: "20000", expenses: "10000" }).tax, 0);
});
test("expenses above income give nothing to set aside", () => {
  assert.equal(run({ revenue: "1000", expenses: "5000" }).total, 0);
});
test("surcharge finding above 100,000", () => {
  assert.ok(run({ revenue: "150000" }).findings.some((f) => /3% USC/.test(f.title)));
  assert.ok(!run({}).findings.some((f) => /3% USC/.test(f.title)));
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
