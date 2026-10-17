import { test } from "node:test";
import assert from "node:assert/strict";
import { compute, SAMPLE, SECTORS, summaryText } from "./calc.mjs";

const base = { ...SAMPLE };

test("sample is a limited cost trader at 16.5% and standard wins or loses by the arithmetic", () => {
  const r = compute(base);
  assert.deepEqual(r.errors, []);
  assert.equal(r.isLct, true);
  assert.equal(r.frsRate, 16.5);
  assert.equal(r.grossTurnover, 72000);
  assert.equal(r.frsPayable, 11880);
  assert.equal(r.outputVat, 12000);
  assert.equal(r.inputVat, 860); // (300 + 4000) * 20%
  assert.equal(r.stdNet, 11140);
  assert.equal(r.better, "standard");
});

test("a goods-heavy business above 2% uses the sector rate", () => {
  const r = compute({ ...base, goodsSpend: "5000" });
  assert.equal(r.isLct, false);
  assert.equal(r.frsRate, 14.5);
});

test("first-year discount takes 1 point off the sector rate but not off the limited cost rate", () => {
  assert.equal(compute({ ...base, goodsSpend: "5000", firstYear: "yes" }).frsRate, 13.5);
  assert.equal(compute({ ...base, firstYear: "yes" }).frsRate, 16.5);
});

test("under £1,000 goods is limited cost even above 2% of a small turnover", () => {
  const r = compute({ ...base, turnover: "10000", goodsSpend: "400" }); // 480 inc VAT, 4% of 12,000
  assert.equal(r.isLct, true);
});

test("capital asset of £2,000+ inc VAT is reclaimable under the scheme", () => {
  const r = compute({ ...base, capitalSpend: "2000" });
  assert.equal(r.capitalReclaim, 400);
  assert.equal(r.frsNet, 11480);
  assert.equal(compute({ ...base, capitalSpend: "1000" }).capitalReclaim, 0);
});

test("join and leave limits are flagged", () => {
  assert.ok(compute({ ...base, turnover: "160000" }).findings.some((f) => /cannot join/.test(f.title)));
  assert.ok(!compute({ ...base, turnover: "149000" }).findings.some((f) => /cannot join/.test(f.title)));
});

test("flat rate wins for a low-cost retailer of food", () => {
  const retail = SECTORS.find((s) => /Retailing food/.test(s.label));
  const r = compute({ ...base, sector: retail.id, goodsSpend: "3000", otherPurchases: "0" });
  assert.equal(r.better, "frs");
});

test("bad input is rejected", () => {
  assert.ok(compute({ ...base, turnover: "" }).errors.length);
  assert.ok(compute({ ...base, sector: "" }).errors.length);
  assert.ok(compute({ ...base, goodsSpend: "-1" }).errors.length);
});

test("summary text carries the disclaimer", () => {
  assert.match(summaryText(compute(base)), /Not tax advice/);
});
