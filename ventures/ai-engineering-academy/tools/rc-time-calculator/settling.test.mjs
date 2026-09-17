// Tests for the "basically fully charged" settling-time logic.
//
// Every expected figure below is worked from V(t) = Vs(1 - e^-t/RC) by hand
// rather than copied from a run of the code, so a change that alters a
// result fails here instead of quietly re-baselining itself.

import test from "node:test";
import assert from "node:assert/strict";

import { chargeSettlingTable, timeToReachPercent, SETTLING_MULTIPLES } from "./settling.mjs";

const near = (actual, expected, tolerance = 1e-6) =>
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `expected ${expected}, got ${actual}`,
  );

// R = 10 kΩ, C = 100 nF, Vs = 5 V — the parent page's own defaults, so
// τ = 1 ms exactly and every row below is easy to check by hand.
const DEFAULTS = { resistanceOhms: 10000, capacitanceFarads: 100e-9, supplyVolts: 5 };

// ------------------------------------------------------------- the table

test("the settling table covers the documented multiples in order", () => {
  const rows = chargeSettlingTable(DEFAULTS);
  assert.deepEqual(rows.map((r) => r.multiple), SETTLING_MULTIPLES);
});

test("1 time constant reaches 1 - 1/e, the textbook 63.2%", () => {
  const row = chargeSettlingTable(DEFAULTS).find((r) => r.multiple === 1);
  near(row.timeSeconds, 0.001);
  near(row.percentOfSupply, (1 - Math.exp(-1)) * 100, 1e-4);
  near(row.percentOfSupply, 63.212056, 1e-4);
  near(row.volts, 5 * (1 - Math.exp(-1)), 1e-4);
});

test("5 time constants — the conventional 'basically charged' point — reaches 99.326%", () => {
  const row = chargeSettlingTable(DEFAULTS).find((r) => r.multiple === 5);
  near(row.timeSeconds, 0.005);
  // 1 - e^-5 = 0.9932620530...
  near(row.percentOfSupply, 99.326205, 1e-4);
  near(row.volts, 4.966310, 1e-4);
});

test("10 time constants is indistinguishable from full in practice, but still not exact", () => {
  const row = chargeSettlingTable(DEFAULTS).find((r) => r.multiple === 10);
  // 1 - e^-10 = 0.99995460...
  near(row.percentOfSupply, 99.995460, 1e-4);
  assert.ok(row.percentOfSupply < 100);
});

test("the table climbs monotonically toward, but never reaches, 100%", () => {
  const rows = chargeSettlingTable(DEFAULTS);
  for (let i = 1; i < rows.length; i++) {
    assert.ok(rows[i].percentOfSupply > rows[i - 1].percentOfSupply);
    assert.ok(rows[i].percentOfSupply < 100);
  }
});

test("the table rejects a circuit that describes no valid RC", () => {
  assert.throws(() => chargeSettlingTable({ ...DEFAULTS, resistanceOhms: 0 }), /Resistance/);
  assert.throws(() => chargeSettlingTable({ ...DEFAULTS, capacitanceFarads: -1 }), /Capacitance/);
  assert.throws(() => chargeSettlingTable({ ...DEFAULTS, supplyVolts: 0 }), /Supply voltage/);
});

// ------------------------------------------------------- the percent solver

test("50% is reached at ln(2) time constants — the same constant as a half-life", () => {
  const r = timeToReachPercent({ ...DEFAULTS, percentOfSupply: 50 });
  // t = -RC * ln(0.5) = RC * ln(2)
  near(r.timeConstants, Math.LN2, 1e-6);
  near(r.timeSeconds, 0.001 * Math.LN2, 1e-8);
});

test("99% is reached just past 4.6 time constants", () => {
  const r = timeToReachPercent({ ...DEFAULTS, percentOfSupply: 99 });
  // t = -RC * ln(0.01) = RC * ln(100) = RC * 4.605170186...
  near(r.timeConstants, 4.605170186, 1e-6);
  near(r.timeSeconds, 0.001 * 4.605170186, 1e-8);
});

test("the percent solver and the settling table agree at the same multiple", () => {
  // Solving for the exact percentage the 5-tau row reports must land back on
  // 5 time constants — the two are inverses of the same equation.
  const row = chargeSettlingTable(DEFAULTS).find((r) => r.multiple === 5);
  const solved = timeToReachPercent({ ...DEFAULTS, percentOfSupply: row.percentOfSupply });
  near(solved.timeConstants, 5, 1e-3);
});

test("100% and above are refused rather than returning Infinity", () => {
  assert.throws(
    () => timeToReachPercent({ ...DEFAULTS, percentOfSupply: 100 }),
    /never mathematically reaches 100%/,
  );
  assert.throws(() => timeToReachPercent({ ...DEFAULTS, percentOfSupply: 150 }), /100%/);
});

test("0% and below are refused", () => {
  assert.throws(() => timeToReachPercent({ ...DEFAULTS, percentOfSupply: 0 }), /Target percent/);
  assert.throws(() => timeToReachPercent({ ...DEFAULTS, percentOfSupply: -5 }), /Target percent/);
});

test("the percent solver rejects an invalid circuit the same way the table does", () => {
  assert.throws(
    () => timeToReachPercent({ resistanceOhms: 0, capacitanceFarads: 1e-9, percentOfSupply: 90 }),
    /Resistance/,
  );
});

// ---------------------------------------------------- a second worked case

test("a different R and C still checks out by hand: 1 kΩ, 1 µF, 12 V supply", () => {
  // τ = 1k x 1µF = 1 ms.
  const rows = chargeSettlingTable({ resistanceOhms: 1000, capacitanceFarads: 1e-6, supplyVolts: 12 });
  const three = rows.find((r) => r.multiple === 3);
  // 1 - e^-3 = 0.950212932; 12 x that = 11.4025...
  near(three.percentOfSupply, 95.021293, 1e-3);
  near(three.volts, 11.402552, 1e-3);
});
