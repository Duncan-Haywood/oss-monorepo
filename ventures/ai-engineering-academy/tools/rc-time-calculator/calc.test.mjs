import test from "node:test";
import assert from "node:assert/strict";
import { timeFromComponents, designForTime, voltageAtTime, nearestPreferred, formatTime, formatCapacitance } from "./calc.mjs";

test("charges to 63.2% in one time constant", () => {
  const r = timeFromComponents({ mode: "charge", resistanceOhms: 10_000, capacitanceFarads: 100e-9, supplyVolts: 5, thresholdVolts: 5 * 0.6321205588 });
  assert.ok(Math.abs(r.timeSeconds - 0.001) < 1e-9);
  assert.equal(r.timeConstantSeconds, 0.001);
});

test("discharge timing uses the initial voltage, not supply voltage", () => {
  const r = timeFromComponents({ mode: "discharge", resistanceOhms: 1_000_000, capacitanceFarads: 1e-6, supplyVolts: 12, initialVolts: 9, thresholdVolts: 9 * Math.exp(-2) });
  assert.ok(Math.abs(r.timeSeconds - 2) < 1e-8);
});

test("design mode finds a buyable resistor and reports its real timing", () => {
  const d = designForTime({ mode: "charge", targetTimeSeconds: 0.001, solveFor: "resistance", capacitanceFarads: 100e-9, supplyVolts: 5, thresholdVolts: 5 * 0.6321205588 });
  assert.equal(d.componentLabel, "resistance");
  assert.equal(d.snappedValue, 10_000);
  assert.ok(Math.abs(d.achievedTimeSeconds - 0.001) < 1e-8);
});

test("design mode finds a preferred capacitor", () => {
  const d = designForTime({ mode: "discharge", targetTimeSeconds: 0.002, solveFor: "capacitance", resistanceOhms: 10_000, supplyVolts: 5, initialVolts: 5, thresholdVolts: 5 * Math.exp(-1) });
  assert.equal(d.snappedValue, 180e-9);
  assert.ok(Number.isFinite(d.achievedTimeSeconds));
});

test("preferred values cross decades and formatters stay readable", () => {
  assert.equal(nearestPreferred(9.6), 10);
  assert.equal(formatTime(0.0016), "1.6 ms");
  assert.equal(formatCapacitance(100e-9), "100 nF");
});

test("voltage at one time constant is 63.2% of supply on charge", () => {
  const r = voltageAtTime({ mode: "charge", resistanceOhms: 1, capacitanceFarads: 1, supplyVolts: 5, timeSeconds: 1 });
  assert.ok(Math.abs(r.fractionOfSupply - (1 - Math.exp(-1))) < 1e-8);
  assert.ok(Math.abs(r.volts - 5 * (1 - Math.exp(-1))) < 1e-6);
});

test("voltage at time on discharge uses the initial voltage", () => {
  const r = voltageAtTime({ mode: "discharge", resistanceOhms: 1_000, capacitanceFarads: 1e-6, supplyVolts: 12, initialVolts: 9, timeSeconds: 0.002 });
  assert.ok(Math.abs(r.volts - 9 * Math.exp(-2)) < 1e-8);
});

test("voltage at time rejects a negative delay", () => {
  assert.throws(() => voltageAtTime({ mode: "charge", resistanceOhms: 1, capacitanceFarads: 1, supplyVolts: 5, timeSeconds: -1 }), /Time/);
});

test("invalid thresholds are rejected", () => {
  assert.throws(() => timeFromComponents({ mode: "charge", resistanceOhms: 1, capacitanceFarads: 1, supplyVolts: 5, thresholdVolts: 5 }), /below/);
  assert.throws(() => timeFromComponents({ mode: "discharge", resistanceOhms: 1, capacitanceFarads: 1, supplyVolts: 5, initialVolts: 5, thresholdVolts: 5 }), /below/);
});
