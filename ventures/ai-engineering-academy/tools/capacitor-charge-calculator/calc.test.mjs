import test from "node:test";
import assert from "node:assert/strict";
import { componentForTime, timeToThreshold, voltageAtTime } from "./calc.mjs";

test("charges to 63.2% in one time constant", () => {
  const result = timeToThreshold({ resistanceOhms: 10000, capacitanceFarads: 100e-9, thresholdFraction: 1 - Math.exp(-1) });
  assert.ok(Math.abs(result.timeSeconds - 0.001) < 1e-9);
});

test("discharge time to 10% is 2.303 time constants", () => {
  const result = timeToThreshold({ resistanceOhms: 1000, capacitanceFarads: 1e-6, thresholdFraction: 0.1, mode: "discharge" });
  assert.ok(Math.abs(result.timeSeconds - 0.002302585) < 1e-9);
});

test("voltage at time returns the expected fraction", () => {
  const result = voltageAtTime({ resistanceOhms: 1, capacitanceFarads: 1, timeSeconds: 1 });
  assert.ok(Math.abs(result.fraction - (1 - Math.exp(-1))) < 1e-12);
});

test("reverse design solves capacitance", () => {
  const result = componentForTime({ targetTimeSeconds: 0.001, thresholdFraction: 1 - Math.exp(-1), mode: "charge", solveFor: "capacitance", resistanceOhms: 10000 });
  assert.ok(Math.abs(result.exactValue - 100e-9) < 1e-15);
});

test("rejects impossible threshold", () => {
  assert.throws(() => timeToThreshold({ resistanceOhms: 1, capacitanceFarads: 1, thresholdFraction: 1 }));
});
