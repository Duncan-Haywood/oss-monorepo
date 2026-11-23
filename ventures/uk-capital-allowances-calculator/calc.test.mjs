import { test } from "node:test";
import assert from "node:assert/strict";
import { compute, SAMPLE, summaryText, RATES } from "./calc.mjs";

const base = { entity: "company", months: "12", taxRate: "25", profit: "", mainNew: "", mainUsed: "", specialNew: "", specialUsed: "", carMain: "", carSpecial: "", mainBf: "", specialBf: "" };

test("company: new main-rate kit under the AIA is deducted in full", () => {
  const r = compute({ ...base, mainNew: "50000" });
  assert.deepEqual(r.errors, []);
  assert.equal(r.optimal.total, 50000);
  assert.equal(r.taxSaving, 12500);
});

test("sole trader: spend within the AIA is deducted in full, cars are not", () => {
  const r = compute({ ...base, entity: "sole", taxRate: "40", mainNew: "10000", carMain: "20000" });
  assert.equal(r.optimal.aiaTotal, 10000);
  assert.equal(r.optimal.wdaMain, 2800); // £20,000 car x 14% (GOV.UK main rate from 6 April 2026)
  assert.equal(r.optimal.total, 12800);
});

test("AIA goes to special-rate items first, which beats the listed order", () => {
  const r = compute({ ...base, entity: "sole", mainNew: "700000", specialNew: "500000" });
  assert.equal(r.plan[0].category, "specialNew");
  assert.equal(r.optimal.aiaTotal, 1000000);
  assert.ok(r.optimal.total > r.naive.total);
});

test("company special-rate new spend: AIA preferred over 50% FYA when used", () => {
  const r = compute({ ...base, specialNew: "100000" });
  assert.equal(r.optimal.total, 100000);
  assert.equal(r.none.total, 50000); // CAA 2001 s58(5): the 50% balance is pooled next period
  assert.equal(r.none.carrySpecial, 50000);
});

test("AIA is pro-rated for a short period", () => {
  const r = compute({ ...base, entity: "sole", months: "6", mainUsed: "900000" });
  assert.equal(r.aiaCap, 500000);
  assert.equal(r.optimal.aiaTotal, 500000);
});

test("small pools allowance writes off a pool of £1,000 or less", () => {
  const r = compute({ ...base, entity: "sole", mainBf: "800" });
  assert.equal(r.optimal.wdaMain, 800);
});

test("worked sample runs and warns about cars", () => {
  const r = compute(SAMPLE);
  assert.deepEqual(r.errors, []);
  assert.ok(r.findings.some((f) => /cars/.test(f.title)));
  assert.ok(r.years.length === 5 && r.years[4].cumulative >= r.years[0].cumulative);
  assert.match(summaryText(r), /Not tax advice/);
});

test("claiming more than profit is flagged", () => {
  const r = compute({ ...base, profit: "10000", mainNew: "50000" });
  assert.ok(r.findings.some((f) => /loss/.test(f.title)));
});

test("bad input is rejected, not guessed", () => {
  assert.ok(compute({ ...base, mainNew: "-5" }).errors.length);
  assert.ok(compute({ ...base, months: "30" }).errors.length);
  assert.ok(compute({ ...base, taxRate: "abc" }).errors.length);
  assert.equal(RATES.aia, 1000000);
});

// Quality audit 2026-11-23 (portfolio/quality/audits/2026-11-23-uk-capital-allowances-calculator.json).
test("2026/27 rates: main pool 14%, worked sample recomputed by hand", () => {
  assert.equal(RATES.mainWda, 0.14);
  const r = compute(SAMPLE);
  // AIA 8,000 + 40,000; full expensing 60,000; main pool (20,000 + 30,000) x 14%; special 5,000 x 6%
  assert.equal(Math.round(r.optimal.total), 115300);
  assert.equal(Math.round(r.optimal.wdaMain), 7000);
});

test("sole trader: 40% first-year allowance on new main-rate kit past the AIA, balance pooled next period", () => {
  const r = compute({ ...base, entity: "sole", mainNew: "1200000" });
  assert.equal(r.optimal.aiaTotal, 1000000);
  assert.equal(r.optimal.fya, 80000); // 40% of the 200,000 over the AIA
  assert.equal(r.optimal.wdaMain, 0);
  assert.equal(r.optimal.total, 1080000);
  assert.equal(r.optimal.carryMain, 120000);
  assert.equal(Math.round(r.years[1].deduction), 16800); // 120,000 x 14% in year 2
});

test("cars get no first-year allowance, and a blank tax rate is an error", () => {
  const r = compute({ ...base, entity: "sole", carMain: "10000" });
  assert.equal(r.optimal.fya, 0);
  assert.ok(compute({ ...base, taxRate: "", mainNew: "1000" }).errors.length);
});
