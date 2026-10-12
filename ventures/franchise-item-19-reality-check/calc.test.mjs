import { test } from "node:test";
import assert from "node:assert/strict";
import { parseNumber, parseTiers, unitPnl, breakEvenRevenue, analyze, fieldsToCosts, toCsv, toText, DEFAULTS, EXAMPLE_TIERS } from "./calc.mjs";

const COSTS = { royaltyPct: 6, adFundPct: 2, cogsPct: 30, variableLaborPct: 0, otherVariablePct: 2, fixedPerYear: 200000, investment: 400000, ownerSalary: 60000, systemUnits: 0, nonReportingPct: 60 };

test("parseNumber handles currency, commas and k/m suffixes", () => {
  assert.equal(parseNumber("$1,450,000"), 1450000);
  assert.equal(parseNumber("850k"), 850000);
  assert.equal(parseNumber("1.2M"), 1200000);
  assert.equal(parseNumber("6%"), 6);
  assert.ok(Number.isNaN(parseNumber("abc")));
  assert.ok(Number.isNaN(parseNumber("")));
});

test("parseTiers reads commas, tabs and pipes and keeps thousands separators", () => {
  const { tiers, errors } = parseTiers("A, 10, $1,200,000\nB\t5\t900000\nC | 2 | 400k\n# comment\n\n");
  assert.deepEqual(errors, []);
  assert.deepEqual(tiers.map((t) => [t.label, t.units, t.revenue]), [["A", 10, 1200000], ["B", 5, 900000], ["C", 2, 400000]]);
});

test("parseTiers reports bad lines without dropping good ones", () => {
  const { tiers, errors } = parseTiers("A, 10, 100000\nonly two, 3\nB, 0, 5\nC, 2.5, 5\nD, 4, x");
  assert.equal(tiers.length, 1);
  assert.equal(errors.length, 4);
});

test("unitPnl: hand-worked case", () => {
  // 1,000,000 revenue: variable 40% = 400,000 (royalty 60,000, ad 20,000); fixed 200,000 -> 400,000 left
  const p = unitPnl(1000000, COSTS);
  assert.equal(p.royalty, 60000);
  assert.equal(p.adFund, 20000);
  assert.equal(p.variable, 400000);
  assert.equal(p.ownerEarnings, 400000);
});

test("breakEvenRevenue: fixed over contribution margin, with and without a salary target", () => {
  assert.equal(breakEvenRevenue(COSTS), 200000 / 0.6);
  assert.equal(breakEvenRevenue(COSTS, 60000), 260000 / 0.6);
  assert.equal(breakEvenRevenue({ ...COSTS, cogsPct: 95 }), null);
});

test("analyze: average, median tier and below-average share on the example", () => {
  const r = analyze({ text: EXAMPLE_TIERS, costs: COSTS });
  assert.deepEqual(r.errors, []);
  assert.equal(r.reporting, 96);
  assert.equal(r.average, (1450000 + 1020000 + 810000 + 560000) / 4);
  // 96 units; middle unit (48th) falls in the second-lowest tier by revenue (810k)
  assert.equal(r.median, 810000);
  assert.equal(r.belowAvgPct, 50);
  assert.equal(r.lowest, 560000);
});

test("analyze: per tier owner earnings, cash-on-cash and payback are consistent", () => {
  const r = analyze({ text: "Top, 1, 1000000", costs: COSTS });
  const t = r.tiers[0];
  assert.equal(t.ownerEarnings, 400000);
  assert.equal(t.afterSalary, 340000);
  assert.equal(t.cashOnCash, 100);
  assert.equal(t.paybackYears, 1);
});

test("analyze: a tier below break-even never pays back and counts as unprofitable", () => {
  const r = analyze({ text: "Low, 3, 300000\nHigh, 1, 1500000", costs: COSTS });
  const low = r.tiers.find((t) => t.label === "Low");
  assert.ok(low.ownerEarnings < 0);
  assert.equal(low.paybackYears, null);
  assert.equal(r.unprofitablePct, 75);
});

test("analyze: coverage and system-wide estimate use the non-reporting assumption", () => {
  const r = analyze({ text: "A, 50, 1000000", costs: { ...COSTS, systemUnits: 100, nonReportingPct: 50 } });
  assert.equal(r.coveragePct, 50);
  assert.equal(r.systemWideAverage, (50 * 1000000 + 50 * 500000) / 100);
  assert.ok(r.notices.some((n) => /Only 50%/.test(n)));
  assert.ok(r.atSystemWide.ownerEarnings < r.atAverage.ownerEarnings);
});

test("analyze: reporting more units than the system total is an error", () => {
  const r = analyze({ text: "A, 50, 1000000", costs: { ...COSTS, systemUnits: 40 } });
  assert.ok(r.errors.some((e) => /exceed the system total/.test(e)));
});

test("analyze: skew notice when the mean is well above the median", () => {
  const r = analyze({ text: "Whale, 1, 5000000\nA, 9, 500000\nB, 9, 450000", costs: COSTS });
  assert.ok(r.notices.some((n) => /pulled up by the top tier/.test(n)));
});

test("analyze: costs of 100% or more are rejected; empty input is rejected", () => {
  assert.ok(analyze({ text: "A, 1, 1", costs: { ...COSTS, cogsPct: 95 } }).errors.length);
  assert.ok(analyze({ text: "", costs: COSTS }).errors.length);
});

test("fieldsToCosts falls back to defaults on blanks and junk", () => {
  const c = fieldsToCosts({ royaltyPct: "", adFundPct: "x", cogsPct: "28" });
  assert.equal(c.royaltyPct, DEFAULTS.royaltyPct);
  assert.equal(c.adFundPct, DEFAULTS.adFundPct);
  assert.equal(c.cogsPct, 28);
});

test("exports contain the tiers and the headline numbers", () => {
  const r = analyze({ text: EXAMPLE_TIERS, costs: COSTS });
  const csv = toCsv(r);
  assert.equal(csv.split("\n").length, 5);
  assert.match(toText(r), /Reporting units: 96/);
  assert.match(toText(r), /Payback at median/);
});
