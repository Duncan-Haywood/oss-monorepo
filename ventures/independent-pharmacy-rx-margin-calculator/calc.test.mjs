import { test } from "node:test";
import assert from "node:assert/strict";
import { analyze, saleEconomics, parseInputs, patientPriceForTarget, toCsv, SHARED_DEFAULTS, money, money2 } from "./calc.mjs";

const near = (a, b, e = 0.005) => assert.ok(Math.abs(a - b) < e, `${a} vs ${b}`);
const base = () => ({ ...SHARED_DEFAULTS });

test("a fill's earnings are collected money less drug cost, supplies, fees, rework allowance, delivery and staff time", () => {
  const a = analyze(base());
  assert.equal(a.ok, true);
  const r = a.rows[0];
  const labRate = 38 * 1.12;
  near(r.collected, 22);
  near(r.goods, 9 + 1.2 + 0.9);
  near(r.reworkCost, 0.04 * (1.2 + (20 / 60) * labRate));
  near(r.card, 8 * 0.026 + 0.1);
  near(r.planFee, 14 * 0.005);
  near(r.labor, (4 / 60) * labRate);
  near(r.contribution, 22 - r.goods - r.reworkCost - r.card - r.planFee - 0.6 - r.labor);
  near(r.margin, r.contribution / 22, 1e-9);
});

test("a PBM-only fill pays no card fee but does pay the PBM claim fee", () => {
  const v = parseInputs(base(), []);
  const e = saleEconomics(v, v.rows[4]);
  assert.equal(e.card, 0);
  near(e.planFee, 1850 * 0.005);
});

test("a fill priced at the target copay earns exactly the target margin", () => {
  const v = parseInputs(base(), []);
  for (const r of v.rows) {
    const p = patientPriceForTarget(v, r);
    const e = saleEconomics(v, { ...r, patient: p.patient });
    if (p.collected - r.plan >= 0 && p.patient > 0) near(e.margin, v.target / 100, 1e-9);
  }
});

test("the low-reimbursement generic loses money and the report says so", () => {
  const a = analyze(base());
  assert.ok(a.rows[2].contribution < 0);
  assert.ok(a.warnings.some((w) => /Generic, low-reimbursement PBM lose/.test(w)));
  assert.ok(a.warnings.some((w) => /below your 12% target/.test(w)));
});

test("a pass-through brand earns little per fill but a lot per drug dollar handled", () => {
  const a = analyze(base());
  assert.ok(a.rows[1].margin < 0.05);
  assert.ok(a.rows[0].margin > a.rows[1].margin);
});

test("break-even prescriptions is the smallest count whose contribution covers the month's fixed cost", () => {
  const a = analyze(base());
  assert.ok(a.breakEvenSales * a.avgContribution >= a.v.fixedMonth);
  assert.ok((a.breakEvenSales - 1) * a.avgContribution < a.v.fixedMonth);
});

test("cutting PBM reimbursements hurts profit by exactly 10% of PBM money net of the claim fee", () => {
  const a = analyze(base());
  const s = a.scenarios.find((x) => /reimbursements/.test(x.label));
  const planMoney = a.rows.reduce((t, r) => t + r.plan * r.perMonth, 0);
  near(s.change, -0.1 * planMoney * (1 - 0.005), 0.01);
});

test("cash and insured averages split the mix", () => {
  const a = analyze(base());
  assert.ok(a.cashAvg != null && a.planAvg != null);
  near(a.planShare, (4200 + 480 + 2100 + 36) / (4200 + 480 + 2100 + 540 + 36), 1e-9);
});

test("bad input is reported, not computed", () => {
  const bad = { ...base(), wage: "abc", patient2: "-5" };
  const a = analyze(bad);
  assert.equal(a.ok, false);
  assert.ok(a.warnings.length >= 2);
});

test("empty rows are skipped and an all-empty menu is refused", () => {
  const input = { ...base() };
  for (let i = 1; i <= 5; i++) for (const f of ["name", "patient", "plan", "acq", "supply", "dir", "mins", "perMonth"]) input[`${f}${i}`] = "";
  const a = analyze(input);
  assert.equal(a.ok, false);
  assert.ok(a.warnings.includes("Enter at least one prescription type."));
});

test("a target and card fee that leave no room give no target copay", () => {
  const v = parseInputs({ ...base(), target: "90", cardPct: "10" }, []);
  assert.equal(patientPriceForTarget(v, v.rows[0]), null);
});

test("csv has a header and one line per prescription type; money formats", () => {
  const a = analyze(base());
  assert.equal(toCsv(a).trim().split("\n").length, 6);
  assert.equal(money(-1234.4), "-$1,234");
  assert.equal(money2(5), "$5.00");
});
