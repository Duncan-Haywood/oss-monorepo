import { test } from "node:test";
import assert from "node:assert/strict";
import { compute, limitedCostTrader, SAMPLE, summaryText, SECTORS } from "./calc.mjs";

test("limited cost trader test: under 2% of gross turnover or under £1,000", () => {
  assert.equal(limitedCostTrader(96000, 1500), true);
  assert.equal(limitedCostTrader(96000, 2000), false);
  assert.equal(limitedCostTrader(30000, 700), true);
  assert.equal(limitedCostTrader(30000, 1200), false);
});

test("worked example: IT consultant on £80k hits the 16.5% rate", () => {
  const r = compute(SAMPLE);
  assert.deepEqual(r.errors, []);
  assert.equal(r.gross, 96000);
  assert.equal(r.lct, true);
  assert.equal(r.rate, 16.5);
  assert.equal(r.frsVat, 15840);
  assert.equal(r.standardVat, 16000 - (1500 + 9000) * 0.2);
  assert.equal(r.better, "standard");
  assert.ok(r.findings.some((f) => /Limited cost trader/.test(f.title)));
});

test("a goods-heavy trader gets the sector rate, minus 1 point in year one", () => {
  const a = compute({ ...SAMPLE, goods: "20000" });
  assert.equal(a.lct, false);
  assert.equal(a.rate, SECTORS.it.rate);
  const b = compute({ ...SAMPLE, goods: "20000", firstYear: "yes" });
  assert.equal(b.rate, SECTORS.it.rate - 1);
  assert.ok(b.frsVat < a.frsVat);
});

test("a large capital asset is reclaimable under the flat rate", () => {
  const r = compute({ ...SAMPLE, goods: "20000", capital: "5000" });
  assert.equal(r.capitalReclaim, 1000);
  const small = compute({ ...SAMPLE, goods: "20000", capital: "1000" });
  assert.equal(small.capitalReclaim, 0);
});

test("eligibility and bad input", () => {
  assert.ok(compute({ ...SAMPLE, sales: "160000" }).findings.some((f) => /cannot join/.test(f.title)));
  assert.ok(compute({ ...SAMPLE, sales: "0" }).errors.length);
  assert.ok(compute({ ...SAMPLE, sector: "nope" }).errors.length);
  assert.ok(compute({ ...SAMPLE, otherCosts: "-5" }).errors.length);
  assert.match(summaryText(compute(SAMPLE)), /Not tax advice/);
});
