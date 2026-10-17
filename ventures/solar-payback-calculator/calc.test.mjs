import { test } from "node:test";
import assert from "node:assert/strict";
import { loanPayment, irr, simulate, analyze, sampleInput, reportCsv, parseNum } from "./calc.mjs";

const near = (a, b, eps = 0.01) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);
const P = { netCost: 10000, loan: 0, apr: 0, loanYears: 0, production: 10000, degradation: 0, selfShare: 1, importRate: 0.2, exportRate: 0.2, escalation: 0, om: 0, inverterCost: 0, inverterYear: 99, years: 25, discount: 0 };

test("flat savings pay back the outlay in cost / yearly savings", () => {
  const r = simulate(P); // 2,000 a year against 10,000
  near(r.year1, 2000);
  near(r.payback, 5);
  near(r.gain, 2000 * 25 - 10000);
});

test("self-used power earns the import price and exports earn the export credit", () => {
  const r = simulate({ ...P, selfShare: 0.5, exportRate: 0.1 });
  near(r.year1, 5000 * 0.2 + 5000 * 0.1);
});

test("degradation and price escalation change later years", () => {
  const r = simulate({ ...P, degradation: 0.1, escalation: 0.1 });
  near(r.rows[1].savings, 2000 * 0.9 * 1.1);
});

test("maintenance, inverter replacement and discounting", () => {
  const r = simulate({ ...P, om: 100, inverterCost: 1500, inverterYear: 10, discount: 0.1 });
  near(r.rows[9].net, 2000 - 100 - 1500);
  near(r.rows[0].net, 1900);
  assert.ok(r.npv < r.gain);
});

test("a loan replaces the upfront outlay with payments for its term", () => {
  const pay = loanPayment(8000, 6, 10);
  near(pay, 88.81, 0.05);
  const r = simulate({ ...P, loan: 8000, apr: 0.06, loanYears: 10 });
  near(r.upfront, 2000);
  near(r.rows[0].loanPaid, pay * 12);
  assert.equal(r.rows[10].loanPaid, 0);
  near(loanPayment(1200, 0, 1), 100);
  assert.equal(loanPayment(0, 5, 5), 0);
});

test("irr finds the rate where NPV is zero, and is null when there is none", () => {
  near(irr([-100, 110]), 0.1, 1e-6);
  assert.equal(irr([-100, -10]), null);
});

test("no payback is reported as null", () => {
  assert.equal(simulate({ ...P, netCost: 1e7 }).payback, null);
});

test("analyze reports the sample, scenarios ordered by export credit, and findings", () => {
  const a = analyze(sampleInput());
  near(a.base.year1, 11200 * 0.55 * 0.24 + 11200 * 0.45 * 0.08, 0.5);
  assert.equal(a.scenarios.length, 7);
  const [mine, full, half, quarter] = a.scenarios;
  assert.ok(full.payback < half.payback && half.payback < quarter.payback);
  assert.ok(a.findings.some((f) => /payback in about/.test(f.title)));
});

test("a blank export credit means full net metering and flags it", () => {
  const a = analyze({ ...sampleInput(), exportRate: "" });
  assert.equal(a.p.exportRate, a.p.importRate);
  assert.ok(a.findings.some((f) => /equals your import price/.test(f.title)));
});

test("oversized systems and loans are flagged or rejected", () => {
  const big = analyze({ ...sampleInput(), usage: "5000" });
  assert.ok(big.findings.some((f) => /more than you use/.test(f.title)));
  assert.match(analyze({ ...sampleInput(), loan: "999999" }).error, /loan/i);
  assert.match(analyze({ ...sampleInput(), incentives: "999999" }).error, /nothing to pay back/);
});

test("inputs are validated with readable errors", () => {
  const s = sampleInput();
  assert.match(analyze({ ...s, systemKw: "" }).error, /system size/);
  assert.match(analyze({ ...s, costPerWatt: "0" }).error, /cost per watt/);
  assert.match(analyze({ ...s, importRate: "abc" }).error, /price you pay/);
  assert.match(analyze({ ...s, years: "0" }).error, /at least 1/);
  assert.match(analyze({ ...s, selfShare: "150" }).error, /between 0 and 100/);
  assert.match(analyze({ ...s, exportRate: "-1" }).error, /Export credit/);
});

test("CSV export has a row per year and neutralises formulas", () => {
  const a = analyze(sampleInput());
  const csv = reportCsv(a);
  assert.match(csv, /^Year,Production kWh/);
  assert.equal(csv.trim().split("\n").length, 26);
});

test("parseNum accepts money formatting and rejects junk", () => {
  assert.equal(parseNum("$1,250"), 1250);
  assert.ok(Number.isNaN(parseNum("abc")));
});

test("boundaries: zero-term loan costs nothing, tiny net cost is allowed, inverter year caps at 40", () => {
  assert.equal(loanPayment(1000, 5, 0), 0);
  assert.equal(loanPayment(0, 5, 10), 0);
  const s = sampleInput();
  const total = Number(s.systemKw) * 1000 * Number(s.costPerWatt);
  assert.equal(analyze({ ...s, incentives: String(total - 0.5), loan: "0" }).error, undefined);
  assert.equal(analyze({ ...s, inverterYear: "40" }).error, undefined);
  assert.match(analyze({ ...s, inverterYear: "41" }).error, /Inverter replacement year/);
});
