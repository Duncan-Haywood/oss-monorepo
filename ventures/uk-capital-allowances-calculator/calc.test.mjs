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
  assert.equal(r.optimal.wdaMain, 3600);
  assert.equal(r.optimal.total, 13600);
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
  assert.equal(r.none.total, 53000);
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
