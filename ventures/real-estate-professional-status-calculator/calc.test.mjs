import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULTS, num, money, hoursTest, allowanceFor, analyze, hoursGrid } from "./calc.mjs";

const close = (a, b, msg) => assert.ok(Math.abs(a - b) < 0.01, `${msg}: ${a} vs ${b}`);

test("num parses money and percent text, NaN on blank", () => {
  assert.equal(num("$1,250"), 1250);
  assert.equal(num("5%"), 5);
  assert.ok(Number.isNaN(num("")));
  assert.equal(money(-1234.6), "-$1,235");
});

test("hours test needs MORE than 750 and MORE than half, both strict", () => {
  assert.equal(hoursTest(750, 0).pass, false);
  assert.equal(hoursTest(751, 0).pass, true);
  assert.equal(hoursTest(900, 900).pass, false); // exactly half is not more than half
  assert.equal(hoursTest(900, 899).pass, true);
  assert.equal(hoursTest(1000, 2000).pass, false); // a full-time job sinks it
});

test("hours short: the larger of reaching 751 and beating the other job by one hour", () => {
  assert.equal(hoursTest(500, 0).hoursShort, 251);
  assert.equal(hoursTest(1000, 2000).hoursShort, 1001);
  assert.equal(hoursTest(900, 400).hoursShort, 0);
});

// Hand-worked: allowance 25,000 less 50% of (120,000 - 100,000) = 15,000.
test("allowance phases out 50 cents per dollar over $100k and is gone at $150k", () => {
  assert.equal(allowanceFor({ ...DEFAULTS, magi: 90000 }), 25000);
  assert.equal(allowanceFor({ ...DEFAULTS, magi: 120000 }), 15000);
  assert.equal(allowanceFor({ ...DEFAULTS, magi: 150000 }), 0);
  assert.equal(allowanceFor({ ...DEFAULTS, magi: 400000 }), 0);
  assert.equal(allowanceFor({ ...DEFAULTS, magi: 90000, activeParticipation: 0 }), 0);
});

// Hand-worked, defaults: both gates pass (900 > 750, 900 > 400, 600 >= 500), so year 1's
// 60,000 loss is deducted at 35% = 21,000. Passive path: MAGI 220k kills the allowance, all
// 140,000 (60k + 4 x 20k) is suspended and released in year 5: 49,000 / 1.05^5 = 38,392.78.
// REPS path: 21,000/1.05 + 7,000 x (1/1.05^2 + ... + 1/1.05^5) = 43,639.67.
test("worked example: REPS is a timing gain, not a bigger total", () => {
  const a = analyze(DEFAULTS);
  assert.equal(a.nonPassive, true);
  assert.equal(a.firstYear.deducted, 60000);
  close(a.firstYear.taxValue, 21000, "year 1 value");
  assert.equal(a.releasedAtSale, 140000);
  close(a.pvPassive, 38392.78, "passive pv");
  close(a.pvReps, 43639.67, "reps pv");
  close(a.pvGainFromReps, 5246.89, "gain");
  close(a.year1Gain, 21000, "year-1 tax moved forward");
});

test("passing the hours test is not enough when the rentals are not materially participated in", () => {
  const a = analyze({ ...DEFAULTS, rentalHours: 300 });
  assert.equal(a.hours.pass, true);
  assert.equal(a.nonPassive, false);
  assert.equal(a.firstYear.deducted, 0);
  assert.equal(a.firstYear.suspended, 60000);
});

test("below the phase-out the allowance releases suspended losses as room appears", () => {
  const a = analyze({ ...DEFAULTS, reHours: 100, magi: 90000, year1Loss: 40000, annualLoss: 10000, yearsHeld: 3 });
  // year 1: 40k loss, 25k allowed, 15k carried; year 2: 25k available, 25k allowed, 0 carried;
  // year 3: 10k allowed.
  assert.deepEqual(a.passiveRows.map((r) => r.deducted), [25000, 25000, 10000]);
  assert.equal(a.releasedAtSale, 0);
  close(a.pvPassive, (25000 / 1.05 + 25000 / 1.05 ** 2 + 10000 / 1.05 ** 3) * 0.35, "pv");
});

test("zero discount rate makes timing worth nothing when everything is released at sale", () => {
  const a = analyze({ ...DEFAULTS, discountPct: 0 });
  close(a.pvGainFromReps, 0, "no timing value");
});

test("hours grid marks a full-time job as failing at any realistic real estate hours", () => {
  const g = hoursGrid();
  const row = g.find((r) => r.re === 1500);
  assert.deepEqual(row.cells.map((c) => c.pass), [true, true, true, false, false]);
  assert.equal(g.find((r) => r.re === 500).cells[0].pass, false);
});
