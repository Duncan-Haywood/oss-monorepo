import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULTS, analyze, costAtGross, grossForNet, num, toCsv } from "./calc.mjs";

const near = (a, b, eps = 0.01) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);

test("40h x 52w at $25: wages, FICA both sides, FUTA $42, state UI on the base", () => {
  const r = analyze(DEFAULTS).result;
  near(r.wages, 52000);
  near(r.employeeShare, 52000 * 0.0765);
  near(r.employerShare, 52000 * 0.0765);
  near(r.futa, 42);
  near(r.stateUi, 14000 * 0.025);
  near(r.employerCost, 52000 + 3978 + 42 + 350);
  near(r.takeHome, 52000 - 3978);
});

test("without the state credit FUTA is 6% of $7,000", () => {
  near(analyze({ ...DEFAULTS, futaCreditApplies: 0 }).result.futa, 420);
});

test("under the coverage threshold there is no FICA", () => {
  const a = analyze({ ...DEFAULTS, hourlyRate: 20, hoursPerWeek: 5, weeksPaid: 20 }); // $2,000
  assert.equal(a.result.employeeShare, 0);
  assert.ok(a.warnings.some((w) => /threshold/.test(w)));
});

test("under $1,000 a quarter on average there is no FUTA", () => {
  const a = analyze({ ...DEFAULTS, hourlyRate: 20, hoursPerWeek: 5, weeksPaid: 30 }); // $3,000 -> $750/q
  assert.equal(a.result.futa, 0);
  assert.ok(a.result.employeeShare > 0);
});

test("Social Security stops at the wage base, Medicare does not", () => {
  const r = costAtGross({ ...DEFAULTS, annualBonus: 0 }, 100); // $208,000
  near(r.employeeShare, 184500 * 0.062 + 208000 * 0.0145);
});

test("employer paying the employee share raises cost by that share and leaves take-home untouched", () => {
  const w = analyze(DEFAULTS).result;
  const p = analyze({ ...DEFAULTS, employerPaysEmployeeShare: 1 }).result;
  near(p.employerCost - w.employerCost, w.employeeShare);
  near(p.takeHome, 52000);
});

test("net-pay mode: gross-up reproduces the typed take-home rate", () => {
  const a = analyze({ ...DEFAULTS, rateIsNet: 1, hourlyRate: 25 });
  near(a.result.takeHomeHourly, 25, 0.001);
  assert.ok(a.grossHourly > 25);
  near(a.grossHourly, 25 / (1 - 0.0765), 0.01);
  near(grossForNet({ ...DEFAULTS }, 25), a.grossHourly, 0.001);
});

test("income tax withholding lowers take-home, not employer cost", () => {
  const a = analyze(DEFAULTS).result;
  const b = analyze({ ...DEFAULTS, fedWithholdingPct: 10 }).result;
  assert.ok(b.takeHome < a.takeHome);
  near(b.employerCost, a.employerCost);
});

test("more hours always cost more; loaded rate always exceeds the wage rate", () => {
  const g = analyze(DEFAULTS).hoursGrid;
  for (let i = 1; i < g.length; i++) assert.ok(g[i].employerCost > g[i - 1].employerCost);
  for (const row of g) assert.ok(row.loadedHourly > 25);
});

test("bad input returns warnings and no result", () => {
  const a = analyze({ ...DEFAULTS, hoursPerWeek: 0 });
  assert.equal(a.result, null);
  assert.ok(a.warnings.length);
  assert.equal(analyze({ ...DEFAULTS, weeksPaid: 60 }).result, null);
});

test("num parses currency strings and rejects blanks", () => {
  assert.equal(num("$1,200.50"), 1200.5);
  assert.ok(Number.isNaN(num("")));
});

test("csv has one line per component", () => {
  const lines = toCsv(analyze(DEFAULTS)).trim().split("\n");
  assert.equal(lines[0], "item,annual_usd");
  assert.equal(lines.length, 9);
});
