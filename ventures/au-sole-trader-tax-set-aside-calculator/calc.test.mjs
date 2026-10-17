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
  assert.equal(r.total, 17308);
  assert.equal(r.afterTax, 68692);
});
test("HELP rate adds to the total", () => {
  assert.equal(run({ helpRate: "4" }).helpRepay, 3440);
  assert.equal(run({ helpRate: "4" }).total, 17308 + 3440);
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

test("small business offset is 16% of tax, capped at $1,000", () => {
  const big = run({});
  assert.equal(big.sbito, 1000);
  const small = run({ revenue: "30000", expenses: "0" });
  assert.equal(small.grossTax, 1888);
  assert.ok(small.sbito > 0 && small.sbito <= 0.16 * small.grossTax);
  assert.ok(small.offset + small.sbito <= small.grossTax);
  assert.ok(big.findings.some((f) => /small business income tax offset/.test(f.title)));
});

test("low income tax offset: continuous at $45,000 and tapers at 1.5c above it", () => {
  assert.equal(lito(44999), 325.05);
  assert.equal(lito(45000), 325);
  assert.equal(lito(55000), 175);
});
test("HELP rate of exactly 10 percent is accepted, above 10 is not", () => {
  assert.equal(run({ helpRate: "10" }).errors.length, 0);
  assert.ok(run({ helpRate: "10.5" }).errors.length);
});
test("set-aside percentages are total over income and over profit", () => {
  const r = run({});
  assert.equal(r.setAsidePct, 15.73); // 17,308 / 110,000
  assert.equal(r.setAsideOfNet, 20.13); // 17,308 / 86,000
});
test("zero profit gives 0 percent of profit, not NaN", () => {
  const r = run({ revenue: "1000", expenses: "1000" });
  assert.equal(r.setAsideOfNet, 0);
  assert.equal(r.setAsidePct, 0);
});
test("an unknown or inherited year key falls back instead of throwing", () => {
  for (const y of ["constructor", "__proto__", "toString", "1999-00"]) {
    const r = run({ year: y });
    assert.equal(r.year, "2025-26");
    assert.equal(r.total, 17308);
  }
});

test("low income tax offset never goes negative just above its $66,667 end", () => {
  assert.equal(lito(66667.5), 0);
  assert.equal(lito(70000), 0);
});

test("only 2026-27 carries the legislated 15% rate note", () => {
  const has = (r) => r.findings.some((f) => /15% rate/.test(f.title));
  assert.ok(has(run({ year: "2026-27" })));
  assert.ok(!has(run({ year: "2025-26" })));
});
