import { test } from "node:test";
import assert from "node:assert/strict";
import {
  runoffDepth, idfIntensity, alternatingBlock, excessIncrements, triangularUH, convolve, hydrograph,
  pondStorage, pondArea, orificeFlow, weirFlow, route, analyze, parseInput, sampleInput, reportCsv, CFS_HR_PER_INCH_SQMI,
} from "./detention.mjs";

const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ""} ${a} vs ${b} (tol ${tol})`);

test("NRCS runoff equation, by hand (NEH-630 ch. 10 eq. 10-11, TR-55 eq. 2-3)", () => {
  // CN 80: S = 1000/80 - 10 = 2.5 in, Ia = 0.5 in; P = 5 in: Q = 4.5^2 / (4.5 + 2.5) = 2.892857 in
  close(runoffDepth(5, 80), 20.25 / 7, 1e-12);
  // CN 61: S = 6.3934 in, Ia = 1.27869 in; P = 3 in: Q = 1.72131^2 / 8.11475 = 0.365128 in
  const s = 1000 / 61 - 10, ia = 0.2 * s;
  close(runoffDepth(3, 61), (3 - ia) ** 2 / (3 - ia + s), 1e-12);
  close(runoffDepth(3, 61), 0.36513, 1e-5);
  assert.equal(runoffDepth(0.5, 80), 0); // P at Ia
  assert.equal(runoffDepth(0.4, 80), 0); // below Ia
  assert.equal(runoffDepth(2, 100), 2); // impervious: all of it
  assert.ok(runoffDepth(4, 90) > runoffDepth(4, 80));
  assert.throws(() => runoffDepth(1, 0));
  assert.throws(() => runoffDepth(1, 100.5), /curve number/); // S would go negative
});

test("alternating block: total depth from the IDF, peak block at the centre, alternating", () => {
  const idf = { a: 40, b: 10, n: 0.8 };
  const rain = alternatingBlock(idf, 1440, 2);
  assert.equal(rain.length, 720);
  const total = rain.reduce((s, x) => s + x, 0);
  close(total, (40 / 1450 ** 0.8) * 24, 1e-9, "24 h depth = i(1440) x 24 h");
  const imax = rain.indexOf(Math.max(...rain));
  assert.equal(imax, 359);
  // the first block: i(2 min) x 2 min / 60
  close(rain[359], (idfIntensity(2, idf) * 2) / 60, 1e-12);
  // second largest goes right of the peak, third left
  const sorted = [...rain].sort((x, y) => y - x);
  assert.equal(rain[360], sorted[1]);
  assert.equal(rain[358], sorted[2]);
  // depth over the central 60 minutes equals the 60-minute IDF depth
  const mid = rain.slice(359 - 14, 359 + 16).reduce((s, x) => s + x, 0);
  close(mid, idfIntensity(60, idf), 1e-9, "central hour");
  assert.throws(() => alternatingBlock(idf, 100, 3));
});

test("triangular unit hydrograph: NEH-630 ch. 16 peak, and exactly one inch of volume", () => {
  // 1 sq mi, Tc = 1 h, D = 6 min: Tp = 0.05 + 0.6 = 0.65 h, qp = 484 / 0.65 = 744.6 cfs per inch
  const uh = triangularUH(640, 1, 6);
  close(uh.tp, 0.65, 1e-12);
  close(uh.qp, 484 / 0.65, 1e-9);
  close(uh.tb, 0.65 * (2 * 645.3333333) / 484, 1e-6, "Tb about 2.67 Tp");
  const vol = uh.ordinates.reduce((s, x) => s + x, 0) * 0.1;
  close(vol, CFS_HR_PER_INCH_SQMI, 1e-9, "cfs-hours of 1 in over 1 sq mi");
  // 1 in over 1 sq mi: 5280^2 ft2 x 1/12 ft = 2,323,200 ft3, over 3600 s
  close(CFS_HR_PER_INCH_SQMI, (5280 * 5280) / 12 / 3600, 1e-12);
  assert.ok(Math.max(...uh.ordinates) <= uh.qp);
  // a different peak rate factor keeps the volume
  const flat = triangularUH(640, 1, 6, 300);
  close(flat.ordinates.reduce((s, x) => s + x, 0) * 0.1, CFS_HR_PER_INCH_SQMI, 1e-9);
});

test("convolution conserves the runoff volume", () => {
  const rain = alternatingBlock({ a: 60, b: 10, n: 0.8 }, 1440, 2);
  const h = hydrograph({ areaAc: 12, cn: 78, tcHr: 0.3, rain, dtMin: 2 });
  const vol = h.flow.reduce((s, x) => s + x, 0) * 120;
  close(vol, h.volumeFt3, 1e-6 * h.volumeFt3);
  close(h.runoffIn, runoffDepth(rain.reduce((s, x) => s + x, 0), 78), 1e-12);
  const inc = excessIncrements([1, 1, 1], 80);
  close(inc.reduce((s, x) => s + x, 0), runoffDepth(3, 80), 1e-12);
  assert.deepEqual(convolve([1, 2], [1, 1, 1]), [1, 3, 3, 2]);
});

test("basin geometry: prismoidal storage by hand and against the integral of area", () => {
  const pond = { length: 100, width: 60, sideSlope: 3 };
  // 100 x 60 x 2 + 160 x 3 x 4 + 4/3 x 9 x 8 = 12000 + 1920 + 96
  close(pondStorage(2, pond), 14016, 1e-9);
  let sum = 0;
  const n = 4000;
  for (let i = 0; i < n; i++) sum += pondArea(((i + 0.5) * 5) / n, pond) * (5 / n);
  close(pondStorage(5, pond), sum, 1e-6 * sum);
  assert.equal(pondStorage(-1, pond), 0);
});

test("orifice and weir equations, by hand", () => {
  // 6 in orifice, 3 ft of water: 0.6 x 0.19635 x sqrt(2 x 32.174 x 2.75) = 1.5672 cfs
  close(orificeFlow(3, 0.5), 0.6 * (Math.PI * 0.25) / 4 * Math.sqrt(2 * 32.174 * 2.75), 1e-12);
  close(orificeFlow(3, 0.5), 1.5672, 1e-4);
  // continuous at the crown and increasing below it
  close(orificeFlow(0.5, 0.5), orificeFlow(0.5 + 1e-9, 0.5), 1e-6);
  assert.ok(orificeFlow(0.25, 0.5) < orificeFlow(0.4, 0.5));
  assert.equal(orificeFlow(0, 0.5), 0);
  // 4 ft weir, 0.5 ft over the crest: 3.33 x 4 x 0.5^1.5 = 4.7094 cfs
  close(weirFlow(3.5, 3, 4), 3.33 * 4 * 0.5 ** 1.5, 1e-12);
  assert.equal(weirFlow(2.9, 3, 4), 0);
});

test("routing matches the linear reservoir's exact solution", () => {
  // S = A h, O = k S: constant inflow I from empty gives O(t) = I (1 - exp(-k t))
  const A = 10000, k = 1 / 3600, I = 10;
  const inflow = new Array(600).fill(I); // 10 h at 1 min
  const r = route(inflow, 1, (h) => A * h, (h) => k * A * h, { drainSteps: 0 });
  for (const tMin of [30, 120, 300, 600]) {
    // the first step ramps the inflow in from 0 (trapezoidal rule), half a step late
    const exact = I * (1 - Math.exp(-k * (tMin - 0.5) * 60));
    close(r.outflow[tMin], exact, 2e-3, `t = ${tMin} min`);
  }
});

test("routing conserves mass", () => {
  const p = analyze(sampleInput());
  for (const s of p.storms) {
    const dt = p.input.dtMin * 60;
    const vin = s.inflow.reduce((a, x) => a + x, 0) * dt;
    // trapezoidal outflow volume over the routed steps
    let vout = 0;
    for (let i = 1; i < s.outflow.length; i++) vout += ((s.outflow[i - 1] + s.outflow[i]) / 2) * dt;
    const left = pondStorage(s.stage[s.stage.length - 1], p.input);
    // inflow is stepped in by the trapezoid too: its volume is the same sum
    close(vout + left, vin, 2e-3 * vin, s.label);
  }
});

test("routing agrees with an independent RK4 integration of dS/dt = I - O", () => {
  const pond = { length: 80, width: 40, sideSlope: 3 };
  const S = (h) => pondStorage(h, pond);
  const O = (h) => orificeFlow(h, 0.5) + weirFlow(h, 3, 2);
  // smooth inflow: a gamma-shaped hydrograph peaking at 1 h at 20 cfs
  const q = (t) => 20 * (t / 1) ** 3 * Math.exp(3 * (1 - t / 1));
  const dtMin = 0.5, steps = 12 * 120;
  const inflow = Array.from({ length: steps }, (_, i) => q(((i + 1) * dtMin) / 60));
  const r = route(inflow, dtMin, S, O);
  // RK4 on storage, with h(S) found by its own bisection
  const hOf = (s) => { let lo = 0, hi = 50; for (let i = 0; i < 100; i++) { const m = (lo + hi) / 2; if (S(m) < s) lo = m; else hi = m; } return lo; };
  const f = (t, s) => q(t / 3600) - O(hOf(s));
  let s = 0, peakO = 0, peakH = 0;
  const hstep = 5;
  for (let t = 0; t < 12 * 3600; t += hstep) {
    const k1 = f(t, s), k2 = f(t + hstep / 2, s + (hstep / 2) * k1), k3 = f(t + hstep / 2, s + (hstep / 2) * k2), k4 = f(t + hstep, s + hstep * k3);
    s += (hstep / 6) * (k1 + 2 * k2 + 2 * k3 + k4);
    const h = hOf(s);
    peakH = Math.max(peakH, h);
    peakO = Math.max(peakO, O(h));
  }
  close(r.peakOut, peakO, 0.005 * peakO, "peak outflow");
  close(r.peakStage, peakH, 0.005 * peakH, "peak stage");
});

test("sample design: both peaks held to the pre-development peaks, two stages in order", () => {
  const a = analyze(sampleInput());
  assert.ok(!a.error, a.error);
  const [s2, s100] = a.storms;
  for (const s of a.storms) {
    assert.ok(s.postPeak > s.prePeak, "development raises the peak");
    assert.ok(s.peakOut <= s.allow * (1 + 1e-9), `${s.label} out ${s.peakOut} allow ${s.allow}`);
    assert.ok(s.peakOut >= s.allow * 0.995, `${s.label} uses its allowable`);
    assert.ok(s.allowFromPre);
  }
  close(a.outlet.weirCrestFt, s2.peakStage, 1e-12, "weir crest at the small storm's peak stage");
  assert.ok(s100.peakStage > a.outlet.weirCrestFt);
  close(a.requiredDepthFt, s100.peakStage + 1, 1e-12);
  assert.ok(a.outlet.orificeDiameterIn > 2 && a.outlet.orificeDiameterIn < 12);
  assert.ok(a.outlet.weirLengthFt > 0);
  // storage needed is a fraction of the large storm's runoff volume
  assert.ok(s100.peakStorageFt3 < s100.postVolumeFt3 && s100.peakStorageFt3 > 0.2 * s100.postVolumeFt3);
});

test("more pavement needs a deeper basin; an entered allowable is honoured", () => {
  const base = analyze(sampleInput());
  const more = analyze({ ...sampleInput(), postCN: "92" });
  assert.ok(more.requiredDepthFt > base.requiredDepthFt);
  const tight = analyze({ ...sampleInput(), smallAllow: "0.5" });
  assert.ok(tight.storms[0].peakOut <= 0.5 + 1e-9);
  assert.ok(!tight.storms[0].allowFromPre);
  assert.ok(tight.outlet.orificeDiameterIn < base.outlet.orificeDiameterIn);
});

test("one storm only: no weir", () => {
  const a = analyze({ ...sampleInput(), largeA: "" });
  assert.equal(a.storms.length, 1);
  assert.equal(a.outlet.weirLengthFt, null);
  close(a.requiredDepthFt, a.storms[0].peakStage + 1, 1e-12);
});

test("input errors come back as messages", () => {
  assert.match(analyze({ ...sampleInput(), areaAc: "x" }).error, /Drainage area/);
  assert.match(analyze({ ...sampleInput(), postCN: "120" }).error, /curve number/);
  assert.match(analyze({ ...sampleInput(), dtMin: "7" }).error, /whole number of time steps/);
});

test("CSV has a row per step and every storm's columns", () => {
  const a = analyze(sampleInput());
  const csv = reportCsv(a).trim().split("\n");
  assert.equal(csv[0].split(",").length, 11);
  assert.ok(csv.length > 720);
  assert.match(csv[0], /100-year outflow cfs/);
});

test("CSV guards storm names against spreadsheet formulas", async () => {
  const { csvCell } = await import("./detention.mjs");
  assert.equal(csvCell("=HYPERLINK(1)"), "'=HYPERLINK(1)");
  assert.equal(csvCell("-1.5"), "-1.5");
  const a = analyze({ ...sampleInput(), smallLabel: "=cmd" });
  assert.match(reportCsv(a).split("\n")[0], /'=cmd rain in/);
});

test("every bounded field rejects a value just past either limit", () => {
  const limits = {
    areaAc: [0.01, 2000], preCN: [30, 100], preTcHr: [0.05, 24], postCN: [30, 100], postTcHr: [0.05, 24],
    length: [1, 5000], width: [1, 5000], sideSlope: [0, 20], freeboard: [0, 10],
    cd: [0.3, 1], cw: [2, 4], prf: [100, 700],
  };
  // the step is tiny so a limit loosened by any amount lets the value through
  for (const [k, [lo, hi]] of Object.entries(limits)) {
    assert.equal(parseInput({ ...sampleInput(), [k]: String(hi) })[k], hi, `${k} at ${hi}`);
    assert.equal(parseInput({ ...sampleInput(), [k]: String(lo) })[k], lo, `${k} at ${lo}`);
    assert.throws(() => parseInput({ ...sampleInput(), [k]: String(hi + 1e-6 * Math.max(1, hi)) }), /must be between/, `${k} above ${hi}`);
    assert.throws(() => parseInput({ ...sampleInput(), [k]: String(lo - 1e-6 * Math.max(1, Math.abs(lo))) }), /must be between/, `${k} below ${lo}`);
  }
});

test("a required field left blank is an error, not zero", () => {
  // the page shows these as placeholders (3, 10), so a silent 0 would size a
  // vertical-walled basin or a different storm than the visitor sees
  for (const k of ["sideSlope", "smallB", "largeB", "areaAc", "length", "smallN"]) {
    assert.throws(() => parseInput({ ...sampleInput(), [k]: "" }), /enter a number/, k);
    assert.throws(() => parseInput({ ...sampleInput(), [k]: "   " }), /enter a number/, k);
  }
  assert.match(analyze({ ...sampleInput(), sideSlope: "" }).error, /Side slope: enter a number/);
  // optional fields still fall back
  const p = parseInput({ ...sampleInput(), freeboard: "", cd: "", durationHr: "" });
  assert.deepEqual([p.freeboard, p.cd, p.durationHr], [1, 0.6, 24]);
});

test("blank storm names get their own defaults", () => {
  const p = parseInput({ ...sampleInput(), smallLabel: "", largeLabel: "" });
  assert.deepEqual(p.storms.map((s) => s.label), ["Small storm", "Large storm"]);
});

test("an overshoot far below display precision is not flagged as over the allowable", () => {
  // A tiny orifice in a tiny basin: the orifice search clamps at its 0.01 ft
  // floor, so the peak sits exactly where the allowable puts it.
  const base = { ...sampleInput(), largeA: "", length: "5", width: "5", sideSlope: "0", smallAllow: "1e-9" };
  const floor = analyze(base).storms[0].peakOut;
  assert.ok(floor > 0.01, `floor peak ${floor}`);
  const a = analyze({ ...base, smallAllow: String(floor / (1 + 5e-7)) });
  assert.ok(!a.error, a.error);
  assert.ok(!a.findings.some((f) => /over the allowable/.test(f.title)), JSON.stringify(a.findings.map((f) => f.title)));
  // a visible overshoot still is
  const b = analyze({ ...base, smallAllow: String(floor / 1.01) });
  assert.ok(b.findings.some((f) => /over the allowable/.test(f.title)));
});
