import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULTS, THRESHOLDS, RATE, niit, netInvestmentIncome, magi, marginalNiit, analyze, num, toCsv } from "./calc.mjs";

const base = { ...DEFAULTS, wages: 0, interest: 0, dividends: 0, shortTermGains: 0, longTermGains: 0 };

test("statutory thresholds", () => {
  assert.equal(THRESHOLDS.single, 200000);
  assert.equal(THRESHOLDS.mfj, 250000);
  assert.equal(THRESHOLDS.mfs, 125000);
});

test("no tax at or below the threshold", () => {
  const r = niit({ ...base, wages: 150000, longTermGains: 50000 });
  assert.equal(r.magi, 200000);
  assert.equal(r.tax, 0);
});

test("tax is 3.8% of MAGI over the threshold when that is smaller than NII", () => {
  const r = niit({ ...base, wages: 190000, longTermGains: 50000 }); // MAGI 240k, over 40k, NII 50k
  assert.equal(r.over, 40000);
  assert.equal(r.limitedBy, "magi");
  assert.ok(Math.abs(r.tax - 40000 * RATE) < 1e-9);
});

test("tax is 3.8% of NII when NII is smaller than the excess", () => {
  const r = niit({ ...base, wages: 400000, longTermGains: 10000 });
  assert.equal(r.limitedBy, "nii");
  assert.ok(Math.abs(r.tax - 10000 * RATE) < 1e-9);
});

test("investment expenses reduce NII but not MAGI; NII never below zero", () => {
  const o = { ...base, wages: 300000, interest: 5000, investmentExpenses: 8000 };
  assert.equal(netInvestmentIncome(o), 0);
  assert.equal(magi(o), 305000);
  assert.equal(niit(o).tax, 0);
});

test("an extra gain inside the headroom costs nothing, then 3.8% on the part over", () => {
  const o = { ...base, wages: 190000, longTermGains: 0 };
  assert.equal(marginalNiit(o, 10000).added, 0);
  const m = marginalNiit(o, 30000); // 20k over
  assert.ok(Math.abs(m.added - 20000 * RATE) < 1e-9);
});

test("splitting a gain over two years can save tax", () => {
  const a = analyze({ ...base, wages: 160000, longTermGains: 0, extraGain: 120000 });
  // one year: MAGI 280k over 80k, tax 3,040. two years (60k each year): MAGI 220k, over 20k each, tax 760 x2 = 1,520.
  assert.ok(Math.abs(a.oneYear - 3040) < 1e-6);
  assert.ok(Math.abs(a.twoYears - 1520) < 1e-6);
  assert.ok(a.splitSaves > 1500);
});

test("analyze rejects a negative wage and reports a result otherwise", () => {
  assert.equal(analyze({ wages: -1 }).result, null);
  const a = analyze({});
  assert.ok(a.result.tax >= 0);
  assert.equal(a.form.length, 12);
});

test("lever: $10,000 less MAGI cuts the tax by 3.8% of $10,000 while over", () => {
  const a = analyze({ ...base, wages: 180000, longTermGains: 50000 });
  assert.ok(Math.abs(a.tenKMagiLever - 380) < 1e-6);
});

test("num parses currency strings, csv has all lines", () => {
  assert.equal(num("$1,250"), 1250);
  assert.ok(Number.isNaN(num("")));
  assert.equal(toCsv(analyze({})).trim().split("\n").length, 13);
});
