import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULTS, num, money, pct, flows, presentValue, impliedRate, analyze } from "./calc.mjs";

const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);

test("num strips currency and percent signs and rejects blanks", () => {
  assert.equal(num("$1,250"), 1250);
  assert.equal(num("6%"), 6);
  assert.ok(Number.isNaN(num("")));
  assert.equal(money(1234.5), "$1,235");
  assert.equal(money(NaN), "n/a");
  assert.equal(pct(0.1234), "12.3%");
});

test("a single payment is discounted by (1 + r)^t", () => {
  const fl = flows({ monthlyPayment: 0, monthsLeft: 0, lump1Amount: 10000, lump1Months: 12, lump2Amount: 0 });
  assert.equal(fl.length, 1);
  close(presentValue(fl, 10), 10000 / 1.1);
  close(impliedRate(10000 / 1.1, fl), 0.1, 1e-9);
});

test("monthly stream matches the closed-form annuity at the effective rate", () => {
  const fl = flows({ monthlyPayment: 1000, monthsLeft: 24, growthPct: 0, lump1Amount: 0, lump2Amount: 0 });
  assert.equal(fl.length, 24);
  const r = 0.08, i = Math.pow(1 + r, 1 / 12) - 1;
  const expected = 1000 * (1 - Math.pow(1 + i, -24)) / i;
  close(presentValue(fl, 8), expected, 1e-6);
});

test("the monthly payment steps up every twelve payments", () => {
  const fl = flows({ monthlyPayment: 1000, monthsLeft: 36, growthPct: 3, lump1Amount: 0, lump2Amount: 0 });
  assert.equal(fl[0].amount, 1000);
  assert.equal(fl[11].amount, 1000);
  close(fl[12].amount, 1030);
  close(fl[24].amount, 1060.9);
});

test("implied rate round-trips through presentValue", () => {
  const o = { ...DEFAULTS };
  const fl = flows(o);
  for (const r of [3, 9, 17.5]) {
    close(impliedRate(presentValue(fl, r), fl), r / 100, 1e-9);
  }
});

test("a deeper discount means a higher implied rate", () => {
  const a = analyze({ ...DEFAULTS, offer: 130000 });
  const b = analyze({ ...DEFAULTS, offer: 100000 });
  assert.ok(b.rate > a.rate);
});

test("fees raise the rate the buyer earns and are taken out of the cash", () => {
  const withFees = analyze({ ...DEFAULTS, fees: 5000 });
  const without = analyze({ ...DEFAULTS, fees: 0 });
  assert.equal(withFees.net, DEFAULTS.offer - 5000);
  assert.ok(withFees.rate > without.rate);
  close(withFees.rateGross, without.rate, 1e-12);
});

test("gap is the value at your benchmark rate minus the cash you get", () => {
  const a = analyze(DEFAULTS);
  close(a.gap, presentValue(a.fl, DEFAULTS.benchmarkRate) - a.net, 1e-6);
  close(a.cents, a.net / a.total, 1e-12);
});

test("offer equal to value at r yields r", () => {
  const fl = flows(DEFAULTS);
  const a = analyze({ ...DEFAULTS, fees: 0, offer: presentValue(fl, 11) });
  close(a.rate, 0.11, 1e-9);
});

test("average timing and last payment are computed from the schedule", () => {
  const a = analyze({ monthlyPayment: 0, monthsLeft: 0, lump1Amount: 1000, lump1Months: 24, lump2Amount: 1000, lump2Months: 48, offer: 1500, fees: 0, benchmarkRate: 5 });
  close(a.avgYears, 3);
  close(a.lastYears, 4);
});

test("warnings catch missing figures, fee-eaten offers and offers above the payments", () => {
  assert.ok(analyze({ ...DEFAULTS, offer: 0 }).warnings.length);
  assert.ok(analyze({ ...DEFAULTS, monthlyPayment: 0, lump1Amount: 0 }).warnings.length);
  assert.ok(analyze({ ...DEFAULTS, fees: 999999 }).warnings.some((w) => /fees/.test(w)));
  assert.ok(analyze({ ...DEFAULTS, offer: 99999999 }).warnings.some((w) => /larger/.test(w)));
});

test("grid values fall as the rate rises and giveUp is value minus net", () => {
  const a = analyze(DEFAULTS);
  for (let i = 1; i < a.grid.length; i++) assert.ok(a.grid[i].value < a.grid[i - 1].value);
  close(a.grid[0].giveUp, a.grid[0].value - a.net);
});

test("impliedRate is NaN when no rate in range explains the cash", () => {
  const fl = flows(DEFAULTS);
  assert.ok(Number.isNaN(impliedRate(0, fl)));
  assert.ok(Number.isNaN(impliedRate(1e12, fl)));
  assert.ok(Number.isNaN(impliedRate(1000, [])));
});
