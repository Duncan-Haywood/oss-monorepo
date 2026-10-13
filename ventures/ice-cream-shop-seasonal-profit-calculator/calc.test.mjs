import { test } from "node:test";
import assert from "node:assert/strict";
import { compute, parseMonths, monthlyPayment, SAMPLE, summaryText, monthsCsv, MONTHS } from "./calc.mjs";

const closed = MONTHS.map((m) => `${m}, 0, 0`);
const withMonth = (name, days, cust) => closed.map((l) => (l.startsWith(name) ? `${name}, ${days}, ${cust}` : l)).join("\n");
const base = { ticket: "8", cogsPct: "25", feesPct: "3", wage: "15", burdenPct: "10", minHours: "16", custPerLaborHour: "10", utilitiesMonthly: "800", fixedMonthly: "3000", startupCost: "100000", loanAmount: "", loanApr: "", loanYears: "", ownerDrawTarget: "", months: withMonth("Jul", 30, 200) };
const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);

test("one open month matches the hand calculation", () => {
  const r = compute(base), jul = r.rows[6];
  close(jul.customers, 6000);                // 30 days x 200
  close(jul.revenue, 48000);                 // x $8
  close(jul.cogs, 12000);                    // 25%
  close(jul.fees, 1440);                     // 3%
  close(jul.labor, 30 * 20 * 15 * 1.1);      // 200/10 = 20 hours a day beats the 16 minimum
  close(jul.profit, 48000 - 12000 - 1440 - 9900 - 800 - 3000);
});

test("a quiet day is staffed at the minimum crew, not at zero", () => {
  const jul = compute({ ...base, months: withMonth("Jul", 30, 20) }).rows[6];
  close(jul.labor, 30 * 16 * 15 * 1.1);
});

test("closed months pay fixed costs only", () => {
  const r = compute(base), jan = r.rows[0];
  close(jan.profit, -3000);
  assert.equal(jan.verdict, "closed");
  assert.equal(jan.breakEvenCust, null);
  close(r.totals.fixed, 36000);
});

test("break-even customers per day makes that month's profit zero", () => {
  const r = compute(base), jul = r.rows[6];
  const check = compute({ ...base, months: withMonth("Jul", 30, jul.breakEvenCust) }).rows[6];
  close(check.profit, 0, 1e-3);
  assert.ok(jul.breakEvenCust < 200);
});

test("a month that cannot cover its own labor and utilities gets a close verdict and the saving is its loss", () => {
  const r = compute({ ...base, months: withMonth("Jul", 30, 20) });
  const jul = r.rows[6];
  assert.equal(jul.verdict, "close");
  close(r.savedByClosing, -jul.before);
  assert.ok(r.findings.some((f) => /Closing that month saves/.test(f.title)));
});

test("loan payment follows the standard amortisation formula", () => {
  close(monthlyPayment(100000, 0, 10), 100000 / 120);
  close(monthlyPayment(100000, 12, 1), 8884.878867834, 1e-6);
  const r = compute({ ...base, loanAmount: "50000", loanApr: "12", loanYears: "1" });
  close(r.totals.monthlyPayment, monthlyPayment(50000, 12, 1));
  close(r.totals.netAfterDebt, r.totals.operating - r.totals.debt);
  close(r.totals.dscr, r.totals.operating / r.totals.debt);
});

test("payback is start-up cost over annual operating profit", () => {
  const r = compute({ ...base, months: SAMPLE.months });
  assert.ok(r.totals.operating > 0);
  close(r.totals.paybackYears, 100000 / r.totals.operating);
  assert.equal(compute(base).totals.paybackYears, null);
});

test("cash reserve is the deepest fall below an earlier high over repeating years", () => {
  // Cash peaks right after Jul; the eleven months that follow it, before the next Jul, each lose the $3,000 fixed cost.
  const r = compute(base);
  close(r.totals.reserve, 3000 * 11);
});

test("price and traffic sweeps hold the centre row equal to the base year and move the right way", () => {
  const r = compute(base);
  close(r.priceSweep[2].operating, r.totals.operating);
  close(r.trafficSweep[2].operating, r.totals.operating);
  assert.ok(r.priceSweep[4].operating > r.priceSweep[0].operating);
  assert.ok(r.trafficSweep[4].operating > r.trafficSweep[0].operating);
});

test("bad input is rejected rather than clamped", () => {
  assert.ok(compute({ ...base, ticket: "0" }).errors.length);
  assert.ok(compute({ ...base, cogsPct: "80", feesPct: "25" }).errors.length);
  assert.ok(compute({ ...base, months: withMonth("Feb", 30, 10) }).errors[0].match(/0 to 29/));
  assert.ok(compute({ ...base, loanAmount: "200000", loanApr: "5", loanYears: "5" }).errors.length);
  assert.ok(compute({ ...base, months: closed.slice(0, 11).join("\n") }).errors[0].match(/all 12 months/));
  assert.ok(parseMonths(closed.concat("Jan, 1, 1").join("\n")).errors[0].match(/twice/));
  assert.ok(parseMonths("Foo, 1, 1").errors[0].match(/not a month/));
});

test("the worked example runs, is clean, and its summary and CSV are well formed", () => {
  const r = compute({ ...SAMPLE });
  assert.deepEqual(r.errors, []);
  assert.ok(r.rows.some((x) => x.verdict === "close") && r.rows.some((x) => x.verdict === "open") && r.rows.some((x) => x.verdict === "closed"));
  assert.match(summaryText(r), /SEASONAL SHOP PROFIT SUMMARY/);
  const csv = monthsCsv(r).trim().split("\n");
  assert.equal(csv.length, 13);
  assert.equal(csv[0].split(",").length, csv[1].split(",").length);
});
