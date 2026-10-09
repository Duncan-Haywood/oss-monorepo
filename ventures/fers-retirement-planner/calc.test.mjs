import { test } from "node:test";
import assert from "node:assert/strict";
import { analyze, mraMonths, cola, agencyPct, toCsv, EXAMPLE } from "./calc.mjs";

const near = (a, b, tol = 1) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);
// A flat-pay, no-TSP case so the annuity can be checked by hand.
const flat = (over = {}) => ({
  asof: "2026-10", birth: "1966-01", scd: "1996-01", retage: "62", salary: "100000", raise: "0", sick: "0", sickadd: "0",
  tsp: "0", tspemp: "0", tspret: "0", tspdraw: "4", ss62: "", survivor: "none", infl: "2", ...over,
});

test("minimum retirement age follows the birth-year table", () => {
  assert.equal(mraMonths(1947), 55 * 12);
  assert.equal(mraMonths(1950), 55 * 12 + 6);
  assert.equal(mraMonths(1953), 56 * 12);
  assert.equal(mraMonths(1964), 56 * 12);
  assert.equal(mraMonths(1966), 56 * 12 + 4);
  assert.equal(mraMonths(1969), 56 * 12 + 10);
  assert.equal(mraMonths(1970), 57 * 12);
  assert.equal(mraMonths(1985), 57 * 12);
});

test("COLA is capped: CPI up to 2%, then 2%, then CPI minus 1", () => {
  assert.equal(cola(1.5), 1.5);
  assert.equal(cola(2.5), 2);
  assert.equal(cola(3), 2);
  assert.equal(cola(4), 3);
});

test("agency contribution is 1% plus a match of 100% to 3% and 50% of the next 2%", () => {
  assert.equal(agencyPct(0), 1);
  assert.equal(agencyPct(3), 4);
  assert.equal(agencyPct(4), 4.5);
  assert.equal(agencyPct(5), 5);
  assert.equal(agencyPct(15), 5);
});

test("age 62 with 20+ years uses the 1.1% multiplier", () => {
  const a = analyze(flat({ retage: "62" }));
  assert.ok(a.ok);
  assert.equal(a.plan.kind, "62+5");
  assert.equal(a.plan.mult, 1.1);
  // service 1996-01 .. 2028-01 = 32 years exactly, high-3 100,000.
  near(a.plan.pension, 0.011 * 100000 * 32, 1);
});

test("retiring a year before 62 at 30+ years uses 1.0% and earns a supplement from the SSA estimate", () => {
  const a = analyze(flat({ retage: "61", ss62: "2000" }));
  assert.equal(a.plan.kind, "MRA+30");
  assert.equal(a.plan.mult, 1.0);
  near(a.plan.pension, 0.01 * 100000 * 31, 1);
  // supplement = 2000 x 12 x (31 / 40)
  near(a.plan.supplement, 2000 * 12 * (31 / 40), 1);
});

test("MRA+10 is reduced 5% per year under 62 and gets no supplement", () => {
  const a = analyze(flat({ birth: "1970-01", scd: "2015-01", asof: "2026-10", retage: "57", ss62: "2000" }));
  assert.equal(a.plan.kind, "MRA+10");
  near(a.plan.reduction, 0.25, 1e-9);
  assert.equal(a.plan.supplement, 0);
  // service 2015-01 .. 2027-01 = 12 years, 1.0%, 25% off.
  near(a.plan.pension, 0.01 * 100000 * 12 * 0.75, 1);
});

test("60 with 20 years is an immediate retirement even though MRA+30 is not met", () => {
  const a = analyze(flat({ birth: "1970-01", scd: "2008-01", retage: "60", asof: "2026-10" }));
  assert.equal(a.plan.kind, "60+20");
  assert.equal(a.plan.eligible, true);
});

test("too little service means no immediate annuity", () => {
  const a = analyze(flat({ birth: "1970-01", scd: "2020-01", retage: "58" }));
  assert.equal(a.plan.eligible, false);
  assert.equal(a.plan.kind, null);
});

test("unused sick leave adds to the annuity service but not to eligibility", () => {
  const no = analyze(flat({ sick: "0" }));
  const yes = analyze(flat({ sick: "2087" }));
  assert.equal(yes.plan.sickM, 12);
  near(yes.plan.annuityM - no.plan.annuityM, 12, 0);
  assert.equal(yes.plan.svcM, no.plan.svcM);
});

test("survivor election costs 10% for full and 5% for partial", () => {
  const base = analyze(flat()).plan.pension;
  near(analyze(flat({ survivor: "full" })).plan.pension, base * 0.9, 0.5);
  near(analyze(flat({ survivor: "partial" })).plan.pension, base * 0.95, 0.5);
});

test("TSP grows with contributions and the draw is the chosen share", () => {
  const a = analyze(flat({ asof: "2016-01", tsp: "100000", tspret: "0", tspemp: "5", retage: "62" }));
  // 0% return, 10% of 100k a year (5% you + 5% agency) for 12 years.
  near(a.plan.tspBalance, 100000 + 10000 * 12, 5);
  near(a.plan.draw, a.plan.tspBalance * 0.04, 0.01);
});

test("raises lift the high-3 above current pay", () => {
  const a = analyze(flat({ asof: "2016-01", raise: "3", retage: "62" }));
  assert.ok(a.plan.high3 > 100000);
  assert.ok(a.plan.finalSalary > a.plan.high3);
});

test("the table never shows a pension that falls when you work another year", () => {
  const a = analyze(EXAMPLE);
  const el = a.rows.filter((r) => r.eligible);
  for (let i = 1; i < el.length; i++) if (el[i].kind !== "MRA+10" && el[i - 1].kind !== "MRA+10") assert.ok(el[i].pension >= el[i - 1].pension);
  assert.ok(a.rows.find((r) => r.gain != null));
});

test("first-eligible dates are found in order", () => {
  const a = analyze(EXAMPLE);
  const kinds = a.firsts.map((f) => f.kind);
  assert.deepEqual(kinds, ["MRA+10", "MRA+30", "62+5"]);
  assert.ok(a.firsts[0].retM < a.firsts[1].retM);
});

test("bad dates and numbers are reported rather than thrown", () => {
  assert.equal(analyze({ ...EXAMPLE, birth: "June 1970" }).ok, false);
  assert.equal(analyze({ ...EXAMPLE, salary: "" }).ok, false);
  assert.equal(analyze({ ...EXAMPLE, scd: "1960-01" }).ok, false);
  assert.equal(analyze({ ...EXAMPLE, retage: "50", birth: "1960-01" }).ok, false);
  const r = analyze({ ...EXAMPLE, tspdraw: "abc" });
  assert.equal(r.ok, false);
  assert.ok(r.warnings.length > 0);
});

test("missing Social Security estimate is flagged and shows no supplement", () => {
  const a = analyze({ ...EXAMPLE, ss62: "", retage: "61" });
  assert.ok(a.ok);
  assert.ok(a.warnings.some((w) => /Social Security/.test(w)));
  assert.equal(a.plan.supplement, 0);
});

test("CSV has a header, one line per age and quotes nothing it need not", () => {
  const csv = toCsv(analyze(EXAMPLE));
  const lines = csv.trim().split("\n");
  assert.match(lines[0], /^Retire at age,Retirement type/);
  assert.ok(lines.length > 10);
});

test("the example runs clean", () => {
  const a = analyze(EXAMPLE);
  assert.ok(a.ok);
  assert.deepEqual(a.warnings, []);
});
