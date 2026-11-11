import { test } from "node:test";
import assert from "node:assert/strict";
import { analyze, sampleInput, DEFAULTS, voltageAt, toC, reportCsv } from "./calc.mjs";

const close = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);

// Hand arithmetic for the sample (an invented module, inverter and site):
//   Voc cold = 49.5 x (1 + -0.0027 x (-20 - 25)) = 49.5 x 1.1215 = 55.51425 V
//   600 / 55.51425 = 10.81 -> 10 modules
//   cell hot = 35 + (45 - 20) x 1000/800 = 66.25 C
//   Vmp hot = 41.4 x (1 - 0.0035 x 41.25) = 41.4 x 0.855625 = 35.4228750 V
//   100 / 35.42 = 2.82 -> 3 modules
//   Vmp cold = 41.4 x (1 + 0.0035 x 45) = 41.4 x 1.1575 = 47.92050 V; 550 / 47.92 = 11.48 -> 11
//   1.25 x 10.3 = 12.875 A; 26 / 12.875 = 2.02 -> 2 strings per MPPT; x 1.25 = 16.09375 A
test("sample: hand-calculated limits", () => {
  const a = analyze(sampleInput());
  assert.equal(a.error, undefined);
  close(a.perModule.vocCold, 55.514, 0.0005);
  close(a.perModule.vmpHot, 35.423, 0.0005);
  close(a.perModule.vmpCold, 47.921, 0.0005);
  close(a.temps.tCellHot, 66.25);
  assert.equal(a.maxLen, 10);
  assert.equal(a.minLen, 3);
  assert.equal(a.trackLen, 11);
  assert.equal(a.limit.volts, 600);
  close(a.current.iscDesign, 12.875);
  close(a.current.ampacity, 16.094, 0.0005);
  assert.equal(a.current.perMppt, 2);
  assert.deepEqual(a.lengths.map((l) => l.modules), [3, 4, 5, 6, 7, 8, 9, 10]);
  close(a.lengths.at(-1).vocCold, 555.14, 0.005);
});

test("sample: 24 modules on 2 MPPTs x 2 strings -> 4 x 6 or 3 x 8 use every module", () => {
  const a = analyze(sampleInput());
  const full = a.layouts.filter((l) => l.unused === 0).map((l) => [l.stringLength, l.strings, l.perMppt.join("+")]);
  assert.deepEqual(full, [[8, 3, "2+1"], [6, 4, "2+2"]]);
  // 12 x 2 is over the cold limit; 4 x 6 and 3 x 8 need more than 4 strings.
  assert.ok(!a.layouts.some((l) => l.stringLength > 10));
  assert.equal(a.layouts[0].dcKw, 9.6);
  close(a.layouts[0].dcAcRatio, 1.26, 0.005);
});

test("Fahrenheit input gives the same answer as Celsius", () => {
  const c = analyze(sampleInput());
  const f = analyze({ ...sampleInput(), tempUnit: "F", tMin: "-4", tHigh: "95" });
  assert.equal(f.maxLen, c.maxLen);
  assert.equal(f.minLen, c.minLen);
  close(f.perModule.vocCold, c.perModule.vocCold, 1e-9);
  close(toC(212, "F"), 100);
});

test("coefficient in mV per degree matches the same coefficient in percent", () => {
  // -0.27 %/C on 49.5 V is -133.65 mV/C.
  close(voltageAt(49.5, -133.65, "mV", -20), voltageAt(49.5, -0.27, "%", -20), 1e-9);
  const a = analyze({ ...sampleInput(), betaVoc: "-133.65", betaVocUnit: "mV" });
  assert.equal(a.maxLen, 10);
});

test("the lowest voltage limit binds", () => {
  const a = analyze({ ...sampleInput(), invMaxV: "1000", codeMaxV: "", moduleMaxV: "1000" });
  assert.equal(a.maxLen, 18); // 1000 / 55.514 = 18.01
  const b = analyze({ ...sampleInput(), invMaxV: "1000", codeMaxV: "600" });
  assert.equal(b.maxLen, 10);
  assert.match(b.limit.label, /system voltage limit/);
});

test("an exact fit is not lost to floating point", () => {
  // Voc cold exactly 50 V and limit 600 V -> 12, not 11.
  const a = analyze({ ...sampleInput(), vocStc: "50", vmpStc: "40", betaVoc: "-0.5", tMin: "25", tHigh: "30", invMaxV: "600", codeMaxV: "", moduleMaxV: "" });
  assert.equal(a.maxLen, 12);
});

test("cold mornings above the MPPT maximum are flagged, not forbidden", () => {
  const a = analyze({ ...sampleInput(), mpptMax: "400" }); // 400 / 47.92 = 8.35 -> 8
  assert.equal(a.trackLen, 8);
  assert.equal(a.maxLen, 10);
  assert.ok(a.findings.some((f) => /leaves the MPPT window/.test(f.title)));
  assert.equal(a.lengths.find((l) => l.modules === 9).coldTracking, false);
});

test("no window: hot Vmp needs more modules than the cold Voc allows", () => {
  const a = analyze({ ...sampleInput(), mpptMin: "450" }); // 450 / 35.42 = 12.7 -> 13 > 10
  assert.equal(a.lengths.length, 0);
  assert.ok(a.findings.some((f) => f.severity === "high" && /No string length/.test(f.title)));
});

test("current limits: parallel strings and back-feed", () => {
  const a = analyze({ ...sampleInput(), mpptMaxIsc: "40", mpptMaxI: "30", seriesFuse: "15" });
  assert.equal(a.current.perMppt, 3); // 40 / 12.875 = 3.1
  assert.equal(a.current.perMpptImp, 3); // 30 / 9.66 = 3.1
  assert.ok(a.findings.some((f) => /back-feed/.test(f.title))); // 2 x 12.875 = 25.75 > 15
  const one = analyze({ ...sampleInput(), mpptMaxIsc: "12" });
  assert.ok(one.findings.some((f) => /above the MPPT short-circuit limit/.test(f.title)));
});

test("bad input is refused with a reason", () => {
  assert.match(analyze({ ...sampleInput(), betaVoc: "0.27" }).error, /negative/);
  assert.match(analyze({ ...sampleInput(), vocStc: "" }).error, /Enter the module Voc/);
  assert.match(analyze({ ...sampleInput(), vmpStc: "60" }).error, /Vmp must be lower/);
  assert.match(analyze({ ...sampleInput(), tHigh: "-30" }).error, /hot-day/);
  assert.match(analyze({ ...sampleInput(), betaVoc: "-133" }).error, /mV/);
  assert.match(analyze({ ...sampleInput(), modules: "2.5" }).error, /whole number/);
  assert.ok(analyze({}).error);
  assert.ok(analyze(null).error);
});

test("optional fields: no Vmp coefficient and no NOCT are warned about", () => {
  const a = analyze({ ...sampleInput(), betaVmp: "", noct: "" });
  assert.equal(a.error, undefined);
  assert.ok(a.findings.some((f) => /No Vmp coefficient/.test(f.title)));
  assert.ok(a.findings.some((f) => /No NOCT/.test(f.title)));
  const r = analyze({ ...sampleInput(), cellRise: "35" });
  close(r.temps.tCellHot, 70);
});

test("pure: input and DEFAULTS are unchanged, results repeat", () => {
  const input = sampleInput();
  const copy = JSON.stringify(input);
  const r1 = analyze(input), r2 = analyze({ ...DEFAULTS });
  assert.equal(JSON.stringify(input), copy);
  assert.deepEqual(r1, r2);
  assert.ok(Object.isFrozen(DEFAULTS));
});

test("CSV has a row per length and per layout, and neutralises formulas", () => {
  const a = analyze(sampleInput());
  const csv = reportCsv(a);
  assert.match(csv, /^String length,/);
  assert.equal(csv.split("\n").filter((l) => /^\d+,/.test(l)).length, a.lengths.length + a.layouts.length);
  assert.match(csv, /,2\+2,/);
});

test("extreme inputs stay finite", () => {
  for (const [k, v] of [["modules", "100000"], ["invMaxV", "1e9"], ["mpptMaxIsc", "1e9"], ["tMin", "-60"]]) {
    const a = analyze({ ...sampleInput(), [k]: v });
    assert.equal(a.error, undefined, k);
    assert.ok(JSON.stringify(a).length < 200000, k);
    assert.doesNotMatch(JSON.stringify(a), /null,"vmpCold":null|NaN|Infinity/, k);
  }
});
