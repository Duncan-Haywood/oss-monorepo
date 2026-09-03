import test from "node:test";
import assert from "node:assert/strict";
import {
  formatResistance,
  nearestStandardResistor,
  recommendedPowerRating,
  calculateLedResistor,
  E24_BASE,
  STANDARD_POWER_RATINGS_WATTS,
} from "./calc.mjs";

test("formatResistance picks the right unit prefix", () => {
  assert.equal(formatResistance(220), "220 Ω");
  assert.equal(formatResistance(4700), "4.7 kΩ");
  assert.equal(formatResistance(1500000), "1.5 MΩ");
  assert.equal(formatResistance(0), "0 Ω");
});

test("nearestStandardResistor snaps to the closer E24 value", () => {
  // (9 - 2) / 0.02 = 350 -> equidistant-ish between 330 and 360, closer to 360
  assert.equal(nearestStandardResistor(350), 360);
  // exact E24 value stays unchanged
  assert.equal(nearestStandardResistor(300), 300);
  // crosses a decade boundary: closest to 9.6 is 10, not 9.1
  assert.equal(nearestStandardResistor(9.6), 10);
});

test("nearestStandardResistor rejects non-positive input", () => {
  assert.throws(() => nearestStandardResistor(0), /positive/);
  assert.throws(() => nearestStandardResistor(-5), /positive/);
});

test("every E24 base value maps to itself at the 1x decade", () => {
  for (const base of E24_BASE) {
    const expected = Math.round(base * 100 * 1e6) / 1e6;
    assert.equal(nearestStandardResistor(base * 100), expected);
  }
});

test("recommendedPowerRating applies a 2x safety margin by default", () => {
  // 0.14 W * 2 = 0.28 W -> next standard rating is 0.5 W
  assert.equal(recommendedPowerRating(0.14), 0.5);
  assert.equal(recommendedPowerRating(0), STANDARD_POWER_RATINGS_WATTS[0]);
});

test("recommendedPowerRating returns null past the largest common rating", () => {
  assert.equal(recommendedPowerRating(100), null);
});

test("recommendedPowerRating rejects negative power", () => {
  assert.throws(() => recommendedPowerRating(-1), /non-negative/);
});

test("classic 9V-supply, single red LED example", () => {
  // 9V supply, 2V red LED, 20mA -> R = (9-2)/0.02 = 350 ohms
  const r = calculateLedResistor({
    supplyVoltage: 9,
    ledForwardVoltage: 2,
    ledForwardCurrentMa: 20,
    numLeds: 1,
  });
  assert.equal(r.totalLedVoltage, 2);
  assert.equal(r.requiredOhms, 350);
  assert.equal(r.formattedRequired, "350 Ω");
  assert.ok(Math.abs(r.powerWatts - 0.14) < 1e-9);
  assert.equal(r.nearestStandardOhms, 360);
  assert.equal(r.recommendedPowerRatingWatts, 0.5);
  // at the nearest standard 360R, current drops slightly below 20mA
  assert.ok(r.currentAtNearestMa < 20);
  assert.ok(r.currentAtNearestMa > 19);
});

test("5V supply, blue LED with a higher forward voltage", () => {
  // 5V supply, 3.2V blue LED, 20mA -> R = (5-3.2)/0.02 = 90 ohms
  const r = calculateLedResistor({
    supplyVoltage: 5,
    ledForwardVoltage: 3.2,
    ledForwardCurrentMa: 20,
  });
  assert.equal(r.requiredOhms, 90);
  assert.equal(r.nearestStandardOhms, 91);
});

test("multiple LEDs in series", () => {
  // 12V supply, 3 red LEDs at 2V each (6V total), 20mA -> R = (12-6)/0.02 = 300 ohms exactly
  const r = calculateLedResistor({
    supplyVoltage: 12,
    ledForwardVoltage: 2,
    ledForwardCurrentMa: 20,
    numLeds: 3,
  });
  assert.equal(r.totalLedVoltage, 6);
  assert.equal(r.requiredOhms, 300);
  assert.equal(r.nearestStandardOhms, 300);
  assert.equal(r.currentAtNearestMa, 20);
});

test("rejects a supply voltage that leaves no headroom for a resistor", () => {
  assert.throws(
    () =>
      calculateLedResistor({
        supplyVoltage: 6,
        ledForwardVoltage: 2,
        ledForwardCurrentMa: 20,
        numLeds: 3,
      }),
    /no headroom/,
  );
  assert.throws(
    () =>
      calculateLedResistor({
        supplyVoltage: 3,
        ledForwardVoltage: 3.2,
        ledForwardCurrentMa: 20,
      }),
    /no headroom/,
  );
});

test("rejects invalid inputs", () => {
  const base = { supplyVoltage: 9, ledForwardVoltage: 2, ledForwardCurrentMa: 20, numLeds: 1 };
  assert.throws(() => calculateLedResistor({ ...base, supplyVoltage: 0 }), /Supply voltage/);
  assert.throws(() => calculateLedResistor({ ...base, supplyVoltage: NaN }), /Supply voltage/);
  assert.throws(() => calculateLedResistor({ ...base, ledForwardVoltage: -1 }), /forward voltage/);
  assert.throws(() => calculateLedResistor({ ...base, ledForwardCurrentMa: 0 }), /forward current/);
  assert.throws(() => calculateLedResistor({ ...base, numLeds: 0 }), /positive whole number/);
  assert.throws(() => calculateLedResistor({ ...base, numLeds: 1.5 }), /positive whole number/);
});
