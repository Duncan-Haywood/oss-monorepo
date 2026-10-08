import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULTS, analyze, depreciation, classify, participation, toCsv } from "./calc.mjs";

const close = (a, b, eps = 1) => assert.ok(Math.abs(a - b) <= eps, `${a} vs ${b}`);

test("depreciation splits bonus, regular cost-seg and straight line", () => {
  const d = depreciation(DEFAULTS);
  close(d.basis, 480000);
  close(d.bonus, 144000);
  close(d.sl, 336000 / 39);
  close(d.total, 144000 + 336000 / 39);
});

test("default case: 5-night average, 520 hours -> non-passive loss offsets other income", () => {
  const a = analyze(DEFAULTS);
  assert.equal(a.cls.nonPassive, true);
  close(a.result.loss, 144000 + 336000 / 39 - 35000);
  close(a.result.allowed, a.result.loss);
  close(a.result.savings, a.result.loss * 0.4);
  assert.equal(a.result.carry, 0);
});

test("average stay over 7 days makes the loss passive, 25k allowance only below the phase-out", () => {
  const hi = analyze({ ...DEFAULTS, avgStayDays: 20 });
  assert.equal(hi.cls.nonPassive, false);
  assert.equal(hi.result.allowed, 0);
  const lo = analyze({ ...DEFAULTS, avgStayDays: 20, otherIncome: 80000 });
  close(lo.result.allowed, 25000);
  const mid = analyze({ ...DEFAULTS, avgStayDays: 20, otherIncome: 125000 });
  close(mid.result.allowed, 12500);
});

test("material participation: 500 hours, or 100+ and more than anyone else", () => {
  assert.equal(participation({ hoursYou: 501, hoursOthers: 2000 }).ok, true);
  assert.equal(participation({ hoursYou: 300, hoursOthers: 299 }).ok, true);
  assert.equal(participation({ hoursYou: 300, hoursOthers: 300 }).ok, false);
  assert.equal(participation({ hoursYou: 90, hoursOthers: 0 }).ok, false);
  assert.equal(participation({ hoursYou: 0, hoursOthers: 300 }).hoursNeeded, 301);
  assert.equal(participation({ hoursYou: 0, hoursOthers: 900 }).hoursNeeded, 501);
});

test("excess business loss limit carries the rest forward", () => {
  const a = analyze({ ...DEFAULTS, purchasePrice: 3000000, grossRentalIncome: 0, operatingExpenses: 0, lossLimit: 250000 });
  close(a.result.allowed, 250000);
  assert.ok(a.result.carry > 0);
  assert.ok(a.warnings.some((w) => /carries forward/.test(w)));
});

test("cost segregation lift is positive and a profit is not a loss", () => {
  const a = analyze(DEFAULTS);
  assert.ok(a.costSegLift > 0);
  const p = analyze({ ...DEFAULTS, grossRentalIncome: 400000 });
  assert.equal(p.result.loss, 0);
  assert.ok(p.result.taxOnProfit > 0);
});

test("recapture exposure grows with hold years and ordinary rate", () => {
  const a = analyze(DEFAULTS);
  const b = analyze({ ...DEFAULTS, holdYears: 10 });
  assert.ok(b.recaptureExposure > a.recaptureExposure);
  close(a.rec.ordinary, 144000 * 0.35);
});

test("bad input is reported, not computed", () => {
  const a = analyze({ ...DEFAULTS, purchasePrice: 0 });
  assert.equal(a.result, null);
  assert.ok(a.warnings.length);
  assert.equal(analyze({ ...DEFAULTS, recoveryYears: 30 }).result, null);
});

test("classify and csv", () => {
  assert.equal(classify({ ...DEFAULTS, avgStayDays: 7 }).stayOk, true);
  assert.equal(classify({ ...DEFAULTS, avgStayDays: 7.1 }).stayOk, false);
  assert.equal(classify({ ...DEFAULTS, avgStayDays: 15 }).grey, true);
  assert.match(toCsv(analyze(DEFAULTS)), /tax_saved_year_one/);
});
