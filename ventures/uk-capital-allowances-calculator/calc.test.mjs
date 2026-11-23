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

// Red team 2026-11-23: periods other than 12 months (CAA 2001 s51A(6), s56(3), s56A;
// HMRC CA23085 and CA23225: the AIA, writing-down allowance and small pools limit are
// proportionately increased or reduced; a company accounting period is at most 12 months).
test("a sole trader's 18-month period scales the AIA, WDA and small pools limit up", () => {
  const r = compute({ ...base, entity: "sole", months: "18", mainUsed: "2000000", specialBf: "1400" });
  assert.deepEqual(r.errors, []);
  assert.equal(r.aiaCap, 1500000);
  assert.equal(r.optimal.aiaTotal, 1500000);
  assert.equal(r.optimal.wdaMain, 500000 * 0.14 * 1.5);
  assert.equal(r.optimal.wdaSpecial, 1400); // under the 18-month limit of £1,500
});

test("a short period scales the small pools limit down", () => {
  const r = compute({ ...base, entity: "sole", months: "6", mainBf: "800" });
  assert.equal(r.optimal.wdaMain, 56); // 800 x 14% x 6/12: the limit is £500, so no write-off
  assert.ok(!r.findings.some((f) => /written off in full/.test(f.title)));
});

test("a company period over 12 months is refused with the split explained", () => {
  const r = compute({ ...base, months: "15", mainUsed: "1000" });
  assert.ok(r.errors.some((e) => /12 months/.test(e)));
});

test("a pool of £1 or less is still written off", () => {
  assert.equal(compute({ ...base, mainBf: "1" }).optimal.wdaMain, 1);
});

test("a profit field holding only spaces reads as blank, not £0", () => {
  const r = compute({ ...base, profit: "  ", mainNew: "5000" });
  assert.ok(!r.findings.some((f) => /loss/.test(f.title)));
});

test("spend total, tax saving per year and the sole-trader note", () => {
  const r = compute({ ...base, entity: "sole", taxRate: "20", mainNew: "1000", carMain: "2000", mainBf: "500" });
  assert.equal(r.spendTotal, 3000); // brought-forward pools are not spend
  assert.match(summaryText(r), /Spend this period: £3,000/);
  assert.equal(r.years[0].saving, r.years[0].deduction * 0.2);
  assert.ok(r.findings.some((f) => /companies only/.test(f.title)));
  const tiny = compute({ ...base, entity: "sole", specialNew: "1" });
  assert.ok(tiny.findings.some((f) => /companies only/.test(f.title)));
});

test("years 2 to 5 use a full 12-month writing-down allowance", () => {
  const r = compute({ ...base, months: "6", mainBf: "100000" });
  const carry = r.optimal.carryMain;
  assert.equal(r.years[1].deduction, Math.round(carry * 0.14 * 100) / 100);
  const y2 = Math.round(carry * 0.14 * 100) / 100;
  assert.equal(r.years[2].deduction, Math.round((carry - y2) * 0.14 * 100) / 100);
  const sp = compute({ ...base, specialBf: "100000" });
  assert.equal(sp.years[2].deduction, Math.round((sp.optimal.carrySpecial - sp.years[1].deduction) * 0.06 * 100) / 100);
});

test("a one-month period is accepted", () => {
  assert.deepEqual(compute({ ...base, months: "1" }).errors, []);
});
