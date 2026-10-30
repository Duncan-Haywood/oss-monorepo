import { test } from "node:test";
import assert from "node:assert/strict";
import { regularTax, saleTax, exclusionFor, analyze, sampleInput, reportCsv, parseNum, money } from "./calc.mjs";

const near = (a, b, eps = 0.01) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);
const S = (o = {}) => ({ ...sampleInput(), ...o });

test("regular tax follows the 2026 brackets", () => {
  near(regularTax(12400, "single"), 1240);
  near(regularTax(100000, "mfj"), 2480 + 0.12 * 75200);
});

test("sample: $459,000 gain, $250,000 excluded, tax is 15% plus NIIT", () => {
  const a = analyze(S());
  near(a.r.gain, 459000);
  near(a.r.used, 250000);
  near(a.r.taxableGain, 209000);
  near(a.r.tax.ltcgTax, 0.15 * 209000);
  near(a.r.tax.niit, 0.038 * (120000 + 209000 - 200000));
  near(a.r.tax.total, a.r.tax.ltcgTax + a.r.tax.niit);
});

test("a couple gets $500,000 and a gain under it costs nothing", () => {
  const a = analyze(S({ status: "mfj", price: "880000" }));
  assert.equal(a.r.taxableGain, 0);
  assert.equal(a.r.tax.total, 0);
});

test("under two years and no reason: no exclusion, and waiting saves the difference", () => {
  const a = analyze(S({ ownMonths: "18", useMonths: "18" }));
  assert.equal(a.r.used, 0);
  assert.equal(a.wait.months, 6);
  near(a.wait.saved, a.r.tax.total - analyze(S()).r.tax.total);
});

test("partial exclusion is prorated by the shorter of ownership and use", () => {
  const e = exclusionFor({ status: "single", gain: 400000, depreciation: 0, ownMonths: 12, useMonths: 9, nonqualMonths: 0, partialReason: true, priorSaleWithin2Years: false });
  near(e.cap, 250000 * 9 / 24);
  assert.equal(e.basis, "partial");
});

test("a prior exclusion within two years blocks the full exclusion", () => {
  const a = analyze(S({ prior: "yes" }));
  assert.equal(a.r.used, 0);
  assert.ok(a.findings.some((f) => /last two years/.test(f.title)));
});

test("nonqualified use is allocated out by months", () => {
  const a = analyze(S({ ownMonths: "180", useMonths: "180", nonqualMonths: "60" }));
  near(a.r.nonqualGain, 459000 / 3);
  near(a.r.used, 250000);
  const big = analyze(S({ price: "700000", nonqualMonths: "90" }));
  near(big.r.used, Math.min(250000, big.r.gain / 2));
});

test("depreciation is added to the gain, never excluded, and taxed at most 25%", () => {
  const a = analyze(S({ depreciation: "20000" }));
  near(a.r.gain, 479000);
  near(a.r.recapture, 20000);
  assert.ok(a.r.tax.recapTax > 0 && a.r.tax.recapTax <= 5000);
  const only = analyze(S({ price: "360000", sellingCosts: "0", depreciation: "20000", basis: "300000", improvements: "40000" }));
  assert.ok(only.r.tax.total > 0, "recapture taxed inside the exclusion");
});

test("long-term gain stacks into the 0% band for a low-income seller", () => {
  const t = saleTax({ status: "single", income: 20000 }, { gain: 20000 });
  near(t.ltcgTax, 0);
  near(t.niit, 0);
});

test("break-even price is the most you can sell for and owe nothing", () => {
  const a = analyze(S());
  near(a.breakeven, 641000, 1);
  assert.equal(analyze(S({ price: String(Math.floor(a.breakeven)) })).r.tax.total, 0);
});

test("analyze validates inputs", () => {
  assert.match(analyze({}).error, /filing status/);
  assert.match(analyze(S({ price: "0" })).error, /sale price/);
  assert.match(analyze(S({ useMonths: "200" })).error, /cannot exceed/);
  assert.match(analyze(S({ income: "x" })).error, /income/);
});

test("csv lists the key lines", () => {
  const csv = reportCsv(analyze(S()));
  assert.match(csv, /Exclusion allowed,250000/);
  assert.equal(parseNum("$1,234.5"), 1234.5);
  assert.equal(money(1234.6), "1,235");
});

test("red team guards: year, bracket edges, blank defaults, savings", () => {
  const a = analyze(S());
  assert.equal(a.year, 2026);
  near(regularTax(50400, "single"), 1240 + 0.12 * 38000);
  near(regularTax(13000, "single"), 1240 + 0.12 * 600);
  near(regularTax(256226, "single") - regularTax(256225, "single"), 0.35);
  near(a.savedByExclusion, a.noExclusion.tax.total - a.r.tax.total);
  assert.ok(a.savedByExclusion > 0);
  // Blank nonqualified months means none, and no depreciation means no depreciation finding.
  const b = analyze(S({ nonqualMonths: "", depreciation: "" }));
  assert.equal(b.r.nonqualShare, 0);
  assert.ok(!b.findings.some((f) => /nonqualified|main home|depreciation/i.test(f.title)));
  assert.ok(analyze(S({ depreciation: "10000" })).findings.some((f) => /depreciation/.test(f.title)));
});
