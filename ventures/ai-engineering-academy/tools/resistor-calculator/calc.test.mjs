import test from "node:test";
import assert from "node:assert/strict";
import {
  decodeResistor4Band,
  decodeResistor5Band,
  solveOhmsLaw,
  calculateLedResistor,
  formatResistance,
} from "./calc.mjs";

test("4-band: yellow-violet-red-gold is the common 4.7k, 5%", () => {
  const r = decodeResistor4Band("yellow", "violet", "red", "gold");
  assert.equal(r.ohms, 4700);
  assert.equal(r.tolerancePercent, 5);
  assert.equal(r.formatted, "4.7 kΩ");
});

test("4-band: brown-black-red-gold is 1k, 5%", () => {
  const r = decodeResistor4Band("brown", "black", "red", "gold");
  assert.equal(r.ohms, 1000);
  assert.equal(r.formatted, "1 kΩ");
});

test("4-band: red-red-brown-gold is 220R, 5%", () => {
  const r = decodeResistor4Band("red", "red", "brown", "gold");
  assert.equal(r.ohms, 220);
  assert.equal(r.formatted, "220 Ω");
});

test("4-band: green-blue-gold-gold is a sub-ohm value (5.6 * 0.1)", () => {
  const r = decodeResistor4Band("green", "blue", "gold", "gold");
  assert.equal(r.ohms, 5.6);
});

test("4-band rejects an unrecognised band color", () => {
  assert.throws(() => decodeResistor4Band("mauve", "black", "red", "gold"), /Unrecognised digit band color/);
});

test("5-band: brown-black-black-red-brown is 10k, 1%", () => {
  const r = decodeResistor5Band("brown", "black", "black", "red", "brown");
  assert.equal(r.ohms, 10000);
  assert.equal(r.tolerancePercent, 1);
  assert.equal(r.formatted, "10 kΩ");
});

test("5-band: optional 6th temperature-coefficient band", () => {
  const r = decodeResistor5Band("brown", "black", "black", "red", "brown", "red");
  assert.equal(r.ppmPerC, 50);
});

test("5-band: omitting the temperature-coefficient band leaves it unset", () => {
  const r = decodeResistor5Band("brown", "black", "black", "red", "brown");
  assert.equal(r.ppmPerC, undefined);
});

test("formatResistance scales through the unit prefixes", () => {
  assert.equal(formatResistance(4.7), "4.7 Ω");
  assert.equal(formatResistance(4700), "4.7 kΩ");
  assert.equal(formatResistance(4700000), "4.7 MΩ");
  assert.equal(formatResistance(4.7e9), "4.7 GΩ");
});

test("Ohm's law: 12V across 4R gives 3A and 36W", () => {
  const { v, i, r, p } = solveOhmsLaw({ v: 12, r: 4 });
  assert.equal(v, 12);
  assert.equal(i, 3);
  assert.equal(r, 4);
  assert.equal(p, 36);
});

test("Ohm's law: solving from current and power", () => {
  const { v, i, r, p } = solveOhmsLaw({ i: 2, p: 20 });
  assert.equal(v, 10);
  assert.equal(r, 5);
  assert.equal(i, 2);
  assert.equal(p, 20);
});

test("Ohm's law: solving from resistance and power", () => {
  const { v, i, r, p } = solveOhmsLaw({ r: 100, p: 4 });
  assert.equal(v, 20);
  assert.equal(i, 0.2);
  assert.equal(r, 100);
  assert.equal(p, 4);
});

test("Ohm's law: solving from voltage and power", () => {
  const { v, i, r, p } = solveOhmsLaw({ v: 5, p: 10 });
  assert.equal(i, 2);
  assert.equal(r, 2.5);
});

test("Ohm's law rejects anything but exactly two knowns", () => {
  assert.throws(() => solveOhmsLaw({ v: 12 }), /exactly two/);
  assert.throws(() => solveOhmsLaw({ v: 12, i: 1, r: 12 }), /exactly two/);
});

test("Ohm's law rejects a zero divisor that yields a non-finite result", () => {
  assert.throws(() => solveOhmsLaw({ v: 12, i: 0 }), /finite resistance/);
});

test("LED resistor calculator returns resistance, dissipation, and a safety-rated wattage", () => {
  const result = calculateLedResistor({ supplyVoltage: 5, ledForwardVoltage: 2, targetCurrent: 0.02 });
  assert.deepEqual(result, { resistance: 150, power: 0.06, recommendedWattage: 0.25 });
});

test("LED resistor calculator rejects impossible or unsafe inputs", () => {
  assert.throws(() => calculateLedResistor({ supplyVoltage: 5, ledForwardVoltage: 5, targetCurrent: 0.02 }), /lower/);
  assert.throws(() => calculateLedResistor({ supplyVoltage: 5, ledForwardVoltage: 2, targetCurrent: 0 }), /positive/);
});
