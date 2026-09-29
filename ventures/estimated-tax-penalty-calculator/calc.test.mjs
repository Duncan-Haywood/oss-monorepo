import { test } from "node:test";
import assert from "node:assert/strict";
import { requiredAnnualPayment, underpaymentPenalty } from "./calc.mjs";

test("required payment is the smaller of 90% current and 100% prior", () => {
  const r = requiredAnnualPayment({ currentTax: 20000, priorTax: 15000, priorAgi: 100000 });
  assert.equal(r.ninetyPct, 18000);
  assert.equal(r.priorYear, 15000);
  assert.equal(r.basis, "prior-year");
  assert.equal(r.required, 15000);
});

test("high prior AGI raises the prior-year target to 110%, MFS threshold is $75,000", () => {
  assert.equal(requiredAnnualPayment({ currentTax: 90000, priorTax: 20000, priorAgi: 200000 }).required, 22000);
  assert.equal(requiredAnnualPayment({ currentTax: 90000, priorTax: 20000, priorAgi: 100000 }).priorPct, 1);
  assert.equal(requiredAnnualPayment({ currentTax: 90000, priorTax: 20000, priorAgi: 100000, marriedFilingSeparately: true }).priorPct, 1.1);
});

test("nothing paid: penalty is rate x days/365 on each quarter's balance", () => {
  const r = underpaymentPenalty({ taxYear: 2026, currentTax: 20000, priorTax: 15000, priorAgi: 100000, rate: 0.07 });
  const by = (n) => Number(((3750 * 0.07 * n) / 365).toFixed(2));
  assert.deepEqual(r.installments.map((x) => x.penalty), [by(365), by(304), by(212), by(90)]);
  assert.equal(r.totalPenalty, r.installments.reduce((s, x) => Math.round((s + x.penalty) * 100) / 100, 0));
});

test("paying every installment on time yields no penalty", () => {
  const r = underpaymentPenalty({
    taxYear: 2026, currentTax: 20000, priorTax: 15000, priorAgi: 100000,
    payments: ["2026-04-15", "2026-06-15", "2026-09-15", "2027-01-15"].map((date) => ({ date, amount: 3750 })),
  });
  assert.equal(r.totalPenalty, 0);
  assert.ok(r.plan.every((p) => p.catchUp === 0));
});

test("a late payment stops the penalty on the oldest shortfall only", () => {
  const r = underpaymentPenalty({
    taxYear: 2026, currentTax: 20000, priorTax: 15000, priorAgi: 100000, rate: 0.07,
    payments: [{ date: "2026-07-15", amount: 3750 }],
  });
  // 3750 paid Jul 15 lands on the Apr 15 installment: 91 days late, not 365.
  assert.equal(r.installments[0].penalty, Number(((3750 * 0.07 * 91) / 365).toFixed(2)));
  assert.equal(r.installments[1].penalty, Number(((3750 * 0.07 * 304) / 365).toFixed(2)));
});

test("an early lump sum carries forward to later installments", () => {
  const r = underpaymentPenalty({
    taxYear: 2026, currentTax: 20000, priorTax: 15000, priorAgi: 100000,
    payments: [{ date: "2026-04-15", amount: 15000 }],
  });
  assert.equal(r.totalPenalty, 0);
});

test("withholding counts as paid evenly on each due date", () => {
  const r = underpaymentPenalty({ taxYear: 2026, currentTax: 20000, withholding: 18000, priorTax: 30000, priorAgi: 50000 });
  assert.equal(r.totalPenalty, 0);
});

test("under $1,000 owed after withholding, or zero prior tax, means no penalty", () => {
  const a = underpaymentPenalty({ taxYear: 2026, currentTax: 5000, withholding: 4200, priorTax: 9000, priorAgi: 60000 });
  assert.equal(a.exempt, true);
  assert.equal(a.penalty, 0);
  const b = underpaymentPenalty({ taxYear: 2026, currentTax: 30000, priorTax: 0, priorAgi: 0 });
  assert.equal(b.exempt, true);
});

test("catch-up plan shows the cumulative shortfall at each due date", () => {
  const r = underpaymentPenalty({
    taxYear: 2026, currentTax: 20000, priorTax: 15000, priorAgi: 100000,
    payments: [{ date: "2026-04-15", amount: 3750 }],
  });
  assert.deepEqual(r.plan.map((p) => p.catchUp), [0, 3750, 7500, 11250]);
});

test("empty input is invalid rather than a zero result", () => {
  assert.equal(underpaymentPenalty({}).invalid, true);
});
