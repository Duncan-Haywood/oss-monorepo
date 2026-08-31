import test from "node:test";
import assert from "node:assert/strict";

import {
  calculateAstable,
  designAstable,
  calculateMonostable,
  designMonostable,
  nearestStandardResistor,
  formatResistance,
  formatCapacitance,
  formatTime,
  formatFrequency,
  MIN_R1_OHMS,
} from "./calc.mjs";

const close = (actual, expected, tolerance = 1e-6) =>
  assert.ok(
    Math.abs(actual - expected) <= tolerance * Math.max(1, Math.abs(expected)),
    `expected ${actual} to be within ${tolerance} of ${expected}`,
  );

test("astable matches the datasheet's worked 1 kHz example", () => {
  // The classic NE555 astable: R1 = 4.7 kΩ, R2 = 4.7 kΩ, C = 100 nF.
  const r = calculateAstable({ r1: 4700, r2: 4700, capacitanceFarads: 100e-9 });
  close(r.highSeconds, Math.LN2 * 9400 * 100e-9);
  close(r.lowSeconds, Math.LN2 * 4700 * 100e-9);
  close(r.frequencyHz, 1 / (Math.LN2 * (4700 + 2 * 4700) * 100e-9));
  close(r.dutyCyclePercent, (9400 / 14100) * 100);
});

test("astable duty cycle is always above 50% in the standard configuration", () => {
  // R2 huge relative to R1 is the closest a standard astable gets to 50%.
  const r = calculateAstable({ r1: 1000, r2: 10e6, capacitanceFarads: 1e-9 });
  assert.ok(r.dutyCyclePercent > 50, "duty must exceed 50%");
  assert.ok(r.dutyCyclePercent < 50.01, "with R2 >> R1 the duty should approach 50%");
});

test("astable period is the sum of the high and low times", () => {
  const r = calculateAstable({ r1: 10000, r2: 22000, capacitanceFarads: 470e-9 });
  close(r.periodSeconds, r.highSeconds + r.lowSeconds);
  close(r.frequencyHz, 1 / r.periodSeconds);
});

test("astable rejects non-positive components", () => {
  for (const bad of [
    { r1: 0, r2: 1000, capacitanceFarads: 1e-6 },
    { r1: 1000, r2: -1, capacitanceFarads: 1e-6 },
    { r1: 1000, r2: 1000, capacitanceFarads: 0 },
    { r1: Number.NaN, r2: 1000, capacitanceFarads: 1e-6 },
  ]) {
    assert.throws(() => calculateAstable(bad));
  }
});

test("astable flags an R1 below the practical discharge-pin minimum", () => {
  const r = calculateAstable({ r1: 100, r2: 10000, capacitanceFarads: 100e-9 });
  const error = r.notes.find((n) => n.severity === "error");
  assert.ok(error, "expected an error-severity note for a too-small R1");
  assert.match(error.message, /discharge/i);
});

test("astable flags a discharge current above the pin's sink rating", () => {
  // R1 is above the 1 kΩ floor, so only the supply-dependent check can fire.
  const r = calculateAstable({ r1: 1000, r2: 10000, capacitanceFarads: 100e-9, supplyVolts: 400 });
  assert.ok(r.notes.some((n) => n.severity === "error" && /mA/.test(n.message)));
});

test("discharge current includes both R1's supply-side draw and R2's capacitor-side draw", () => {
  // R1 = 1 kΩ sits right at the practical minimum (no separate "R1 too low"
  // error), and R2 = 50 Ω is small enough that its own contribution alone
  // pushes the discharge pin over its 200 mA limit: 15/1000 + (2/3*15)/50 =
  // 0.015 + 0.2 = 0.215 A. A formula that only looked at R1 (15/1000 = 15 mA,
  // or worse, (2/3*15)/1000 = 10 mA) would report this component pair as
  // safe when the real current is 15 mA over the chip's absolute maximum.
  const r = calculateAstable({ r1: 1000, r2: 50, capacitanceFarads: 1e-6, supplyVolts: 15 });
  const overCurrent = r.notes.find((n) => n.severity === "error" && /mA/.test(n.message));
  assert.ok(overCurrent, "expected an over-current error when R2 alone pushes past the sink limit");
  assert.match(overCurrent.message, /215/);
});

test("discharge current is the full supply across R1, not the capacitor voltage", () => {
  // R1 = 30 Ω, R2 = 10 kΩ (R2 negligible), 15 V supply: the discharge
  // transistor pulls pin 7 to ~0 V, so R1 sees the *full* supply, not the
  // capacitor's 2/3 Vcc — 15/30 = 0.5 A, plus a negligible ~1 mA from R2.
  const r = calculateAstable({ r1: 30, r2: 10000, capacitanceFarads: 1e-6, supplyVolts: 15 });
  const overCurrent = r.notes.find((n) => n.severity === "error" && /mA/.test(n.message));
  assert.ok(overCurrent);
  assert.match(overCurrent.message, /501/);
});

test("astable does not run the discharge-current check without a supply voltage", () => {
  const r = calculateAstable({ r1: MIN_R1_OHMS, r2: 10000, capacitanceFarads: 100e-9 });
  assert.equal(r.notes.filter((n) => n.severity === "error").length, 0);
});

test("astable warns when the timing resistors get large enough to drift", () => {
  const r = calculateAstable({ r1: 1e6, r2: 1e6, capacitanceFarads: 1e-9 });
  assert.ok(r.notes.some((n) => n.severity === "warning" && /leakage/i.test(n.message)));
});

test("astable warns that a microfarad-scale timing cap is an electrolytic", () => {
  const r = calculateAstable({ r1: 10000, r2: 10000, capacitanceFarads: 10e-6 });
  assert.ok(r.notes.some((n) => /electrolytic/i.test(n.message)));
});

test("designAstable round-trips through calculateAstable", () => {
  const target = { frequencyHz: 1000, dutyCyclePercent: 60, capacitanceFarads: 100e-9 };
  const d = designAstable(target);
  // The exact (unrounded) resistors must reproduce the requested target.
  const exact = calculateAstable({
    r1: d.exactR1,
    r2: d.exactR2,
    capacitanceFarads: target.capacitanceFarads,
  });
  close(exact.frequencyHz, target.frequencyHz, 1e-6);
  close(exact.dutyCyclePercent, target.dutyCyclePercent, 1e-6);
});

test("designAstable reports what the buyable E24 pair really produces", () => {
  const d = designAstable({ frequencyHz: 1000, dutyCyclePercent: 60, capacitanceFarads: 100e-9 });
  const achieved = calculateAstable({
    r1: d.nearestR1,
    r2: d.nearestR2,
    capacitanceFarads: 100e-9,
  });
  close(d.achievedFrequencyHz, achieved.frequencyHz);
  close(d.achievedDutyCyclePercent, achieved.dutyCyclePercent);
  // E24 spacing is ~5%, so the achieved values should land close but not exact.
  assert.ok(Math.abs(d.frequencyErrorPercent) < 10);
  assert.ok(Math.abs(d.dutyErrorPercent) < 10);
});

test("designAstable refuses a duty cycle a standard astable cannot reach", () => {
  for (const duty of [50, 40, 0, 100, 120]) {
    assert.throws(
      () => designAstable({ frequencyHz: 1000, dutyCyclePercent: duty, capacitanceFarads: 100e-9 }),
      /duty cycle/i,
      `duty ${duty}% should be rejected`,
    );
  }
});

test("designAstable's rejection explains the diode workaround", () => {
  assert.throws(
    () => designAstable({ frequencyHz: 1000, dutyCyclePercent: 50, capacitanceFarads: 100e-9 }),
    /diode/i,
  );
});

test("designAstable rejects a non-positive frequency or capacitance", () => {
  assert.throws(() => designAstable({ frequencyHz: 0, dutyCyclePercent: 60, capacitanceFarads: 1e-7 }));
  assert.throws(() => designAstable({ frequencyHz: 100, dutyCyclePercent: 60, capacitanceFarads: 0 }));
});

test("designAstable carries the buildability warnings of the chosen parts", () => {
  // A high frequency with a large cap drives the resistors below 1 kΩ.
  const d = designAstable({ frequencyHz: 100000, dutyCyclePercent: 60, capacitanceFarads: 10e-6 });
  assert.ok(d.notes.some((n) => n.severity === "error"));
});

test("monostable matches ln(3)·R·C", () => {
  const r = calculateMonostable({ r: 100000, capacitanceFarads: 10e-6 });
  close(r.pulseSeconds, Math.log(3) * 100000 * 10e-6);
  // ~1.1 s — the standard "1.1 RC" rule of thumb.
  close(r.pulseSeconds, 1.0986, 1e-3);
});

test("monostable always notes the re-trigger constraint", () => {
  const r = calculateMonostable({ r: 100000, capacitanceFarads: 100e-9 });
  assert.ok(r.notes.some((n) => n.severity === "info" && /trigger/i.test(n.message)));
});

test("monostable flags a too-small R and a drift-prone large R", () => {
  assert.ok(
    calculateMonostable({ r: 100, capacitanceFarads: 1e-7 }).notes.some((n) => n.severity === "error"),
  );
  assert.ok(
    calculateMonostable({ r: 5e6, capacitanceFarads: 1e-9 }).notes.some(
      (n) => n.severity === "warning" && /leakage/i.test(n.message),
    ),
  );
});

test("monostable rejects non-positive components", () => {
  assert.throws(() => calculateMonostable({ r: 0, capacitanceFarads: 1e-6 }));
  assert.throws(() => calculateMonostable({ r: 1000, capacitanceFarads: -1 }));
});

test("designMonostable round-trips through calculateMonostable", () => {
  const d = designMonostable({ pulseSeconds: 1, capacitanceFarads: 10e-6 });
  close(Math.log(3) * d.exactR * 10e-6, 1, 1e-6);
  const achieved = calculateMonostable({ r: d.nearestR, capacitanceFarads: 10e-6 });
  close(d.achievedPulseSeconds, achieved.pulseSeconds);
  assert.ok(Math.abs(d.pulseErrorPercent) < 10, "E24 rounding should stay within ~5%");
});

test("nearestStandardResistor crosses decade boundaries", () => {
  assert.equal(nearestStandardResistor(9.6), 10);
  assert.equal(nearestStandardResistor(4700), 4700);
  assert.equal(nearestStandardResistor(4650), 4700);
  assert.equal(nearestStandardResistor(1.05e6), 1e6);
});

test("nearestStandardResistor rejects non-positive input", () => {
  assert.throws(() => nearestStandardResistor(0));
  assert.throws(() => nearestStandardResistor(Number.NaN));
});

test("formatters pick the prefix an engineer would write", () => {
  assert.equal(formatResistance(4700), "4.7 kΩ");
  assert.equal(formatResistance(1e6), "1 MΩ");
  assert.equal(formatResistance(470), "470 Ω");
  assert.equal(formatCapacitance(100e-9), "100 nF");
  assert.equal(formatCapacitance(10e-6), "10 µF");
  assert.equal(formatCapacitance(22e-12), "22 pF");
  assert.equal(formatTime(0.0015), "1.5 ms");
  assert.equal(formatTime(2), "2 s");
  assert.equal(formatTime(5e-6), "5 µs");
  assert.equal(formatFrequency(1000), "1 kHz");
  assert.equal(formatFrequency(2.5e6), "2.5 MHz");
  assert.equal(formatFrequency(50), "50 Hz");
});

test("formatters round to four significant figures, not to float precision", () => {
  // Rendering "1.02318797 kHz" would claim a precision ±5% resistors and
  // ±20% capacitors cannot deliver. Computation stays full precision.
  const r = calculateAstable({ r1: 4700, r2: 4700, capacitanceFarads: 100e-9 });
  assert.equal(formatFrequency(r.frequencyHz), "1.023 kHz");
  assert.equal(formatTime(r.periodSeconds), "977.3 µs");
  assert.ok(r.frequencyHz.toString().length > "1023".length, "raw value keeps its precision");
  assert.equal(formatResistance(3333.3333), "3.333 kΩ");
});

test("formatters return a dash rather than NaN for invalid input", () => {
  assert.equal(formatResistance(Number.NaN), "—");
  assert.equal(formatCapacitance(0), "—");
  assert.equal(formatTime(-1), "—");
  assert.equal(formatFrequency(0), "—");
});
