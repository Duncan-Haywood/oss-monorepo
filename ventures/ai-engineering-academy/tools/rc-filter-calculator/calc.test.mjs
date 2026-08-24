import test from "node:test";
import assert from "node:assert/strict";
import {
  toSignificant,
  formatResistance,
  formatFrequency,
  formatCapacitance,
  formatInductance,
  formatTime,
  nearestPreferred,
  cutoffFromComponents,
  designForCutoff,
  describeFilter,
  E24_BASE,
  E12_BASE,
} from "./calc.mjs";

test("toSignificant keeps the requested number of significant figures", () => {
  assert.equal(toSignificant(12345, 3), 12300);
  assert.equal(toSignificant(0.0012345, 2), 0.0012);
  assert.equal(toSignificant(0, 4), 0);
});

test("formatFrequency picks the right unit prefix", () => {
  assert.equal(formatFrequency(50), "50 Hz");
  assert.equal(formatFrequency(1000), "1 kHz");
  assert.equal(formatFrequency(1_590_000), "1.59 MHz");
  assert.equal(formatFrequency(2.4e9), "2.4 GHz");
});

test("formatCapacitance spans pF to F", () => {
  assert.equal(formatCapacitance(1e-12), "1 pF");
  assert.equal(formatCapacitance(1e-9), "1 nF");
  assert.equal(formatCapacitance(1e-7), "100 nF");
  assert.equal(formatCapacitance(1e-6), "1 µF");
  assert.equal(formatCapacitance(4.7e-6), "4.7 µF");
});

test("formatInductance spans nH to H", () => {
  assert.equal(formatInductance(1e-9), "1 nH");
  assert.equal(formatInductance(1e-3), "1 mH");
  assert.equal(formatInductance(0.47), "470 mH");
});

test("formatResistance and formatTime pick sensible prefixes", () => {
  assert.equal(formatResistance(4700), "4.7 kΩ");
  assert.equal(formatResistance(1_000_000), "1 MΩ");
  assert.equal(formatTime(0.001), "1 ms");
  assert.equal(formatTime(1.6e-4), "160 µs");
});

test("negative or non-finite values format as em-dash", () => {
  assert.equal(formatFrequency(-1), "—");
  assert.equal(formatCapacitance(NaN), "—");
  assert.equal(formatResistance(Infinity), "—");
});

test("nearestPreferred snaps to the closer E24 value across decades", () => {
  assert.equal(nearestPreferred(9.6), 10); // crosses a decade boundary
  assert.equal(nearestPreferred(300), 300); // exact value stays
  assert.equal(nearestPreferred(10_500), 10_000); // 10k is closer than 11k
});

test("nearestPreferred works on sub-unit component values (capacitors)", () => {
  // ~10 nF exact should snap to a stocked E12 value near it.
  assert.equal(nearestPreferred(1.05e-8, E12_BASE), 1e-8);
  assert.equal(nearestPreferred(4.6e-6, E12_BASE), 4.7e-6);
});

test("nearestPreferred rejects non-positive input", () => {
  assert.throws(() => nearestPreferred(0), /positive/);
  assert.throws(() => nearestPreferred(-1), /positive/);
});

test("every E24 base value maps to itself at the 1x decade", () => {
  for (const base of E24_BASE) {
    assert.equal(nearestPreferred(base * 1000), toSignificant(base * 1000, 6));
  }
});

test("RC cutoff matches the textbook 1/(2piRC)", () => {
  // 10 kΩ, 100 nF -> f_c ≈ 159.15 Hz, τ = 1 ms
  const r = cutoffFromComponents({
    type: "rc-lowpass",
    resistanceOhms: 10_000,
    capacitanceFarads: 100e-9,
  });
  assert.ok(Math.abs(r.cutoffHz - 159.154943) < 1e-3);
  assert.ok(Math.abs(r.timeConstantSeconds - 1e-3) < 1e-12);
  assert.ok(Math.abs(r.angularCutoffRadPerSec - 1000) < 1e-6);
});

test("RC low-pass and high-pass give the same cutoff (topology only labels it)", () => {
  const shared = { resistanceOhms: 1000, capacitanceFarads: 1e-6 };
  const lp = cutoffFromComponents({ type: "rc-lowpass", ...shared });
  const hp = cutoffFromComponents({ type: "rc-highpass", ...shared });
  assert.equal(lp.cutoffHz, hp.cutoffHz);
  assert.equal(lp.timeConstantSeconds, hp.timeConstantSeconds);
});

test("RL cutoff matches R/(2piL)", () => {
  // 1 kΩ, 10 mH -> f_c ≈ 15915.49 Hz, τ = 10 µs
  const r = cutoffFromComponents({
    type: "rl-lowpass",
    resistanceOhms: 1000,
    inductanceHenries: 10e-3,
  });
  assert.ok(Math.abs(r.cutoffHz - 15915.4943) < 1e-1);
  assert.ok(Math.abs(r.timeConstantSeconds - 1e-5) < 1e-12);
});

test("cutoffFromComponents validates inputs", () => {
  assert.throws(() => cutoffFromComponents({ type: "bogus", resistanceOhms: 1, capacitanceFarads: 1 }), /Unknown filter type/);
  assert.throws(() => cutoffFromComponents({ type: "rc-lowpass", resistanceOhms: 0, capacitanceFarads: 1e-6 }), /Resistance/);
  assert.throws(() => cutoffFromComponents({ type: "rc-lowpass", resistanceOhms: 1000, capacitanceFarads: -1 }), /Capacitance/);
  assert.throws(() => cutoffFromComponents({ type: "rl-lowpass", resistanceOhms: 1000, inductanceHenries: 0 }), /Inductance/);
});

test("design mode solves for capacitance given R and a target cutoff", () => {
  // Target 1 kHz with a 10 kΩ resistor -> C = 1/(2π·1000·10000) ≈ 15.9 nF.
  const d = designForCutoff({
    type: "rc-lowpass",
    targetCutoffHz: 1000,
    solveFor: "capacitance",
    resistanceOhms: 10_000,
  });
  assert.equal(d.componentLabel, "capacitance");
  assert.ok(Math.abs(d.exactValue - 1.59154943e-8) < 1e-12);
  // Snaps to a stocked E12 capacitor and reports the real resulting cutoff.
  assert.ok(d.snappedValue > 0);
  assert.ok(Number.isFinite(d.achievedCutoffHz));
  // The snapped cutoff should be within one E12 step (~20%) of target.
  assert.ok(Math.abs(d.cutoffErrorPercent) < 20);
});

test("design mode solves for resistance given C and a target cutoff", () => {
  // Target 159.15 Hz with 100 nF -> R ≈ 10 kΩ exactly, snaps to 10 kΩ.
  const d = designForCutoff({
    type: "rc-highpass",
    targetCutoffHz: 159.154943,
    solveFor: "resistance",
    capacitanceFarads: 100e-9,
  });
  assert.equal(d.componentLabel, "resistance");
  assert.ok(Math.abs(d.exactValue - 10_000) < 1);
  assert.equal(d.snappedValue, 10_000);
  assert.ok(Math.abs(d.cutoffErrorPercent) < 0.1);
});

test("design mode solves for inductance in an RL filter", () => {
  // Target 15915.49 Hz with 1 kΩ -> L = R/(2πf) = 10 mH.
  const d = designForCutoff({
    type: "rl-lowpass",
    targetCutoffHz: 15915.4943,
    solveFor: "inductance",
    resistanceOhms: 1000,
  });
  assert.equal(d.componentLabel, "inductance");
  assert.ok(Math.abs(d.exactValue - 10e-3) < 1e-6);
});

test("design mode round-trips: snapped component reproduces its own cutoff", () => {
  const d = designForCutoff({
    type: "rc-lowpass",
    targetCutoffHz: 500,
    solveFor: "resistance",
    capacitanceFarads: 47e-9,
  });
  const check = cutoffFromComponents({
    type: "rc-lowpass",
    resistanceOhms: d.snappedValue,
    capacitanceFarads: 47e-9,
  });
  assert.equal(check.cutoffHz, d.achievedCutoffHz);
});

test("design mode validates the target and known component", () => {
  assert.throws(() => designForCutoff({ type: "rc-lowpass", targetCutoffHz: 0, solveFor: "capacitance", resistanceOhms: 1000 }), /Target cutoff/);
  assert.throws(() => designForCutoff({ type: "rc-lowpass", targetCutoffHz: 1000, solveFor: "capacitance", resistanceOhms: -1 }), /Resistance/);
  assert.throws(() => designForCutoff({ type: "rc-lowpass", targetCutoffHz: 1000, solveFor: "inductance", resistanceOhms: 1000 }), /solve for/);
});

test("describeFilter returns distinct copy per topology and rejects unknowns", () => {
  const types = ["rc-lowpass", "rc-highpass", "rl-lowpass", "rl-highpass"];
  const descriptions = types.map(describeFilter);
  assert.equal(new Set(descriptions).size, 4);
  for (const d of descriptions) assert.match(d, /−20 dB\/decade/);
  assert.throws(() => describeFilter("nope"), /Unknown filter type/);
});
