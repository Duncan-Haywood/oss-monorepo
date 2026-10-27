import { test } from "node:test";
import assert from "node:assert/strict";
import { compute, grossTax, rebateFor, medicalCredit, raDeduction, SAMPLE, summaryText } from "./calc.mjs";

const run = (o) => compute({ ...SAMPLE, ...o });

test("sliding scale matches the published band bases", () => {
  assert.equal(grossTax(237100, "2025/26"), 42678);
  assert.equal(grossTax(370500, "2025/26"), 77362);
  assert.equal(grossTax(512800, "2025/26"), 121475);
  assert.equal(grossTax(1817000, "2025/26"), 644489);
  assert.equal(grossTax(480000, "2025/26"), 111307);
  assert.equal(grossTax(0, "2025/26"), 0);
});
test("tax threshold: primary rebate cancels tax at R95,750", () => {
  assert.equal(grossTax(95750, "2025/26"), rebateFor("under65", "2025/26"));
  assert.equal(run({ revenue: "95750", expenses: "0", medical: "0" }).tax, 0);
});
test("age rebates stack", () => {
  assert.equal(rebateFor("under65", "2025/26"), 17235);
  assert.equal(rebateFor("65-74", "2025/26"), 26679);
  assert.equal(rebateFor("75+", "2025/26"), 29824);
});
test("medical credits: two at the first rate, the rest at the additional rate", () => {
  assert.equal(medicalCredit(0, "2025/26"), 0);
  assert.equal(medicalCredit(1, "2025/26"), 4368);
  assert.equal(medicalCredit(2, "2025/26"), 8736);
  assert.equal(medicalCredit(4, "2025/26"), 8736 + 2 * 246 * 12);
});
test("retirement annuity deduction: 27.5% of profit, capped at R350,000", () => {
  assert.equal(raDeduction(50000, 480000, "2025/26"), 50000);
  assert.equal(raDeduction(500000, 480000, "2025/26"), 132000);
  assert.equal(raDeduction(500000, 5000000, "2025/26"), 350000);
});
test("worked example is consistent", () => {
  const r = run({});
  assert.equal(r.profit, 480000);
  assert.equal(r.grossTax, 111307);
  assert.equal(r.tax, 89704);
  assert.equal(r.total, 89704);
  assert.equal(r.afterTax, 390296);
  assert.equal(r.firstPayment, 44852);
});
test("a retirement annuity lowers the tax", () => {
  assert.ok(run({ ra: "60000" }).total < run({}).total);
});
test("expenses above income give nothing to set aside", () => {
  assert.equal(run({ revenue: "1000", expenses: "5000" }).total, 0);
});
test("VAT and provisional tax findings", () => {
  assert.ok(run({}).findings.some((f) => /provisional/.test(f.title)));
  assert.ok(run({ revenue: "1200000", expenses: "0" }).findings.some((f) => /must register for VAT/.test(f.title)));
  assert.ok(run({ revenue: "200000" }).findings.some((f) => /voluntarily/.test(f.title)));
  assert.ok(!run({ revenue: "30000", expenses: "0" }).findings.some((f) => /VAT/.test(f.title)));
});
test("validation", () => {
  assert.ok(run({ revenue: "" }).errors.length);
  assert.ok(run({ revenue: "-5" }).errors.length);
  assert.ok(run({ expenses: "x" }).errors.length);
  assert.ok(run({ medical: "-1" }).errors.length);
  assert.ok(run({ ra: "x" }).errors.length);
});
test("summary tells the reader to verify", () => {
  assert.match(summaryText(run({})), /Verify figures on sars\.gov\.za/);
});

test("band edge: R1 over the R1,817,000 boundary is taxed at 41%, not 45%", () => {
  assert.equal(grossTax(1817001, "2025/26"), 644489.45);
  assert.equal(grossTax(1816999, "2025/26"), 644488.59);
});
test("perThousand is tax per R1,000 invoiced", () => {
  const r = run({ revenue: "600000", expenses: "120000" });
  assert.equal(r.perThousand, 149.51);
  assert.equal(run({ revenue: "0", expenses: "0" }).perThousand, 0);
  assert.equal(compute({ ...SAMPLE, revenue: "0.5", expenses: "0" }).perThousand, 0);
});
test("fractional medical scheme members are rejected", () => {
  assert.ok(run({ medical: "1.5" }).errors.length > 0);
  assert.equal(run({ medical: "2" }).errors.length, 0);
});
