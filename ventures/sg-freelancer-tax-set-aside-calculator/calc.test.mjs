import { test } from "node:test";
import assert from "node:assert/strict";
import { compute, incomeTax, marginalRate, SAMPLE, summaryText } from "./calc.mjs";

const run = (o) => compute({ ...SAMPLE, ...o });

test("income tax matches the IRAS cumulative table", () => {
  assert.equal(incomeTax(20000, "2027"), 0);
  assert.equal(incomeTax(30000, "2027"), 200);
  assert.equal(incomeTax(80000, "2027"), 3350);
  assert.equal(incomeTax(100000, "2027"), 5650);
  assert.equal(incomeTax(120000, "2027"), 7950);
  assert.equal(incomeTax(320000, "2027"), 44550);
});
test("marginal rate", () => {
  assert.equal(marginalRate(10000, "2027"), 0);
  assert.equal(marginalRate(90000, "2027"), 0.115);
  assert.equal(marginalRate(2000000, "2027"), 0.24);
});
test("worked example is consistent", () => {
  const r = run({});
  assert.equal(r.profit, 90000);
  assert.equal(r.eir, 1000);
  assert.equal(r.chargeable, 89000);
  assert.equal(r.tax, 4385);
  assert.equal(r.afterTax, 85615);
});
test("age raises earned income relief and other reliefs reduce tax", () => {
  assert.equal(run({ age: "60plus" }).eir, 8000);
  assert.ok(run({ age: "60plus" }).tax < run({}).tax);
  assert.ok(run({ relief: "8000" }).tax < run({}).tax);
});
test("reliefs are capped at 80,000", () => {
  const r = run({ relief: "200000" });
  assert.equal(r.reliefs, 80000);
  assert.ok(r.findings.some((f) => /capped/.test(f.title)));
});
test("low profit pays nothing and expenses above income give nothing", () => {
  assert.equal(run({ revenue: "30000", expenses: "10000" }).total, 0);
  assert.equal(run({ revenue: "1000", expenses: "5000" }).total, 0);
});
test("MediSave and GST flags", () => {
  assert.ok(run({}).findings.some((f) => /MediSave/.test(f.title)));
  assert.ok(!run({ revenue: "5000", expenses: "0" }).findings.some((f) => /MediSave/.test(f.title)));
  assert.ok(run({ revenue: "900000", expenses: "0" }).findings.some((f) => /GST registration/.test(f.title)));
  assert.ok(!run({}).findings.some((f) => /GST registration/.test(f.title)));
});
test("validation", () => {
  assert.ok(run({ revenue: "" }).errors.length);
  assert.ok(run({ revenue: "-5" }).errors.length);
  assert.ok(run({ expenses: "x" }).errors.length);
  assert.ok(run({ relief: "-1" }).errors.length);
});
test("summary tells the reader to verify", () => {
  assert.match(summaryText(run({})), /Verify figures on iras\.gov\.sg/);
});
