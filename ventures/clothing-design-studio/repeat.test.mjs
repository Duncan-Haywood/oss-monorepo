import test from "node:test";
import assert from "node:assert/strict";
import { repeatValue } from "./repeat.mjs";

// price 50, landed 15, ship 5, fee 3% + 0.30 => fees 1.80, c1 = 28.20
const base = { price: 50, landed: 15, ship: 5, feePct: 3, feeFixed: 0.3, retentionPct: 0, ordersPerYear: 1 };

test("no retention: value is the first order only", () => {
  const r = repeatValue(base);
  assert.equal(r.firstOrderProfit, 28.2);
  assert.equal(r.ltv, 28.2);
  assert.equal(r.maxCacAtRatio, 9.4);
});

test("50% retention, no discount, 2 years, 1 order a year: 28.2 + 28.2 x (0.5 + 0.25) = 49.35", () => {
  const r = repeatValue({ ...base, retentionPct: 50, discountPct: 0, years: 2 });
  assert.equal(r.ltv, 49.35);
  assert.deepEqual(r.years.map(y => y.cumulative), [42.3, 49.35]);
  assert.equal(r.repeatShareOfLtv, 42.9);
});

test("discounting: 50% retention, 100% discount rate, 1 year => x = 0.25, LTV 28.2 + 7.05", () => {
  assert.equal(repeatValue({ ...base, retentionPct: 50, discountPct: 100, years: 1 }).ltv, 35.25);
});

test("full retention with no discount is n x c x years", () => {
  assert.equal(repeatValue({ ...base, retentionPct: 100, discountPct: 0, years: 3, ordersPerYear: 2 }).ltv, 197.4);
});

test("payback: cost 40 against 42.3 after year 1 is year 1; cost 20 is paid by the first order", () => {
  const o = { ...base, retentionPct: 50, discountPct: 0, years: 2 };
  assert.equal(repeatValue({ ...o, cac: 40 }).paybackYears, 1);
  assert.equal(repeatValue({ ...o, cac: 20 }).paybackYears, 0);
  assert.equal(repeatValue({ ...o, cac: 60 }).paybackYears, null);
  assert.match(repeatValue({ ...o, cac: 60 }).notes.join(" "), /does not pay it back/);
});

test("repeat orders can earn a different amount", () => {
  assert.equal(repeatValue({ ...base, retentionPct: 100, discountPct: 0, years: 1, repeatContribution: 10 }).ltv, 38.2);
});

test("bad input is refused, not guessed", () => {
  assert.ok(repeatValue({ ...base, retentionPct: 120 }).error);
  assert.ok(repeatValue(null).error);
  assert.ok(repeatValue({ ...base, price: NaN }).error);
});
