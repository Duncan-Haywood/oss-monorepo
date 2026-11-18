import { test } from "node:test";
import assert from "node:assert/strict";
import { analyze, resistancePerMetre, reportCsv, sampleInput, SIZES, DEFAULTS } from "./calc.mjs";

const close = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);

test("AWG areas follow the geometric series: 36 AWG is 0.005 in, 0000 is 0.46 in", () => {
  const a = SIZES.awg.find((s) => s.id === "4/0");
  const d = Math.sqrt((4 * a.areaMm2) / Math.PI);
  close(d, 0.46 * 25.4, 1e-9);
  // each 6 gauges roughly doubles the diameter, each 3 doubles the area
  const a10 = SIZES.awg.find((s) => s.id === "10").areaMm2;
  const a7 = (Math.PI / 4) * (0.127 * Math.pow(92, 29 / 39)) ** 2;
  close(a7 / a10, Math.pow(92, 6 / 39), 1e-9);
  close(SIZES.awg.find((s) => s.id === "250").areaMm2, 126.677, 1e-3);
});

test("resistance by hand: 12 AWG solid copper at 75 C", () => {
  const area = (Math.PI / 4) * (0.127 * Math.pow(92, 24 / 39)) ** 2; // 3.3088 mm2
  const hand = (1.7241e-8 * (1 + 0.00393 * 55)) / (area * 1e-6); // ohm per metre
  close(resistancePerMetre(area, "cu", 75, "solid"), hand, 1e-12);
  close(hand * 304.8, 1.9315, 1e-3); // ohm per 1000 ft
  close(resistancePerMetre(area, "cu", 75, "stranded"), hand * 1.02, 1e-12);
  // aluminium is about 1.64 times copper at 20 C
  close(resistancePerMetre(10, "al", 20, "solid") / resistancePerMetre(10, "cu", 20, "solid"), 2.8264 / 1.7241, 1e-9);
});

test("the example: 12 V DC, 30 A, 15 ft one way, 3 % target picks 4 AWG", () => {
  const a = analyze(sampleInput());
  assert.equal(a.recommended.label, "4 AWG");
  const six = a.rows.find((r) => r.id === "6");
  assert.equal(six.meets, false);
  // 4 AWG by hand: 2 x 30 A x 15 ft x R per ft
  const r4 = a.rows.find((r) => r.id === "4");
  close(r4.dropV, 2 * 30 * 15 * (r4.rPerUnit / 1000), 1e-9);
  close(r4.dropPct, (r4.dropV / 12) * 100, 1e-9);
  close(r4.lossW, 2 * 30 * 30 * (r4.rPerUnit / 1000) * 15, 1e-9);
  // max length scales inversely with drop: at 3 % it is 15 ft x 3 / drop %
  close(r4.maxLength, (15 * 3) / r4.dropPct, 1e-9);
  close(r4.maxAmps, (30 * 3) / r4.dropPct, 1e-9);
});

test("three-phase uses root 3 and the power-factor-weighted impedance", () => {
  const a = analyze({ system: "ac3", volts: "480", load: "100", length: "300", pf: "0.8", reactance: "0.05", size: "1/0" });
  const r = a.chosen;
  const R = r.rPerUnit / 1000, X = 0.05 / 1000;
  close(r.dropV, Math.sqrt(3) * 100 * 300 * (R * 0.8 + X * 0.6), 1e-9);
  close(r.lossW, 3 * 100 * 100 * R * 300, 1e-9);
});

test("watts become amps by system", () => {
  close(analyze({ load: "360", loadUnit: "W" }).input.amps, 30, 1e-12);
  close(analyze({ system: "ac1", volts: "240", load: "4800", loadUnit: "W", pf: "0.8" }).input.amps, 25, 1e-12);
  close(analyze({ system: "ac3", volts: "400", load: "10000", loadUnit: "W", pf: "1" }).input.amps, 10000 / (Math.sqrt(3) * 400), 1e-12);
  // DC ignores a typed power factor
  close(analyze({ load: "360", loadUnit: "W", pf: "0.5" }).input.amps, 30, 1e-12);
});

test("parallel sets divide the resistance; metres and metric sizes work", () => {
  const one = analyze({ system: "ac1", volts: "240", load: "200", length: "100", size: "4/0" });
  const two = analyze({ system: "ac1", volts: "240", load: "200", length: "100", size: "4/0", sets: "2" });
  close(two.chosen.dropV, one.chosen.dropV / 2, 1e-9);
  const m = analyze({ system: "ac1", volts: "230", load: "16", length: "30", lengthUnit: "m", sizeSystem: "mm2", size: "2.5" });
  const R = resistancePerMetre(2.5, "cu", 75, "stranded");
  close(m.chosen.dropV, 2 * 16 * 30 * R, 1e-9);
  close(m.chosen.rPerUnit, R * 1000, 1e-9);
  assert.equal(m.perUnitLabel, "ohm per km");
});

test("a resistance from the reader's table overrides the computed one for the chosen size", () => {
  const a = analyze({ size: "10", rOverride: "1.24" });
  assert.equal(a.chosen.override, true);
  close(a.chosen.dropV, 2 * 30 * 15 * 0.00124, 1e-12);
  assert.match(analyze({ rOverride: "1.24" }).error, /choose the size/);
});

test("an ampacity minimum floors the recommendation", () => {
  const a = analyze({ system: "ac1", volts: "240", load: "30", length: "10", minSize: "6" });
  assert.equal(a.recommended.label, "6 AWG");
  assert.ok(a.findings.some((f) => /Ampacity, not voltage drop/.test(f.title)));
});

test("no size meets the target: a high finding, no recommendation", () => {
  const a = analyze({ volts: "12", load: "400", length: "200" });
  assert.equal(a.recommended, null);
  assert.equal(a.findings[0].severity, "high");
});

test("annual loss energy and cost", () => {
  const a = analyze({ hours: "1000", price: "0.2", size: "4" });
  close(a.chosen.lossKwh, a.chosen.lossW, 1e-9);
  close(a.chosen.lossCost, a.chosen.lossW * 0.2, 1e-9);
  assert.equal(analyze({ size: "4" }).chosen.lossKwh, null);
});

test("input errors are refused, not guessed", () => {
  for (const [patch, re] of [
    [{ volts: "0" }, /voltage/], [{ load: "" }, /load/], [{ length: "-3" }, /run length/], [{ pf: "1.2" }, /Power factor/],
    [{ system: "ac1", pf: "1.2" }, /Power factor/], [{ sets: "1.5" }, /Parallel/], [{ targetPct: "0" }, /Target/], [{ size: "13" }, /Unknown conductor/],
    [{ tempC: "400" }, /temperature/], [{ hours: "9000" }, /Hours/], [{ material: "gold" }, /copper/],
  ]) {
    const r = analyze(patch);
    if (patch.pf && !patch.system) { assert.equal(r.error, undefined); continue; } // DC ignores power factor
    assert.match(r.error || "", re, JSON.stringify(patch));
  }
});

test("CSV has a row per size and the defaults round-trip", () => {
  const csv = reportCsv(analyze(DEFAULTS));
  assert.equal(csv.trim().split("\n").length, SIZES.awg.length + 1);
  assert.match(csv, /^size,area_mm2,resistance_ohm_per_1000_ft/);
});
