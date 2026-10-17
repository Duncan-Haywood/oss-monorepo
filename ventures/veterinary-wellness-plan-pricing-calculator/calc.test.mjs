import { test } from "node:test";
import assert from "node:assert/strict";
import { parseServices, memberYear, feeForMargin, analyze, toCsv, EXAMPLE_SHARED } from "./calc.mjs";

const S = [{ name: "Exam", qty: 2, price: 100, cost: 30 }, { name: "Dental", qty: 1, price: 400, cost: 200 }];
const P = { discount: 0.1, use: 1, billingFee: 0.04 };

test("member year: list value, cost, fees and margin on a monthly fee", () => {
  const y = memberYear(S, P, 50);
  assert.equal(y.listValue, 600);
  assert.equal(y.planValue, 540);
  assert.equal(y.fullCost, 260);
  assert.equal(y.collected, 600);
  assert.equal(y.fees, 24);
  assert.equal(y.margin, 600 - 24 - 260);
  assert.equal(y.patientSavings, 0);
});

test("members who use less than the full bundle cost less to serve", () => {
  const y = memberYear(S, { ...P, use: 0.5 }, 50);
  assert.equal(y.cost, 130);
  assert.equal(y.margin, 600 - 24 - 130);
});

test("the fee that targets a margin actually produces that margin", () => {
  for (const target of [0.1, 0.35, 0.5]) {
    const fee = feeForMargin(S, P, target);
    const y = memberYear(S, P, fee);
    assert.ok(Math.abs(y.marginPct - target) < 1e-9, String(target));
  }
});

test("impossible targets return null instead of a negative fee", () => {
  assert.equal(feeForMargin(S, P, 0.96), null);
  assert.equal(feeForMargin(S, P, 0.5), feeForMargin(S, P, 0.5));
  assert.equal(feeForMargin(S, { ...P, billingFee: 0.6 }, 0.5), null);
});

test("service lines parse; bad lines, zero quantity and negatives warn", () => {
  const w = [];
  const r = parseServices("Exam, 2, $70, 28\nbad\nNeg, 1, -5, 2\nZero, 0, 5, 2\n\nDental, 1, 450, 190", w);
  assert.equal(r.length, 2);
  assert.equal(w.length, 3);
  assert.deepEqual(r[0], { name: "Exam", qty: 2, price: 70, cost: 28 });
});

test("the example analyses; sweep margin falls as utilisation rises and break-even use is above the planned use", () => {
  const a = analyze(EXAMPLE_SHARED);
  assert.ok(a.ok);
  assert.ok(Math.abs(a.base.marginPct - 0.35) < 1e-9);
  for (let i = 1; i < a.sweep.length; i++) assert.ok(a.sweep[i].margin < a.sweep[i - 1].margin);
  assert.ok(a.breakEvenUse > 0.85);
  assert.equal(a.ladder.length, 5);
  assert.equal(a.lines.length, 6);
});

test("fixed fee mode uses the typed fee and reports the fee that would hit the target", () => {
  const a = analyze({ ...EXAMPLE_SHARED, feeMode: "fixed", monthlyFee: "40" });
  assert.equal(a.fee, 40);
  assert.ok(a.suggested > 0);
  assert.ok(a.base.marginPct < 0.35);
});

test("cohort: annual margin is per-member margin times members less replacement sign-up spend", () => {
  const a = analyze(EXAMPLE_SHARED);
  assert.equal(a.cohort.churned, 24);
  assert.equal(a.cohort.signupSpend, 24 * 40);
  assert.ok(Math.abs(a.cohort.annualMargin - (a.base.margin * 120 - 960)) < 1e-6);
});

test("invalid inputs are reported, not computed", () => {
  assert.equal(analyze({ ...EXAMPLE_SHARED, discountPct: "150" }).ok, false);
  assert.equal(analyze({ ...EXAMPLE_SHARED, services: "" }).ok, false);
  assert.equal(analyze({ ...EXAMPLE_SHARED, feeMode: "fixed", monthlyFee: "abc" }).ok, false);
  assert.equal(analyze({ ...EXAMPLE_SHARED, billingFeePct: "50", targetMarginPct: "60" }).ok, false);
});

test("csv has service rows, a blank line and a summary", () => {
  const lines = toCsv(analyze(EXAMPLE_SHARED)).trim().split("\n");
  assert.equal(lines.length, 1 + 6 + 1 + 1 + 1);
});
