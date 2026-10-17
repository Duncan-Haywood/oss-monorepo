import { test } from "node:test";
import assert from "node:assert/strict";
import { compute, incomeTax, usc, prsi, SAMPLE, summaryText } from "./calc.mjs";

const run = (o) => compute({ ...SAMPLE, ...o });

test("income tax: 20% to the band, 40% above, less both credits", () => {
  assert.deepEqual(incomeTax(44000, "2026"), { gross: 8800, credits: 4000, net: 4800 });
  assert.equal(incomeTax(54000, "2026").gross, 12800);
  assert.equal(incomeTax(5000, "2026").net, 0);
});
test("USC bands and the exemption", () => {
  assert.equal(usc(13000, "2026"), 0);
  assert.equal(usc(28700, "2026"), 393.82);
  assert.equal(usc(72000, "2026"), 1790.62);
});
test("USC adds 3% on self-employed income above 100,000", () => {
  assert.equal(usc(110000, "2026"), 5130.62);
});
test("Class S PRSI: 4.2% with a 500 minimum and a 5,000 floor", () => {
  assert.equal(prsi(5000, "2026"), 0);
  assert.equal(prsi(6000, "2026"), 500);
  assert.equal(prsi(72000, "2026"), 3024);
});
test("worked example is consistent", () => {
  const r = run({});
  assert.equal(r.profit, 72000);
  assert.equal(r.tax, 16000);
  assert.equal(r.total, 20814.62);
  assert.equal(r.afterTax, 51185.38);
});
test("expenses above income give nothing to set aside", () => {
  assert.equal(run({ revenue: "1000", expenses: "5000" }).total, 0);
});
test("VAT and surcharge findings", () => {
  assert.ok(run({}).findings.some((f) => /42,500/.test(f.title)));
  assert.ok(!run({ revenue: "30000", expenses: "0" }).findings.some((f) => /42,500/.test(f.title)));
  assert.ok(run({ revenue: "150000", expenses: "0" }).findings.some((f) => /surcharge/.test(f.title)));
});
test("validation", () => {
  assert.ok(run({ revenue: "" }).errors.length);
  assert.ok(run({ revenue: "-5" }).errors.length);
  assert.ok(run({ expenses: "x" }).errors.length);
});
test("summary tells the reader to verify", () => {
  assert.match(summaryText(run({})), /Verify figures on revenue\.ie/);
});
