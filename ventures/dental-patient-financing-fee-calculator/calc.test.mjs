import { test } from "node:test";
import assert from "node:assert/strict";
import { financing, inHouse, payInFull, analyze, toCsv, EXAMPLE_SHARED } from "./calc.mjs";

const P = { fee: 10000, merchantFee: 0.08, fundingDays: 0, rate: 0, cardFee: 0, downPct: 0.2, months: 10, stopRate: 0, stopShare: 0.5, adminPerMonth: 0, discount: 0.05 };

test("financing pays the fee less the merchant fee", () => {
  const r = financing(P);
  assert.equal(r.received, 9200);
  assert.equal(r.pv, 9200);
  assert.equal(r.fees, 800);
});

test("waiting for funding days lowers the value of financing", () => {
  const r = financing({ ...P, rate: 0.1, fundingDays: 365 });
  assert.ok(Math.abs(r.pv - 9200 / 1.1) < 1e-9);
});

test("an in-house plan with no costs and no defaults collects the whole fee", () => {
  const r = inHouse(P);
  assert.equal(r.down, 2000);
  assert.equal(r.monthly, 800);
  assert.equal(r.received, 10000);
  assert.equal(r.lost, 0);
});

test("patients who stop paying leave an unpaid balance after the stop month", () => {
  const r = inHouse({ ...P, stopRate: 0.5, stopShare: 0.5 });
  // Months 6..10 are paid by half the patients: 5 months x 800 x 0.5 = 2000 not collected.
  assert.equal(Math.round(r.lost), 2000);
  assert.equal(Math.round(r.received), 8000);
});

test("card fees and admin cost are charged on payments taken", () => {
  const r = inHouse({ ...P, cardFee: 0.03, adminPerMonth: 5 });
  assert.equal(Math.round(r.fees), 300);
  assert.equal(r.admin, 50);
  assert.equal(Math.round(r.received), 10000 - 300 - 50);
});

test("pay in full applies the discount then the card fee", () => {
  const r = payInFull({ ...P, cardFee: 0.03 });
  assert.equal(r.received, 9500 * 0.97);
  assert.equal(r.lost, 500);
});

test("the example runs and the break-even acceptance reproduces expected value", () => {
  const a = analyze(EXAMPLE_SHARED);
  assert.ok(a.ok);
  const [fin, plan] = a.options;
  const needed = a.breakEven.finVsPlan / 100;
  assert.ok(Math.abs(needed * fin.contribution - plan.perPresented) < 1e-6);
});

test("at the break-even merchant fee, financing and the plan earn the same per accepted case", () => {
  const a = analyze(EXAMPLE_SHARED);
  const same = analyze({ ...EXAMPLE_SHARED, merchantFeePct: String(a.merchantBreakEven) });
  assert.ok(Math.abs(same.options[0].contribution - same.options[1].contribution) < 1e-6);
});

test("bad inputs are reported, not computed", () => {
  const a = analyze({ ...EXAMPLE_SHARED, caseFee: "abc", months: "0" });
  assert.equal(a.ok, false);
  assert.ok(a.warnings.length >= 2);
});

test("csv has a header and one row per option", () => {
  const rows = toCsv(analyze(EXAMPLE_SHARED)).trim().split("\n");
  assert.equal(rows.length, 4);
});
