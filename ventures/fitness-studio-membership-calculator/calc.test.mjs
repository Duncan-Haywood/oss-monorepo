import { test } from "node:test";
import assert from "node:assert/strict";
import { analyze, parseInputs, perMember, project, toCsv, SHARED_DEFAULTS, money, money2, pct } from "./calc.mjs";

const near = (a, b, e = 0.005) => assert.ok(Math.abs(a - b) < e, `${a} vs ${b}`);
const base = () => ({ ...SHARED_DEFAULTS });

test("contribution per member subtracts card fee and variable cost", () => {
  near(perMember(parseInputs(base(), [])), 149 - (149 * 0.029 + 0.3) - 4);
});

test("lifetime value is contribution times 1/churn and CAC is spend per join", () => {
  const a = analyze(base());
  assert.equal(a.ok, true);
  near(a.lifetimeMonths, 100 / 6, 1e-9);
  near(a.ltv, a.cm * (100 / 6), 1e-9);
  near(a.cac, 1800 / 14, 1e-9);
  near(a.paybackMonths, a.cac / a.cm, 1e-9);
});

test("the projection converges to joins divided by churn", () => {
  const v = parseInputs({ ...base(), members: String(14 / 0.06), months: "36" }, []);
  const p = project(v);
  near(p[p.length - 1].members, 14 / 0.06, 1e-6);
  const far = project(parseInputs({ ...base(), members: "0", months: "36" }, []));
  assert.ok(far[35].members > 200 && far[35].members < 14 / 0.06);
  const a = analyze(base());
  near(a.steady, 14 / 0.06, 1e-9);
});

test("one month of the projection follows churn then joins", () => {
  const v = parseInputs(base(), []);
  near(project(v)[0].members, 180 * 0.94 + 14, 1e-9);
  near(project(v)[0].profit, (180 * 0.94 + 14) * perMember(v) - 17500 - 1800, 1e-6);
});

test("less churn and a higher price both raise projected profit", () => {
  const a = analyze(base());
  const by = Object.fromEntries(a.scenarios.map((s) => [s.label, s]));
  assert.ok(by["1 point less churn"].change > 0);
  assert.ok(by["1 point more churn"].change < 0);
  assert.ok(by["Price up $10"].change > 0);
  assert.ok(by["5 more new members a month"].change > 0);
});

test("break-even members covers fixed costs and marketing", () => {
  const a = analyze(base());
  assert.ok(a.breakEvenMembers * a.cm >= 17500 + 1800);
  assert.ok((a.breakEvenMembers - 1) * a.cm < 17500 + 1800);
});

test("capacity and utilization", () => {
  const a = analyze(base());
  near(a.capacity, 42 * (52 / 12) * 16, 1e-9);
  near(a.utilization, (180 * 9) / a.capacity, 1e-9);
});

test("bad input is named instead of computed", () => {
  const a = analyze({ ...base(), churn: "0" });
  assert.equal(a.ok, false);
  assert.match(a.warnings[0], /Monthly churn/);
  assert.equal(analyze({ ...base(), price: "abc" }).ok, false);
});

test("a price that cannot cover costs is flagged and gives no payback", () => {
  const a = analyze({ ...base(), price: "3", varCost: "10" });
  assert.equal(a.ok, true);
  assert.equal(a.paybackMonths, null);
  assert.equal(a.breakEvenMembers, null);
  assert.ok(a.warnings.some((w) => /does not cover the card fee/.test(w)));
});

test("zero new members gives no CAC and a shrinking studio", () => {
  const a = analyze({ ...base(), newPerMonth: "0" });
  assert.equal(a.cac, null);
  assert.equal(a.steady, 0);
  assert.ok(a.last.members < 180);
});

test("CSV has one row per projected month", () => {
  const rows = toCsv(analyze(base())).trim().split("\n");
  assert.equal(rows.length, 13);
  assert.equal(rows[0], "Month,Members,Revenue,Profit,Cumulative profit");
});

test("formatters", () => {
  assert.equal(money(-1234), "-$1,234");
  assert.equal(money2(5), "$5.00");
  assert.equal(pct(0.123), "12.3%");
});
