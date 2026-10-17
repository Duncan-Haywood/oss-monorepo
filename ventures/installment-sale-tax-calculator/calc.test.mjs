import { test } from "node:test";
import assert from "node:assert/strict";
import { compute, amortize, SAMPLE, summaryText, sweepCsv, dollars } from "./calc.mjs";

const near = (a, b, tol = 1) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);

test("amortize repays exactly the principal", () => {
  const rows = amortize(100000, 6, 10);
  near(rows.reduce((a, r) => a + r.principal, 0), 100000, 0.01);
  near(rows.at(-1).balance, 0, 0.01);
  near(rows[0].interest, 6000, 0.01);
});

test("zero-rate note pays level principal", () => {
  const rows = amortize(100000, 0, 4);
  assert.deepEqual(rows.map((r) => Math.round(r.principal)), [25000, 25000, 25000, 25000]);
});

test("sample: gross profit, recapture and percentage", () => {
  const r = compute(SAMPLE);
  assert.deepEqual(r.errors, []);
  const t = r.totals;
  assert.equal(t.gp, 840000);
  assert.equal(t.recapture, 150000);
  assert.equal(t.instGain, 690000);
  near(t.gpp, 0.575, 1e-9);
});

test("all the gain is taxed across the schedule exactly once", () => {
  const r = compute(SAMPLE);
  const recognised = r.rows.reduce((a, y) => a + y.gain + y.recapture, 0);
  near(recognised, 840000, 0.01);
  near(r.rows.reduce((a, y) => a + y.principal, 0), 1200000, 0.01);
});

test("recapture lands in the sale year, whatever the down payment", () => {
  const r = compute({ ...SAMPLE, down: 0 });
  assert.equal(r.rows[0].recapture, 150000);
  assert.equal(r.rows[0].gain, 0);
  assert.ok(r.findings.some((f) => f.severity === "high" && /more than the cash/.test(f.title)));
});

test("sale-year tax follows the stated rates", () => {
  const r = compute(SAMPLE);
  // recapture 150000*25% + down gain 138000*15% + (150000+138000)*8.8%
  near(r.rows[0].gainTax, 37500 + 20700 + 25344, 0.5);
});

test("spreading beats lump sum when the spread rate is lower", () => {
  const r = compute(SAMPLE);
  assert.ok(r.totals.taxSaved > 0);
  assert.ok(r.totals.pvSaved > 0);
  assert.ok(r.totals.pvSaved >= r.totals.taxSaved); // deferral only adds value
});

test("equal rates: saving is zero without discounting, and the page says so", () => {
  const r = compute({ ...SAMPLE, spreadRate: 20, discount: 0 });
  near(r.totals.taxSaved, 0, 0.01);
  assert.ok(r.findings.some((f) => /saves no rate/.test(f.title)));
});

test("a fully paid sale has no note and one row", () => {
  const r = compute({ ...SAMPLE, down: 1200000 });
  assert.equal(r.rows.length, 1);
  near(r.totals.taxSaved, 690000 * 0.05, 0.01); // only the entered rate gap remains; no deferral
});

test("a loss or zero gain is refused, not computed", () => {
  const r = compute({ ...SAMPLE, price: 300000, basis: 300000, expenses: 0 });
  assert.match(r.errors[0], /no gain/);
});

test("bad input is reported", () => {
  assert.ok(compute({ ...SAMPLE, price: "" }).errors.length);
  assert.ok(compute({ ...SAMPLE, down: 2000000 }).errors.length);
  assert.ok(compute({ ...SAMPLE, years: 2.5 }).errors.length);
  assert.ok(compute({ ...SAMPLE, spreadRate: 120 }).errors.length);
});

test("low note rate triggers the minimum-interest flag; large note triggers 453A flag", () => {
  assert.ok(compute({ ...SAMPLE, rate: 2 }).findings.some((f) => /below the interest rate/.test(f.title)));
  assert.ok(compute({ ...SAMPLE, price: 9000000, basis: 100000 }).findings.some((f) => /453A/.test(f.title)));
});

test("recapture is capped at the gain", () => {
  const r = compute({ ...SAMPLE, depreciation: 5000000 });
  assert.equal(r.totals.recapture, 840000);
  assert.equal(r.totals.instGain, 0);
});

test("text and csv outputs", () => {
  const r = compute(SAMPLE);
  assert.match(summaryText(r), /not tax advice/);
  assert.equal(sweepCsv(r).trim().split("\n").length, 7);
  assert.equal(dollars(-1234.4), "-$1,234");
});
