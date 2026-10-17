import { test } from "node:test";
import assert from "node:assert/strict";
import { analyze, saleEconomics, parseInputs, patientPriceForTarget, toCsv, SHARED_DEFAULTS, money, money2 } from "./calc.mjs";

const near = (a, b, e = 0.005) => assert.ok(Math.abs(a - b) < e, `${a} vs ${b}`);
const base = () => ({ ...SHARED_DEFAULTS });

test("a plan sale's earnings are collected money less devices, return allowance, fees, commission and clinician time", () => {
  const a = analyze(base());
  assert.equal(a.ok, true);
  const r = a.rows[3];
  const labRate = 55 * 1.15;
  near(r.collected, 3400);
  near(r.goods, 1150 + 90);
  near(r.returnCost, 0.12 * (0.2 * 1150 + (45 / 60) * labRate));
  near(r.card, 1900 * 0.026 + 0.1);
  near(r.planFee, 1500 * 0.03);
  near(r.commission, 3400 * 0.08);
  near(r.labor, ((70 + 4 * 25) / 60) * labRate);
  near(r.contribution, 3400 - r.goods - r.returnCost - r.card - r.planFee - r.commission - r.labor);
  near(r.margin, r.contribution / 3400, 1e-9);
});

test("a plan-only sale pays no card fee but does pay the plan fee", () => {
  const v = parseInputs({ ...base(), patient4: "0" }, []);
  const e = saleEconomics(v, v.rows[3]);
  assert.equal(e.card, 0);
  near(e.planFee, 1500 * 0.03);
});

test("a sale priced at the target price earns exactly the target margin", () => {
  const v = parseInputs(base(), []);
  for (const r of v.rows) {
    const p = patientPriceForTarget(v, r);
    const e = saleEconomics(v, { ...r, patient: p.patient });
    if (p.patient > 0) near(e.margin, v.target / 100, 1e-9);
  }
});

test("more returns and more follow-ups lower earnings, and the clinician hour falls with follow-up time", () => {
  const v = parseInputs(base(), []);
  const r = v.rows[1];
  const e0 = saleEconomics(v, r);
  assert.ok(saleEconomics(v, r, { returnRate: 25 }).contribution < e0.contribution);
  assert.ok(saleEconomics(v, r, { followups: 8 }).perClinicianHour < e0.perClinicianHour);
  assert.equal(e0.clinicMins, 70 + 4 * 25);
});

test("a zero return rate removes the return allowance entirely", () => {
  const v = parseInputs({ ...base(), returnRate: "0" }, []);
  assert.equal(saleEconomics(v, v.rows[0]).returnCost, 0);
});

test("private-pay price cuts leave plan payments untouched", () => {
  const v = parseInputs(base(), []);
  const e = saleEconomics(v, v.rows[3], { patientMult: 0.85 });
  near(e.plan, 1500);
  near(e.patient, 1900 * 0.85);
});

test("the discount bundle earns less per sale and per clinician hour than the premium pair", () => {
  const a = analyze(base());
  assert.ok(a.rows[2].contribution < a.rows[0].contribution);
  assert.ok(a.rows[2].perClinicianHour < a.rows[0].perClinicianHour);
  assert.equal(a.worstPerHour.name === "Single mid-tier device" || a.worstPerHour.name === "Basic pair, discount bundle", true);
});

test("a sale type that loses money is called out", () => {
  const a = analyze({ ...base(), patient3: "300", plan3: "0" });
  assert.ok(a.rows[2].contribution < 0);
  assert.ok(a.warnings.some((w) => /loses? money on every sale/.test(w)));
});

test("break-even sales and monthly totals follow the mix", () => {
  const a = analyze(base());
  const sales = 6 + 10 + 8 + 6 + 5;
  near(a.totals.sales, sales, 1e-9);
  near(a.totals.contribution, a.rows.reduce((s, r) => s + r.contribution * r.perMonth, 0), 0.01);
  assert.equal(a.breakEvenSales, Math.ceil(16000 / (a.totals.contribution / sales)));
});

test("scenarios: each cost increase lowers monthly profit", () => {
  const a = analyze(base());
  assert.equal(a.scenarios.length, 5);
  for (const s of a.scenarios) assert.ok(s.change < 0, s.label);
});

test("target price is null when card fee, commission and target leave no room", () => {
  const v = parseInputs({ ...base(), target: "90", commission: "10" }, []);
  assert.equal(patientPriceForTarget(v, v.rows[0]), null);
});

test("bad inputs are reported, not computed", () => {
  const a = analyze({ ...base(), wage: "abc", mins1: "0" });
  assert.equal(a.ok, false);
  assert.ok(a.warnings.some((w) => /Clinician wage/.test(w)));
  assert.ok(a.warnings.some((w) => /fitting minutes/.test(w)));
  assert.equal(analyze({}).ok, false);
});

test("a row with both payments zero is flagged and empty rows are skipped", () => {
  const a = analyze({ ...base(), patient5: "0", plan5: "0" });
  assert.equal(a.ok, false);
  const b = analyze({ ...base(), name5: "", patient5: "", plan5: "" });
  assert.equal(b.rows.length, 4);
});

test("CSV has a header, one line per sale type and quotes commas", () => {
  const a = analyze({ ...base(), name1: 'Pair, "premium"' });
  const lines = toCsv(a).trim().split("\n");
  assert.equal(lines.length, 6);
  assert.match(lines[1], /^"Pair, ""premium"""/);
});

test("money formatting", () => {
  assert.equal(money(-1234.5), "-$1,235");
  assert.equal(money2(3.456), "$3.46");
});
