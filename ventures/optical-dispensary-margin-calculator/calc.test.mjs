import { test } from "node:test";
import assert from "node:assert/strict";
import { analyze, saleEconomics, parseInputs, patientPriceForTarget, toCsv, SHARED_DEFAULTS, money, money2 } from "./calc.mjs";

const near = (a, b, e = 0.005) => assert.ok(Math.abs(a - b) < e, `${a} vs ${b}`);
const base = () => ({ ...SHARED_DEFAULTS });

test("a plan sale's earnings are collected money less goods, remake allowance, fees, adjustments and optician time", () => {
  const a = analyze(base());
  assert.equal(a.ok, true);
  const r = a.rows[1];
  const labRate = 22 * 1.12;
  near(r.collected, 215);
  near(r.goods, 48 + 22 + 11);
  near(r.remakeCost, 0.06 * (22 + 11 + (20 / 60) * labRate));
  near(r.card, 95 * 0.026 + 0.1);
  near(r.planFee, 120 * 0.03);
  near(r.labor, (30 / 60) * labRate);
  near(r.contribution, 215 - r.goods - r.remakeCost - r.card - r.planFee - 4 - r.labor);
  near(r.margin, r.contribution / 215, 1e-9);
});

test("a plan-only sale pays no card fee but does pay the plan claim fee", () => {
  const e = saleEconomics(parseInputs(base(), []), parseInputs(base(), []).rows[4]);
  assert.equal(e.card, 0);
  near(e.planFee, 70 * 0.03);
});

test("a sale priced at the target price earns exactly the target margin", () => {
  const v = parseInputs(base(), []);
  for (const r of v.rows) {
    const p = patientPriceForTarget(v, r);
    const e = saleEconomics(v, { ...r, patient: p.patient });
    if (p.collected - r.plan >= 0 && p.patient > 0) near(e.margin, v.target / 100, 1e-9);
  }
});

test("the low-reimbursement plan sale loses money and the report says so", () => {
  const a = analyze(base());
  assert.ok(a.rows[4].contribution < a.rows[0].contribution);
  assert.ok(a.warnings.some((w) => /below your 55% target/.test(w)));
});

test("break-even sales is the smallest count whose contribution covers the month's fixed cost", () => {
  const a = analyze(base());
  assert.ok(a.breakEvenSales * a.avgContribution >= a.v.fixedMonth);
  assert.ok((a.breakEvenSales - 1) * a.avgContribution < a.v.fixedMonth);
});

test("cutting plan reimbursements hurts profit by exactly 10% of plan money net of the claim fee", () => {
  const a = analyze(base());
  const s = a.scenarios.find((x) => /reimbursements/.test(x.label));
  const planMoney = a.rows.reduce((t, r) => t + r.plan * r.perMonth, 0);
  near(s.change, -0.1 * planMoney * (1 - 0.03), 0.01);
});

test("cash and plan averages split the mix", () => {
  const a = analyze(base());
  assert.ok(a.cashAvg > a.planAvg);
  near(a.planShare, (70 + 40 + 25) / 170, 1e-9);
});

test("bad input is reported, not computed", () => {
  const bad = { ...base(), wage: "abc", patient2: "-5" };
  const a = analyze(bad);
  assert.equal(a.ok, false);
  assert.ok(a.warnings.length >= 2);
});

test("empty rows are skipped and an all-empty menu is refused", () => {
  const input = { ...base() };
  for (let i = 1; i <= 5; i++) for (const f of ["name", "patient", "plan", "frame", "lens", "coat", "mins", "perMonth"]) input[`${f}${i}`] = "";
  const a = analyze(input);
  assert.equal(a.ok, false);
  assert.ok(a.warnings.includes("Enter at least one sale type."));
});

test("a target and card fee that leave no room give no target price", () => {
  const v = parseInputs({ ...base(), target: "90", cardPct: "10" }, []);
  assert.equal(patientPriceForTarget(v, v.rows[0]), null);
});

test("csv has a header and one line per sale type; money formats", () => {
  const a = analyze(base());
  assert.equal(toCsv(a).trim().split("\n").length, 6);
  assert.equal(money(-1234.4), "-$1,234");
  assert.equal(money2(5), "$5.00");
});
