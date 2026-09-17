// Tests for the LED wiring comparison.
//
// The numbers below are worked from Ohm's law by hand rather than copied from
// a run of the code, so a change in the module that alters a result fails here
// instead of quietly re-baselining itself.

import test from "node:test";
import assert from "node:assert/strict";

import { compareLedWiring, maxLedsInSeries, wiringNote } from "./wiring.mjs";

const near = (actual, expected, tolerance = 1e-6) =>
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `expected ${expected}, got ${actual}`,
  );

const option = (result, key) => result.options.find((o) => o.key === key);

// A 9 V supply, four 2 V LEDs at 20 mA. Chosen because every figure is exact:
// the string drops 8 V leaving 1 V, and a single branch leaves 7 V.
const FOUR_ON_NINE = {
  supplyVoltage: 9,
  ledForwardVoltage: 2,
  ledForwardCurrentMa: 20,
  numLeds: 4,
};

// ---------------------------------------------------------------- headroom

test("a series string must leave the resistor some voltage", () => {
  // 9 V / 2 V is 4.5, so four fit and five do not — but the cap is not simply
  // floor(4.5): a string that used all 9 V would leave the resistor 0 V.
  assert.equal(maxLedsInSeries(9, 2), 4);
  // Exactly 4 x 1.25 V = 5 V on a 5 V supply leaves nothing at all, so the
  // fourth LED must not be counted.
  assert.equal(maxLedsInSeries(5, 1.25), 3);
  // A red LED on 5 V: 3 x 1.6 = 4.8, leaving 0.2 V, which clears the margin.
  assert.equal(maxLedsInSeries(5, 1.6), 3);
});

test("headroom is rejected before it becomes a negative resistance", () => {
  assert.throws(() => maxLedsInSeries(0, 2), /Supply voltage/);
  assert.throws(() => maxLedsInSeries(9, -1), /forward voltage/);
});

// ------------------------------------------------------------------ series

test("the series string sizes one resistor from the leftover voltage", () => {
  const series = option(compareLedWiring(FOUR_ON_NINE), "series");
  assert.equal(series.available, true);
  assert.equal(series.resistorCount, 1);
  // 9 V - (4 x 2 V) = 1 V across the resistor at 20 mA -> 50 ohms.
  near(series.resistorOhms, 50);
  // E24 runs 4.7, 5.1 with no 5.0 in between, so an exact 50 Ω has to snap
  // to 51 Ω — the nearest part that exists rather than the value on paper.
  assert.equal(series.nearestStandardOhms, 51);
  // 0.02^2 x 50 = 0.02 W. Doubled for margin that is 0.04 W, which the
  // 1/16 W (0.0625 W) part already covers.
  near(series.perResistorWatts, 0.02);
  assert.equal(series.recommendedPowerRatingWatts, 0.0625);
});

test("a series string draws the design current once, not once per LED", () => {
  const series = option(compareLedWiring(FOUR_ON_NINE), "series");
  // This is the whole efficiency argument: one branch, so 20 mA total.
  near(series.supplyCurrentMa, 20);
  near(series.supplyPowerWatts, 0.18); // 9 V x 20 mA
  near(series.ledPowerWatts, 0.16); // 8 V of LEDs x 20 mA
  near(series.wastedPowerWatts, 0.02);
  near(series.efficiencyPercent, (0.16 / 0.18) * 100);
});

test("a string too tall for the supply is reported, not approximated", () => {
  const series = option(
    compareLedWiring({ ...FOUR_ON_NINE, numLeds: 5 }),
    "series",
  );
  assert.equal(series.available, false);
  assert.match(series.unavailableReason, /10 V before the resistor/);
  assert.match(series.unavailableReason, /fits 4 in a string/);
  // No resistor value is offered for a wiring that cannot be built.
  assert.equal(series.resistorOhms, undefined);
});

// -------------------------------------------------------------- individual

test("individual resistors size one branch and multiply the current", () => {
  const individual = option(compareLedWiring(FOUR_ON_NINE), "individual");
  assert.equal(individual.resistorCount, 4);
  // 9 V - 2 V = 7 V at 20 mA -> 350 ohms, the same value the single-LED
  // calculator gives, because it is the same single-LED question.
  near(individual.resistorOhms, 350);
  near(individual.supplyCurrentMa, 80); // 4 branches x 20 mA
  near(individual.supplyPowerWatts, 0.72); // 9 V x 80 mA
  near(individual.ledPowerWatts, 0.16); // unchanged: same LEDs, same current
  near(individual.wastedPowerWatts, 0.56);
});

test("individual resistors are always available, series is not", () => {
  const tall = compareLedWiring({ ...FOUR_ON_NINE, numLeds: 9 });
  assert.equal(option(tall, "series").available, false);
  assert.equal(option(tall, "individual").available, true);
  assert.equal(tall.recommended, "individual");
});

// ------------------------------------------------------------------ shared

test("a shared resistor is sized for the total current", () => {
  const shared = option(compareLedWiring(FOUR_ON_NINE), "shared");
  assert.equal(shared.resistorCount, 1);
  // 7 V across the resistor at 4 x 20 mA = 80 mA -> 87.5 ohms.
  near(shared.resistorOhms, 87.5);
  near(shared.supplyCurrentMa, 80);
  // 0.08^2 x 87.5 = 0.56 W. That is a real part: doubled it is 1.12 W, so a
  // 2 W resistor.
  near(shared.perResistorWatts, 0.56);
  assert.equal(shared.recommendedPowerRatingWatts, 2);
});

test("the shared resistor saves parts, not power", () => {
  // The finding that makes this page worth reading: both parallel wirings
  // drop (supply - Vf) at the same total current, so they waste identically.
  // The shared one gives up current control for nothing but a part count.
  const result = compareLedWiring(FOUR_ON_NINE);
  const shared = option(result, "shared");
  const individual = option(result, "individual");
  near(shared.wastedPowerWatts, individual.wastedPowerWatts);
  near(shared.supplyPowerWatts, individual.supplyPowerWatts);
  assert.ok(shared.resistorCount < individual.resistorCount);
});

test("the shared-resistor risk is stated as a bound, not a prediction", () => {
  const shared = option(compareLedWiring(FOUR_ON_NINE), "shared");
  assert.deepEqual(shared.sharedResistorRisk, {
    designCurrentMa: 20,
    worstCaseCurrentMa: 80,
    worstCaseMultiple: 4,
  });
});

test("one LED sharing one resistor carries no mismatch risk", () => {
  // With a single LED there is nothing to share with, so the risk block is
  // absent rather than a 1x bound dressed up as a warning.
  const shared = option(compareLedWiring({ ...FOUR_ON_NINE, numLeds: 1 }), "shared");
  assert.equal(shared.sharedResistorRisk, null);
});

// -------------------------------------------------------------- the choice

test("series is recommended wherever the supply has room for it", () => {
  const result = compareLedWiring(FOUR_ON_NINE);
  assert.equal(result.recommended, "series");
  assert.match(wiringNote(result), /in series with one resistor/);
  // 0.56 W wasted by individual resistors against 0.02 W by the string.
  assert.match(wiringNote(result), /0\.540 W less heat/);
});

test("a shared resistor is never the recommendation", () => {
  for (const numLeds of [2, 3, 4, 5, 8, 20]) {
    const result = compareLedWiring({ ...FOUR_ON_NINE, numLeds });
    assert.notEqual(result.recommended, "shared");
  }
});

test("a single LED is told there is no wiring choice to make", () => {
  const result = compareLedWiring({ ...FOUR_ON_NINE, numLeds: 1 });
  assert.equal(result.recommended, "individual");
  assert.match(wiringNote(result), /only one wiring/);
});

test("the note explains a supply that cannot hold a string", () => {
  const note = wiringNote(compareLedWiring({ ...FOUR_ON_NINE, numLeds: 6 }));
  assert.match(note, /more voltage than this supply has/);
  assert.match(note, /it fits 4/);
});

// ------------------------------------------------------------------ inputs

test("inputs that describe no circuit are refused", () => {
  assert.throws(() => compareLedWiring({ ...FOUR_ON_NINE, supplyVoltage: 0 }), /Supply voltage/);
  assert.throws(
    () => compareLedWiring({ ...FOUR_ON_NINE, ledForwardCurrentMa: 0 }),
    /forward current/,
  );
  assert.throws(() => compareLedWiring({ ...FOUR_ON_NINE, numLeds: 2.5 }), /whole number/);
  assert.throws(() => compareLedWiring({ ...FOUR_ON_NINE, numLeds: 0 }), /whole number/);
});

test("a supply below one LED's forward voltage is refused for every wiring", () => {
  // Not a series-only problem: no wiring works, so the whole call fails
  // rather than returning two options that cannot be built either.
  assert.throws(
    () => compareLedWiring({ ...FOUR_ON_NINE, supplyVoltage: 2, ledForwardVoltage: 3.2 }),
    /must exceed one LED's forward voltage/,
  );
});

test("a white LED string on a 12 V supply works out as expected", () => {
  // A second worked case with different arithmetic: 3.2 V white LEDs at
  // 20 mA on 12 V. 12 / 3.2 = 3.75, and 3 x 3.2 = 9.6 leaves 2.4 V.
  const result = compareLedWiring({
    supplyVoltage: 12,
    ledForwardVoltage: 3.2,
    ledForwardCurrentMa: 20,
    numLeds: 3,
  });
  assert.equal(result.maxLedsInSeries, 3);
  const series = option(result, "series");
  near(series.resistorOhms, 120); // 2.4 V / 0.02 A
  assert.equal(series.nearestStandardOhms, 120); // an E24 value exactly
  const individual = option(result, "individual");
  near(individual.resistorOhms, 440); // 8.8 V / 0.02 A
  assert.equal(individual.nearestStandardOhms, 430);
});
