import { test } from "node:test";
import assert from "node:assert/strict";
import { normalise, rolledInNightly, breakEvenCleaningFee, stay, minProfitableStay, outcome } from "./calc.mjs";

const base = { nightly: 150, cleaningFee: 100, cleaningCost: 90, avgStay: 3, hostFee: 0.03, guestFee: 0.14, nightCost: 10, nightsPerMonth: 18 };
const close = (a, b, e = 1e-9) => assert.ok(Math.abs(a - b) < e, `${a} vs ${b}`);

test("rejects bad input", () => {
  assert.match(normalise({ ...base, nightly: 0 }).invalid, /nightly/);
  assert.match(normalise({ ...base, avgStay: 0.5 }).invalid, /Average stay/);
  assert.match(normalise({ ...base, hostFee: 1 }).invalid, /Host fee/);
  assert.match(normalise({ ...base, cleaningFee: -1 }).invalid, /cleaningFee/);
});

test("rolled-in rate spreads the fee over the average stay", () => {
  close(rolledInNightly(normalise(base)), 150 + 100 / 3);
});

test("both structures earn the same at the average stay", () => {
  const i = normalise(base);
  close(stay(i, "separate", 3).payout, stay(i, "rolled", 3).payout);
  close(stay(i, "separate", 3).guestTotal, stay(i, "rolled", 3).guestTotal);
});

test("rolling in pays less than a separate fee on short stays and more on long ones", () => {
  const i = normalise(base);
  assert.ok(stay(i, "rolled", 1).payout < stay(i, "separate", 1).payout);
  assert.ok(stay(i, "rolled", 7).payout > stay(i, "separate", 7).payout);
});

test("break-even cleaning fee leaves the host whole after the host fee", () => {
  const i = normalise(base);
  close(breakEvenCleaningFee(i) * (1 - i.hostFee), i.cleaningCost);
});

test("profit per stay is linear; minimum profitable stay is exact", () => {
  const i = normalise({ ...base, cleaningFee: 0, cleaningCost: 300 });
  const m = minProfitableStay(i, "separate");
  assert.ok(m > 1);
  close(stay(i, "separate", m).profit, 0, 1e-6);
});

test("never profitable when nightly rate after fees is below night cost", () => {
  const i = normalise({ ...base, nightly: 5, cleaningFee: 0, nightCost: 20 });
  assert.equal(minProfitableStay(i, "separate"), null);
});

test("outcome flags an under-recovering cleaning fee", () => {
  const r = outcome({ ...base, cleaningFee: 60 });
  assert.ok(r.findings.some((f) => /does not cover the cleaner/.test(f.title)));
  assert.ok(r.cleaningNet < 0);
});

test("outcome reports monthly cleaning net from stays per month", () => {
  const r = outcome(base);
  close(r.staysPerMonth, 6);
  close(r.monthlyCleaningNet, 6 * (100 * 0.97 - 90));
  assert.equal(r.table.length, 6);
});

test("outcome propagates invalid input", () => {
  assert.ok(outcome({ ...base, nightly: 0 }).invalid);
});
