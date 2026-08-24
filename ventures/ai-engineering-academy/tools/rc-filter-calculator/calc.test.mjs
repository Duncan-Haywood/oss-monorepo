import test from "node:test";
import assert from "node:assert/strict";

import {
  cutoffFrequency,
  timeConstant,
  filterResponse,
  designForCutoff,
  nearestStandardResistor,
  nearestStandardCapacitor,
  formatResistance,
  formatCapacitance,
  formatFrequency,
  formatTimeConstant,
  E24_BASE,
  E6_BASE,
} from "./calc.mjs";

// A textbook pairing: 1 kΩ with 159.155 nF lands almost exactly on 1 kHz.
// Most cases below use 1 kΩ / 100 nF, whose corner is 1591.549... Hz.
const R = 1000;
const C = 100e-9;

function close(actual, expected, tolerance = 1e-6) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `expected ${actual} to be within ${tolerance} of ${expected}`,
  );
}

test("cutoff frequency follows 1 / (2*pi*R*C)", () => {
  close(cutoffFrequency({ r: R, c: C }), 1 / (2 * Math.PI * R * C), 1e-4);
  // 1 kΩ + 1 µF is the classic ~159.15 Hz corner.
  close(cutoffFrequency({ r: 1000, c: 1e-6 }), 159.1549431, 1e-4);
});

test("cutoff frequency is the same for both filter arrangements", () => {
  const low = filterResponse({ r: R, c: C, frequency: 100, type: "low-pass" });
  const high = filterResponse({ r: R, c: C, frequency: 100, type: "high-pass" });
  assert.equal(low.cutoffHz, high.cutoffHz);
});

test("time constant is R*C and matches the corner frequency", () => {
  close(timeConstant({ r: R, c: C }), 1e-4, 1e-12);
  const tau = timeConstant({ r: R, c: C });
  close(cutoffFrequency({ r: R, c: C }), 1 / (2 * Math.PI * tau), 1e-4);
});

test("rejects non-positive or non-finite R and C", () => {
  for (const bad of [0, -1, NaN, Infinity]) {
    assert.throws(() => cutoffFrequency({ r: bad, c: C }));
    assert.throws(() => cutoffFrequency({ r: R, c: bad }));
  }
});

// The headline correction this tool exists to make: at the corner frequency
// a first-order filter is NOT "cut off" — it still passes ~70.7% of the
// amplitude and has already rotated the phase by 45 degrees.
test("at the cutoff frequency the gain is -3.01 dB, not zero", () => {
  const fc = cutoffFrequency({ r: R, c: C });
  const res = filterResponse({ r: R, c: C, frequency: fc, type: "low-pass" });
  close(res.gainRatio, 1 / Math.SQRT2, 1e-6);
  close(res.gainDb, -3.0103, 1e-3);
  close(res.attenuationPercent, 29.2893, 1e-3);
});

test("at the cutoff frequency the phase shift is already 45 degrees", () => {
  const fc = cutoffFrequency({ r: R, c: C });
  close(filterResponse({ r: R, c: C, frequency: fc, type: "low-pass" }).phaseDegrees, -45, 1e-6);
  close(filterResponse({ r: R, c: C, frequency: fc, type: "high-pass" }).phaseDegrees, 45, 1e-6);
});

test("a low-pass passes DC unchanged and rolls off far above the corner", () => {
  const dc = filterResponse({ r: R, c: C, frequency: 0, type: "low-pass" });
  close(dc.gainRatio, 1, 1e-9);
  close(dc.gainDb, 0, 1e-9);
  close(dc.phaseDegrees, 0, 1e-9);

  const fc = cutoffFrequency({ r: R, c: C });
  // Two decades above the corner: -40 dB, and phase approaching -90.
  const far = filterResponse({ r: R, c: C, frequency: fc * 100, type: "low-pass" });
  close(far.gainDb, -40, 0.01);
  assert.ok(far.phaseDegrees < -89 && far.phaseDegrees > -90);
});

test("a high-pass blocks DC completely", () => {
  const dc = filterResponse({ r: R, c: C, frequency: 0, type: "high-pass" });
  assert.equal(dc.gainRatio, 0);
  assert.equal(dc.gainDb, -Infinity);
  close(dc.phaseDegrees, 90, 1e-9);
});

test("roll-off settles at 20 dB per decade well past the corner", () => {
  const fc = cutoffFrequency({ r: R, c: C });
  const oneDecade = filterResponse({ r: R, c: C, frequency: fc * 10, type: "low-pass" });
  const twoDecades = filterResponse({ r: R, c: C, frequency: fc * 100, type: "low-pass" });
  // 20 dB/decade is the asymptote, not an identity: the first decade past
  // the corner still carries the +1 term and comes in at -19.96 dB. The
  // tolerance here is what that approach actually looks like, and the
  // decade further out below shows it tightening.
  close(twoDecades.gainDb - oneDecade.gainDb, -20, 0.05);
  const threeDecades = filterResponse({ r: R, c: C, frequency: fc * 1000, type: "low-pass" });
  close(threeDecades.gainDb - twoDecades.gainDb, -20, 0.001);
  close(oneDecade.decadesFromCutoff, 1, 1e-6);
  close(twoDecades.decadesFromCutoff, 2, 1e-6);
});

test("low-pass and high-pass powers sum to one at every frequency", () => {
  // |H_lp|^2 + |H_hp|^2 == 1 for a first-order pair — a good structural
  // check that the two branches share one transfer function.
  for (const frequency of [10, 500, 1591.549, 20000]) {
    const lp = filterResponse({ r: R, c: C, frequency, type: "low-pass" });
    const hp = filterResponse({ r: R, c: C, frequency, type: "high-pass" });
    close(lp.gainRatio ** 2 + hp.gainRatio ** 2, 1, 1e-6);
  }
});

test("rejects an unknown filter type and a negative frequency", () => {
  assert.throws(() => filterResponse({ r: R, c: C, frequency: 100, type: "band-pass" }));
  assert.throws(() => filterResponse({ r: R, c: C, frequency: -1, type: "low-pass" }));
});

test("designForCutoff solves for R and reports what the buyable part gives", () => {
  const d = designForCutoff({ targetHz: 1000, c: 100e-9 });
  close(d.exactR, 1 / (2 * Math.PI * 1000 * 100e-9), 1e-3);
  assert.ok(E24_BASE.some((b) => Math.abs(d.nearestR / 10 ** Math.floor(Math.log10(d.nearestR)) - b) < 1e-9));
  // The rounded resistor is what the built circuit has, so its corner must
  // be the one reported back, and the error must be consistent with it.
  close(d.actualHz, cutoffFrequency({ r: d.nearestR, c: 100e-9 }), 1e-6);
  close(d.errorPercent, ((d.actualHz - 1000) / 1000) * 100, 1e-6);
  assert.ok(Math.abs(d.errorPercent) < 5, "E24 should land within a few percent");
});

test("designForCutoff rejects impossible targets", () => {
  assert.throws(() => designForCutoff({ targetHz: 0, c: 100e-9 }));
  assert.throws(() => designForCutoff({ targetHz: 1000, c: -1 }));
});

test("nearest standard values snap across decade boundaries", () => {
  assert.equal(nearestStandardResistor(9.6), 10);
  assert.equal(nearestStandardResistor(1000), 1000);
  assert.equal(nearestStandardResistor(4600), 4700);
  assert.equal(nearestStandardCapacitor(1e-7), 1e-7);
  assert.ok(E6_BASE.includes(2.2));
  for (const bad of [0, -5, NaN]) {
    assert.throws(() => nearestStandardResistor(bad));
    assert.throws(() => nearestStandardCapacitor(bad));
  }
});

test("formatters use the prefixes a datasheet would", () => {
  assert.equal(formatResistance(1000), "1 kΩ");
  assert.equal(formatResistance(2200000), "2.2 MΩ");
  assert.equal(formatResistance(470), "470 Ω");
  assert.equal(formatCapacitance(1e-6), "1 µF");
  assert.equal(formatCapacitance(100e-9), "100 nF");
  assert.equal(formatCapacitance(22e-12), "22 pF");
  assert.equal(formatFrequency(1591.549431), "1.592 kHz");
  assert.equal(formatFrequency(159.1549431), "159.2 Hz");
  assert.equal(formatFrequency(20000), "20 kHz");
  assert.equal(formatFrequency(1.5e6), "1.5 MHz");
  assert.equal(formatTimeConstant(1e-4), "100 µs");
  assert.equal(formatTimeConstant(1e-2), "10 ms");
  assert.equal(formatTimeConstant(1e-9), "1 ns");
  assert.equal(formatTimeConstant(5e-10), "500 ps");
  assert.equal(formatTimeConstant(2), "2 s");
  assert.equal(formatResistance(-1), "—");
  assert.equal(formatCapacitance(NaN), "—");
  assert.equal(formatTimeConstant(-1), "—");
});
