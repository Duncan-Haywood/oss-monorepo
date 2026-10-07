import { test } from "node:test";
import assert from "node:assert/strict";
import { QUESTIONS, evaluate, scoreTest, abcProngs, topFlags, exposure, RATES } from "./calc.mjs";

const all = (fn) => Object.fromEntries(QUESTIONS.map((q) => [q.id, fn(q)]));
const asEmployee = all((q) => q.pointsTo);
const asContractor = all((q) => (q.pointsTo === "yes" ? "no" : "yes"));
const unsure = all(() => "unsure");

test("every question feeds at least one test and has a valid employee direction", () => {
  for (const q of QUESTIONS) {
    assert.ok(["yes", "no"].includes(q.pointsTo));
    assert.ok(q.tests.length > 0);
    assert.ok(q.w >= 1 && q.w <= 3);
  }
  assert.equal(new Set(QUESTIONS.map((q) => q.id)).size, QUESTIONS.length);
});

test("every ABC prong has facts feeding it", () => {
  for (const k of ["abc_a", "abc_b", "abc_c"]) assert.ok(QUESTIONS.some((q) => q.tests.includes(k)), k);
});

test("a textbook employee fails every test", () => {
  const { results, risk } = evaluate(asEmployee);
  assert.equal(results.irs.verdict, "employee");
  assert.equal(results.dol.verdict, "employee");
  assert.equal(results.abc.verdict, "employee");
  assert.equal(risk, "high");
});

test("a textbook contractor passes every test", () => {
  const { results, risk } = evaluate(asContractor);
  assert.equal(results.irs.verdict, "contractor");
  assert.equal(results.dol.verdict, "contractor");
  assert.equal(results.abc.verdict, "contractor");
  assert.equal(risk, "low");
});

test("unsure answers never produce a contractor verdict", () => {
  const { results } = evaluate(unsure);
  assert.equal(results.irs.verdict, "insufficient");
  assert.equal(results.dol.verdict, "insufficient");
  assert.equal(results.abc.verdict, "insufficient");
});

test("ABC: one unanswered prong A fact means the burden is not met", () => {
  const a = { ...asContractor, sets_how: "unsure" };
  const r = evaluate(a).results.abc;
  assert.notEqual(r.verdict, "contractor");
  assert.equal(r.prongs.abc_a.shown, false);
  assert.deepEqual(r.prongs.abc_a.unknown, ["sets_how"]);
});

test("ABC: prong B fails alone when the work is core to the business, even if everything else is contractor-like", () => {
  const a = { ...asContractor, core_work: "yes" };
  const r = evaluate(a).results.abc;
  assert.equal(r.verdict, "employee");
  assert.equal(r.prongs.abc_b.shown, false);
  assert.equal(r.prongs.abc_a.shown, true);
  // the same facts are not decisive under the IRS test
  assert.notEqual(evaluate(a).results.irs.verdict, "employee");
});

test("ABC: prong C tolerates one weak fact but not a cluster", () => {
  assert.equal(abcProngs({ ...asContractor, exclusive: "yes" }).abc_c.shown, true);
  const cluster = { ...asContractor, exclusive: "yes", other_clients: "no", business_entity: "no", profit_loss: "no" };
  assert.equal(abcProngs(cluster).abc_c.shown, false);
});

test("scoreTest is a weighted share and ignores unsure", () => {
  const a = { ...unsure, sets_how: "yes", own_tools: "yes" }; // irs: sets_how (w3) employee, own_tools (w2) contractor
  const s = scoreTest("irs", a);
  assert.equal(s.answered, 2);
  assert.ok(Math.abs(s.share - 3 / 5) < 1e-12);
});

test("topFlags returns the heaviest employee-pointing facts first", () => {
  const flags = topFlags(asEmployee, 3);
  assert.equal(flags.length, 3);
  assert.ok(flags[0].w >= flags[1].w && flags[1].w >= flags[2].w);
  assert.deepEqual(topFlags(asContractor), []);
});

test("exposure: section 3509 rates for a 1099-filed worker", () => {
  const r = exposure({ annualPay: 50000, hoursPerWeek: 40, years: 1 });
  const rate = 0.0765 + 0.015 + 0.2 * 0.0765;
  assert.ok(Math.abs(r.taxRate - rate) < 1e-12);
  assert.ok(Math.abs(r.payrollTax - 50000 * rate) < 1e-6);
  assert.ok(Math.abs(r.futa - 7000 * 0.006) < 1e-9);
  assert.equal(r.owedOvertime, 0);
});

test("exposure: unfiled 1099s use the higher 3509 rates", () => {
  const filed = exposure({ annualPay: 50000, filed1099: true });
  const unfiled = exposure({ annualPay: 50000, filed1099: false });
  assert.ok(unfiled.payrollTax > filed.payrollTax);
  assert.ok(Math.abs(unfiled.taxRate - (0.0765 + 0.03 + 0.4 * 0.0765)) < 1e-12);
});

test("exposure: overtime is the half-time premium on hours over 40, doubled in the high case", () => {
  // $52,000 over 50 h/wk: regular rate 52000/2600 = $20/h; 10 OT h x $10 x 52 = $5,200 a year
  const r = exposure({ annualPay: 52000, hoursPerWeek: 50, years: 1 });
  assert.ok(Math.abs(r.regularRate - 20) < 1e-12);
  assert.ok(Math.abs(r.owedOvertime - 5200) < 1e-6);
  assert.equal(r.liquidated, r.owedOvertime);
  assert.ok(r.high > r.low);
});

test("exposure: FLSA look-back is 2 years, 3 if willful, and scales by workers", () => {
  const base = exposure({ annualPay: 52000, hoursPerWeek: 50, years: 5 });
  assert.equal(base.flsaYears, 2);
  assert.equal(exposure({ annualPay: 52000, hoursPerWeek: 50, years: 5, willful: true }).flsaYears, 3);
  const ten = exposure({ annualPay: 52000, hoursPerWeek: 50, years: 5, workers: 10 });
  assert.ok(Math.abs(ten.owedOvertime - base.owedOvertime * 10) < 1e-6);
});

test("exposure: bad inputs return an error, never NaN", () => {
  for (const bad of [{ annualPay: -1 }, { annualPay: "x" }, { annualPay: 1, hoursPerWeek: 0 }, { annualPay: 1, workers: 0 }, { annualPay: 1, hoursPerWeek: 120 }]) {
    assert.ok(exposure(bad).error, JSON.stringify(bad));
  }
});

test("low never exceeds high", () => {
  for (const hrs of [30, 40, 60]) for (const filed of [true, false]) {
    const r = exposure({ annualPay: 80000, hoursPerWeek: hrs, years: 3, filed1099: filed });
    assert.ok(r.low <= r.high);
  }
  assert.equal(RATES.futaBase, 7000);
});
