import test from "node:test";
import assert from "node:assert/strict";
import {
  formatResistance,
  nearestStandardResistor,
  calculateVoltageDivider,
  suggestDividerForTarget,
  designDividerForLoad,
  E24_BASE,
} from "./calc.mjs";

test("formatResistance picks the right unit prefix", () => {
  assert.equal(formatResistance(220), "220 Ω");
  assert.equal(formatResistance(10000), "10 kΩ");
  assert.equal(formatResistance(0), "0 Ω");
});

test("nearestStandardResistor snaps to the closer E24 value, including across a decade boundary", () => {
  assert.equal(nearestStandardResistor(300), 300);
  assert.equal(nearestStandardResistor(9.6), 10);
});

test("every E24 base value maps to itself at the 1x decade", () => {
  for (const base of E24_BASE) {
    const expected = Math.round(base * 1000 * 1e6) / 1e6;
    assert.equal(nearestStandardResistor(base * 1000), expected);
  }
});

test("classic equal-resistor divider halves the voltage", () => {
  // 12V, R1=R2=10k -> Vout = 6V exactly, 0.6mA through the divider
  const r = calculateVoltageDivider({ vin: 12, r1: 10000, r2: 10000 });
  assert.equal(r.unloadedVout, 6);
  assert.ok(Math.abs(r.unloadedCurrentAmps - 0.0006) < 1e-9);
  assert.ok(Math.abs(r.unloadedR1PowerWatts - 0.0036) < 1e-9);
  assert.ok(Math.abs(r.unloadedR2PowerWatts - 0.0036) < 1e-9);
  // no load given -> loaded fields stay null
  assert.equal(r.loadedVout, null);
  assert.equal(r.loadDropPercent, null);
});

test("unequal-resistor divider matches the textbook ratio", () => {
  // 9V, R1=2k, R2=1k -> Vout = 9 * 1/3 = 3V
  const r = calculateVoltageDivider({ vin: 9, r1: 2000, r2: 1000 });
  assert.ok(Math.abs(r.unloadedVout - 3) < 1e-9);
});

test("a load resistance pulls the output below the unloaded value", () => {
  // 5V, R1=R2=1k, load=1k -> effective R2 = 500, Vout = 5*500/1500 = 1.6667V
  const r = calculateVoltageDivider({ vin: 5, r1: 1000, r2: 1000, loadOhms: 1000 });
  assert.ok(Math.abs(r.unloadedVout - 2.5) < 1e-9);
  assert.ok(Math.abs(r.loadedVout - 5 / 3) < 1e-6);
  // ~33.3% drop from the unloaded value
  assert.ok(Math.abs(r.loadDropPercent - 33.333333) < 1e-3);
  assert.ok(r.loadCurrentAmps > 0);
  assert.ok(r.r1PowerWatts > 0);
  assert.ok(r.r2PowerWatts > 0);
  assert.ok(r.loadPowerWatts > 0);
});

test("a very light load (load >> R2) barely moves the output", () => {
  // 10V, R1=R2=1k, a 1M load should look nearly unloaded
  const r = calculateVoltageDivider({ vin: 10, r1: 1000, r2: 1000, loadOhms: 1_000_000 });
  assert.ok(Math.abs(r.loadedVout - r.unloadedVout) < 0.02);
  assert.ok(r.loadDropPercent < 1);
});

test("rejects invalid divider inputs", () => {
  assert.throws(() => calculateVoltageDivider({ vin: 0, r1: 1000, r2: 1000 }), /Input voltage/);
  assert.throws(() => calculateVoltageDivider({ vin: 5, r1: -1, r2: 1000 }), /R1/);
  assert.throws(() => calculateVoltageDivider({ vin: 5, r1: 1000, r2: 0 }), /R2/);
  assert.throws(
    () => calculateVoltageDivider({ vin: 5, r1: 1000, r2: 1000, loadOhms: 0 }),
    /Load resistance/,
  );
});

test("suggestDividerForTarget finds R2 and snaps it to a buyable value", () => {
  // 12V supply down to 3.3V logic level, R1 fixed at 10k
  const s = suggestDividerForTarget({ vin: 12, targetVout: 3.3, r1: 10000 });
  // exact R2 = 10000 * 3.3 / 8.7 ~= 3793.1
  assert.ok(Math.abs(s.exactR2 - 3793.103448) < 1e-3);
  assert.equal(s.nearestR2, 3900);
  assert.ok(Math.abs(s.actualVout - 3.3669) < 1e-3);
  assert.ok(Math.abs(s.errorPercent) < 5);
});

test("suggestDividerForTarget rejects a target at or above the supply", () => {
  assert.throws(
    () => suggestDividerForTarget({ vin: 5, targetVout: 5, r1: 10000 }),
    /less than the input voltage/,
  );
  assert.throws(
    () => suggestDividerForTarget({ vin: 5, targetVout: 6, r1: 10000 }),
    /less than the input voltage/,
  );
});

test("designDividerForLoad sizes the bleeder current as the given multiple of the load current", () => {
  // 5V -> 2.5V into a 1k load: load current at target = 2.5mA, so a 10x
  // bleeder multiple asks for 25mA of divider current.
  const d = designDividerForLoad({ vin: 5, targetVout: 2.5, loadOhms: 1000, bleederMultiple: 10 });
  assert.ok(Math.abs(d.bleederCurrentAmps - 0.025) < 1e-9);
  // Exact R1 = R2 = 2.5 / 0.025 = 100 ohms each (symmetric because target is
  // exactly half of vin here).
  assert.ok(Math.abs(d.exactR1 - 100) < 1e-6);
  assert.ok(Math.abs(d.exactR2 - 100) < 1e-6);
});

test("designDividerForLoad's achieved output comes from calculateVoltageDivider, not a second formula", () => {
  const d = designDividerForLoad({ vin: 12, targetVout: 3.3, loadOhms: 2000, bleederMultiple: 10 });
  const cross = calculateVoltageDivider({ vin: 12, r1: d.nearestR1, r2: d.nearestR2, loadOhms: 2000 });
  assert.deepEqual(d.achieved, cross);
});

test("designDividerForLoad's droop shrinks as the bleeder multiple grows", () => {
  const low = designDividerForLoad({ vin: 9, targetVout: 4.5, loadOhms: 1000, bleederMultiple: 3 });
  const high = designDividerForLoad({ vin: 9, targetVout: 4.5, loadOhms: 1000, bleederMultiple: 30 });
  assert.ok(Math.abs(high.achieved.loadDropPercent) < Math.abs(low.achieved.loadDropPercent));
});

test("designDividerForLoad warns when the load is too heavy for the chosen multiple", () => {
  // A low multiple against a genuinely heavy load should still droop a lot.
  const d = designDividerForLoad({ vin: 9, targetVout: 4.5, loadOhms: 1000, bleederMultiple: 1 });
  assert.ok(d.notes.some((n) => n.severity === "warning" && /pulls the output/i.test(n.message)));
});

test("designDividerForLoad warns about quiescent power at a high bleeder multiple", () => {
  const d = designDividerForLoad({ vin: 24, targetVout: 12, loadOhms: 100000, bleederMultiple: 1000 });
  assert.ok(d.notes.some((n) => n.severity === "warning" && /dissipates/i.test(n.message)));
});

test("designDividerForLoad rejects a target at or above the supply", () => {
  assert.throws(
    () => designDividerForLoad({ vin: 5, targetVout: 5, loadOhms: 1000 }),
    /less than the input voltage/,
  );
});

test("designDividerForLoad rejects non-positive inputs", () => {
  assert.throws(() => designDividerForLoad({ vin: 0, targetVout: 2.5, loadOhms: 1000 }));
  assert.throws(() => designDividerForLoad({ vin: 5, targetVout: 2.5, loadOhms: 0 }));
  assert.throws(() => designDividerForLoad({ vin: 5, targetVout: 2.5, loadOhms: 1000, bleederMultiple: 0 }));
});
