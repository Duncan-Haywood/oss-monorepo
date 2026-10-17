import { test } from "node:test";
import assert from "node:assert/strict";
import { compute, slabTax, taxAfterRebate, incomeTax, SAMPLE, summaryText } from "./calc.mjs";

const run = (o) => compute({ ...SAMPLE, ...o });
const Y = "2025-26";

test("new regime slabs match the published band bases", () => {
  assert.equal(slabTax(400000, Y), 0);
  assert.equal(slabTax(800000, Y), 20000);
  assert.equal(slabTax(1200000, Y), 60000);
  assert.equal(slabTax(1600000, Y), 120000);
  assert.equal(slabTax(2000000, Y), 200000);
  assert.equal(slabTax(2400000, Y), 300000);
  assert.equal(slabTax(3000000, Y), 480000);
  assert.equal(slabTax(0, Y), 0);
});
test("section 87A makes income up to 12 lakh tax free", () => {
  assert.equal(taxAfterRebate(1200000, Y), 0);
  assert.equal(taxAfterRebate(1000000, Y), 0);
});
test("marginal relief just above 12 lakh", () => {
  assert.equal(taxAfterRebate(1210000, Y), 10000);
  assert.equal(taxAfterRebate(1270000, Y), 70000);
  assert.equal(taxAfterRebate(1300000, Y), 75000);
});
test("cess is 4% of tax after rebate", () => {
  assert.equal(incomeTax(2000000, Y).total, 208000);
});
test("worked example", () => {
  const r = run({});
  assert.equal(r.profit, 2000000);
  assert.equal(r.tax, 208000);
  assert.equal(r.setAsidePct, 8.67);
  assert.equal(r.advanceTax[0].amount, 31200);
  assert.equal(r.advanceTax[3].amount, 208000);
});
test("44ADA treats half of receipts as profit", () => {
  const r = run({ scheme: "44ADA" });
  assert.equal(r.scheme, "44ADA");
  assert.equal(r.profit, 1200000);
  assert.equal(r.tax, 0);
  assert.ok(r.findings.some((f) => /44ADA/.test(f.title)));
});
test("44ADA above the limit falls back to actual expenses", () => {
  const r = run({ scheme: "44ADA", revenue: "6000000", expenses: "1000000" });
  assert.equal(r.scheme, "actual");
  assert.ok(r.findings.some((f) => /above the section 44ADA limit/.test(f.title)));
  const ok = run({ scheme: "44ADA", revenue: "6000000", expenses: "1000000", cash: "yes" });
  assert.equal(ok.scheme, "44ADA");
});
test("small tax needs no advance tax; GST and surcharge findings", () => {
  assert.ok(run({ revenue: "500000", expenses: "0" }).findings.some((f) => /no advance tax/.test(f.title)));
  assert.ok(run({}).findings.some((f) => /register for GST/.test(f.title)));
  assert.ok(!run({ revenue: "1500000", expenses: "0" }).findings.some((f) => /register for GST/.test(f.title)));
  assert.ok(run({ revenue: "9000000", expenses: "1000000" }).findings.some((f) => /surcharge/.test(f.title)));
});
test("expenses above receipts give nothing to set aside", () => {
  assert.equal(run({ revenue: "1000", expenses: "5000" }).total, 0);
});
test("validation", () => {
  assert.ok(run({ revenue: "" }).errors.length);
  assert.ok(run({ revenue: "-5" }).errors.length);
  assert.ok(run({ expenses: "x" }).errors.length);
});
test("summary tells the reader to verify", () => {
  assert.match(summaryText(run({})), /Verify figures on incometax\.gov\.in/);
});
