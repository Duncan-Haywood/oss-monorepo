import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  analyze, parsePoints, empiricalVariogram, fitVariogram, gammaModel, krigingSystem, invert, distanceFn,
  greatCircleKm, mergeDuplicates, baselinesLOO, rng, toCsv, looCsv, PAPERS, SAMPLE_TEXT, EARTH_RADIUS_KM, cressieCriterion,
} from "./engine.mjs";
import { simulate, gaussianField } from "./eval/simulate.mjs";

const data = (f) => readFileSync(new URL(`./data/${f}`, import.meta.url), "utf8");
const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${msg ?? ""} ${a} vs ${b}`);
const randomPoints = (n, seed = 1, scale = 100) => {
  const r = rng(seed);
  return Array.from({ length: n }, () => ({ x: scale * r(), y: scale * r(), v: 5 + 3 * r() + r() * r() * 4 }));
};
const MODELS3 = [
  { model: "spherical", nugget: 0.2, psill: 1.5, range: 40 },
  { model: "exponential", nugget: 0.1, psill: 2, range: 60 },
  { model: "gaussian", nugget: 0.05, psill: 1, range: 35 },
];

// Cholesky solve, written separately from the engine's Gauss-Jordan inverse.
function cholSolve(C, b) {
  const n = C.length, L = Array.from({ length: n }, () => new Float64Array(n));
  for (let i = 0; i < n; i++) for (let j = 0; j <= i; j++) {
    let s = C[i][j];
    for (let k = 0; k < j; k++) s -= L[i][k] * L[j][k];
    L[i][j] = i === j ? Math.sqrt(s) : s / L[j][j];
  }
  const y = new Float64Array(n);
  for (let i = 0; i < n; i++) { let s = b[i]; for (let k = 0; k < i; k++) s -= L[i][k] * y[k]; y[i] = s / L[i][i]; }
  const x = new Float64Array(n);
  for (let i = n - 1; i >= 0; i--) { let s = y[i]; for (let k = i + 1; k < n; k++) s -= L[k][i] * x[k]; x[i] = s / L[i][i]; }
  return x;
}
const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);

test("PAPERS cite every method with DOIs where they exist", () => {
  assert.ok(PAPERS.length >= 6);
  for (const p of PAPERS) for (const k of ["authors", "title", "venue", "year", "url", "implemented", "deviations"]) assert.ok(p[k], `${p.title} ${k}`);
  const dois = PAPERS.map((p) => p.doi).filter(Boolean);
  for (const d of ["10.2113/gsecongeo.58.8.1246", "10.1007/BF01032109", "10.1007/BF01035243", "10.1007/BF01033232", "10.1145/800186.810616"]) assert.ok(dois.includes(d), d);
});

test("invert: A times its inverse is the identity", () => {
  const r = rng(3), n = 25;
  const A = Array.from({ length: n }, () => Float64Array.from({ length: n }, () => r() - 0.5));
  const Q = invert(A);
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    let s = 0; for (let k = 0; k < n; k++) s += A[i][k] * Q[k][j];
    close(s, i === j ? 1 : 0, 1e-9);
  }
  assert.throws(() => invert([[1, 2], [2, 4]]), /singular/);
});

test("ordinary kriging equals the covariance-form GLS predictor (independent algebra and solver)", () => {
  // Cressie 1993, section 3.2: with C(h) = sill - gamma(h), the ordinary kriging
  // predictor is m + c' C^-1 (z - m 1), m = 1'C^-1 z / 1'C^-1 1, and its variance is
  // sill - c'C^-1 c + (1 - 1'C^-1 c)^2 / 1'C^-1 1. Solved here by Cholesky.
  const pts = randomPoints(40, 11);
  const d = distanceFn("xy");
  for (const m of MODELS3) {
    const sill = m.nugget + m.psill;
    const C = pts.map((p) => pts.map((q) => (p === q ? sill : sill - gammaModel(m, d(p, q)))));
    const one = pts.map(() => 1), z = pts.map((p) => p.v);
    const Ci1 = cholSolve(C, one), Ciz = cholSolve(C, z);
    const mhat = dot(one, Ciz) / dot(one, Ci1);
    const sys = krigingSystem(pts, m);
    for (const t of [{ x: 13, y: 77 }, { x: 50.5, y: 50.5 }, { x: 99, y: 1 }, { x: 140, y: -20 }]) {
      const c = pts.map((p) => sill - gammaModel(m, d(t, p)));
      const Cic = cholSolve(C, c);
      const est = mhat + dot(c, cholSolve(C, z.map((v) => v - mhat)));
      const variance = sill - dot(c, Cic) + (1 - dot(one, Cic)) ** 2 / dot(one, Ci1);
      const r = sys.predict(t, { weights: true });
      close(r.estimate, est, 1e-8, `${m.model} estimate`);
      close(r.variance, variance, 1e-8, `${m.model} variance`);
      close(r.weights.reduce((s, w) => s + w, 0), 1, 1e-10, "weights sum to 1");
    }
  }
});

test("exact at the readings: the estimate is the reading and the variance is zero", () => {
  const pts = randomPoints(30, 5);
  for (const m of MODELS3) {
    const sys = krigingSystem(pts, m);
    for (const p of pts.slice(0, 10)) {
      const r = sys.predict(p);
      close(r.estimate, p.v, 1e-8);
      assert.ok(r.variance < 1e-8);
    }
  }
});

test("1-D with a linear variogram, ordinary kriging is linear interpolation (and flat past the ends)", () => {
  // Brownian motion is Markov: between two readings only those two matter,
  // in proportion to distance; beyond the last reading the estimate is that reading.
  const xs = [0, 1.5, 4, 5, 9, 12.5];
  const vs = [2, 5, 3, 3.5, 8, 6];
  const pts = xs.map((x, i) => ({ x, y: 0, v: vs[i] }));
  const sys = krigingSystem(pts, { model: "linear", nugget: 0, psill: 1, range: 1 });
  for (let k = 0; k < xs.length - 1; k++) for (const t of [0.25, 0.5, 0.9]) {
    const x = xs[k] + t * (xs[k + 1] - xs[k]);
    const r = sys.predict({ x, y: 0 });
    close(r.estimate, vs[k] + t * (vs[k + 1] - vs[k]), 1e-9, `x=${x}`);
    // gamma(h) = h is Brownian motion with Var(B(s+h) - B(s)) = 2h, so the error is a
    // Brownian bridge: 2 t (1 - t) L; the unknown mean adds nothing inside the data.
    close(r.variance, 2 * t * (1 - t) * (xs[k + 1] - xs[k]), 1e-9, `var x=${x}`);
  }
  close(sys.predict({ x: 20, y: 0 }).estimate, 6, 1e-9);
  close(sys.predict({ x: -3, y: 0 }).estimate, 2, 1e-9);
});

test("Dubrule's closed-form leave-one-out equals refitting without each reading", () => {
  const pts = randomPoints(35, 9);
  for (const m of MODELS3) {
    const loo = krigingSystem(pts, m).leaveOneOut();
    for (let i = 0; i < pts.length; i += 3) {
      const rest = pts.filter((_, j) => j !== i);
      const r = krigingSystem(rest, m).predict(pts[i]);
      close(loo[i].estimate, r.estimate, 1e-7, `${m.model} ${i}`);
      close(loo[i].variance, r.variance, 1e-7, `${m.model} var ${i}`);
    }
  }
});

test("invariances: moving, rotating and rescaling", () => {
  const pts = randomPoints(25, 21);
  const m = MODELS3[1];
  const t = { x: 33, y: 61 };
  const base = krigingSystem(pts, m).predict(t);
  const a = 0.7, c = Math.cos(a), s = Math.sin(a);
  const rot = (p) => ({ ...p, x: c * p.x - s * p.y + 500, y: s * p.x + c * p.y - 200 });
  const r1 = krigingSystem(pts.map(rot), m).predict(rot(t));
  close(r1.estimate, base.estimate, 1e-8); close(r1.variance, base.variance, 1e-8);
  const r2 = krigingSystem(pts.map((p) => ({ ...p, v: 3 * p.v - 7 })), m).predict(t);
  close(r2.estimate, 3 * base.estimate - 7, 1e-8);
  const m9 = { ...m, nugget: 9 * m.nugget, psill: 9 * m.psill };
  close(krigingSystem(pts, m9).predict(t).variance, 9 * base.variance, 1e-8);
});

test("the variogram fit recovers a known model from a simulated field", () => {
  const r = rng(42);
  const truth = { model: "exponential", nugget: 0.2, psill: 1, range: 30 };
  const sites = Array.from({ length: 500 }, () => ({ x: 100 * r(), y: 100 * r() }));
  const z = gaussianField(sites, (h, diag) => (diag ? 1.2 : 1.2 - gammaModel(truth, h)), r);
  const pts = sites.map((s, i) => ({ ...s, v: z[i] }));
  const ev = empiricalVariogram(pts, { lags: 15 });
  const fit = fitVariogram(ev.bins, "exponential");
  assert.ok(fit.range > 15 && fit.range < 60, `range ${fit.range}`);
  assert.ok(fit.nugget + fit.psill > 0.8 && fit.nugget + fit.psill < 1.8, `sill ${fit.nugget + fit.psill}`);
  assert.ok(fit.nugget < 0.5, `nugget ${fit.nugget}`);
  // The fit is a local optimum of Cressie's criterion: nudging any parameter makes it worse.
  for (const [k, f] of [["range", 1.05], ["range", 0.95], ["psill", 1.05], ["psill", 0.95]]) {
    assert.ok(cressieCriterion({ ...fit, [k]: fit[k] * f }, ev.bins) >= fit.sse - 1e-12, `${k} x ${f}`);
  }
});

test("Matheron's estimator matches a hand count; Cressie-Hawkins resists a wild reading", () => {
  const pts = [{ x: 0, y: 0, v: 1 }, { x: 1, y: 0, v: 3 }, { x: 2, y: 0, v: 4 }, { x: 3, y: 0, v: 8 }];
  const ev = empiricalVariogram(pts, { lags: 3, maxLag: 3 });
  // lag 1: pairs (1,3), (3,4), (4,8): squared diffs 4, 1, 16 -> 21 / 6
  close(ev.bins[0].gamma, 21 / 6, 1e-12); assert.equal(ev.bins[0].n, 3);
  const r = rng(4);
  const clean = Array.from({ length: 200 }, () => ({ x: 50 * r(), y: 50 * r(), v: r() }));
  const dirty = clean.map((p, i) => (i % 40 === 0 ? { ...p, v: p.v + 30 } : p));
  const m = empiricalVariogram(dirty, { lags: 8 }).bins, c = empiricalVariogram(dirty, { lags: 8, estimator: "cressie" }).bins;
  const truth = empiricalVariogram(clean, { lags: 8 }).bins;
  for (let k = 0; k < m.length; k++) assert.ok(Math.abs(c[k].gamma - truth[k].gamma) < Math.abs(m[k].gamma - truth[k].gamma) / 5, `lag ${k}`);
});

test("longitude and latitude: chordal distance, the dateline and the poles", () => {
  const d = distanceFn("lonlat");
  const gc = greatCircleKm(-0.1276, 51.5072, 2.3522, 48.8566);
  assert.ok(gc > 340 && gc < 347, `London-Paris ${gc}`);
  close(d({ x: -0.1276, y: 51.5072 }, { x: 2.3522, y: 48.8566 }), 2 * EARTH_RADIUS_KM * Math.sin(gc / (2 * EARTH_RADIUS_KM)), 1e-9);
  const across = d({ x: 179, y: 0 }, { x: -179, y: 0 });
  close(across, d({ x: 0, y: 0 }, { x: 2, y: 0 }), 1e-9);
  assert.ok(Math.abs(d({ x: 0, y: 90 }, { x: 120, y: 90 })) < 1e-6);
  assert.equal(mergeDuplicates([{ x: 180, y: 10, v: 1 }, { x: -180, y: 10, v: 3 }], "lonlat").points.length, 1);
});

test("parsing: headers, separators, a named value column, bad rows", () => {
  const a = parsePoints("lat,lon,depth_m,temp\n10,20,5,15\n11,21,6,\n12,22,x,17", { value: "temp" });
  assert.equal(a.coords, "lonlat");
  assert.deepEqual(a.points.map((p) => [p.x, p.y, p.v]), [[20, 10, 15], [22, 12, 17]]);
  assert.equal(a.skipped, 1);
  const b = parsePoints("1\t2\t3\n4\t5\t6");
  assert.equal(b.coords, "xy"); assert.equal(b.points.length, 2);
  const c = parsePoints("easting;northing;zinc\n1;2;300\n3;4;500");
  assert.deepEqual(c.names, { x: "easting", y: "northing", value: "zinc" });
  assert.match(parsePoints("a,b,c\n1,2,3", { value: "nope" }).error, /No column/);
  assert.match(parsePoints("lat,lon,v\n95,0,1").error, /out of range/);
});

test("analyze: errors are plain, results are complete", () => {
  assert.match(analyze({ text: "" }).error, /No readings/);
  assert.match(analyze({ text: "x,y,v\n1,1,1\n2,2,1\n3,3,1\n4,1,1\n5,5,1" }).error, /same value/);
  assert.match(analyze({ text: "x,y,v\n1,1,1\n2,2,2" }).error, /at least 5/);
  assert.match(analyze({ text: SAMPLE_TEXT, nugget: 0, psill: 1, range: 5 }).error, /name the model/);
  const r = analyze({ text: SAMPLE_TEXT, predictAt: [[10, 10]] });
  assert.ok(!r.error, r.error);
  assert.equal(r.n, 12);
  assert.ok(["spherical", "exponential", "gaussian"].includes(r.model.model));
  assert.equal(r.models.length, 3);
  assert.equal(r.predictions.length, 1);
  assert.ok(r.predictions[0].low95 < r.predictions[0].estimate && r.predictions[0].estimate < r.predictions[0].high95);
  assert.ok(r.grid.cells.length === r.grid.nx * r.grid.ny);
  assert.match(toCsv(r), /^x,y,estimate,standard_error\n/);
  assert.equal(looCsv(r).trim().split("\n").length, 13);
  assert.doesNotThrow(() => JSON.stringify(r));
  const fixed = analyze({ text: SAMPLE_TEXT, model: "spherical", nugget: 1, psill: 60, range: 20 });
  assert.deepEqual([fixed.model.nugget, fixed.model.psill, fixed.model.range], [1, 60, 20]);
  const dup = analyze({ text: SAMPLE_TEXT + "\n2,3,45" });
  assert.ok(dup.warnings.some((w) => /averaged/.test(w)));
});

test("a pure-nugget field is reported as one with no map in it", () => {
  const r = rng(8);
  const pts = Array.from({ length: 120 }, () => ({ x: 100 * r(), y: 100 * r(), v: r() }));
  const out = analyze({ points: pts, grid: false });
  const k = out.crossValidation;
  assert.ok(k.kriging.rmse <= k.nearest.rmse, "kriging no worse than the nearest reading on noise");
  assert.ok(out.model.nugget / out.model.sill > 0.5, `nugget share ${out.model.nugget / out.model.sill}`);
});

test("baselines: inverse distance and nearest reading left out", () => {
  const pts = [{ x: 0, y: 0, v: 0 }, { x: 1, y: 0, v: 10 }, { x: 3, y: 0, v: 20 }];
  const b = baselinesLOO(pts);
  close(b[0].idw, (10 / 1 + 20 / 9) / (1 + 1 / 9), 1e-12);
  assert.equal(b[2].nearest, 10);
});

test("real data: ERA5 January 2024 wave height on the 10-degree ocean grid", () => {
  const r = analyze({ text: data("era5-wave-height-2024-01.csv") });
  assert.ok(!r.error, r.error);
  assert.equal(r.coords, "lonlat");
  assert.equal(r.n, 371);
  const cv = r.crossValidation;
  // Pinned from the run recorded in README "Verification" (2026-11-17).
  assert.equal(r.model.model, "exponential");
  close(cv.kriging.rmse, 0.3897, 2e-3);
  close(cv.idw.rmse, 0.6232, 2e-3);
  close(cv.nearest.rmse, 0.5052, 2e-3);
  assert.ok(cv.kriging.rmse < cv.nearest.rmse && cv.nearest.rmse < cv.idw.rmse);
  // the largest surprise is the cell at 60N 10E (a sheltered water point among land in southern Norway)
  assert.ok(cv.outliers.some((o) => o.x === 10 && o.y === 60));
});

test("simulation with a known truth: honest 95% bands, kriging ahead of the baselines", () => {
  const s = simulate({ fields: 10, n: 120, holdout: 80, seed: 3 }).summary;
  assert.ok(s.meanCoverage95 > 0.9 && s.meanCoverage95 < 0.99, `coverage ${s.meanCoverage95}`);
  assert.ok(s.meanLooMsdr > 0.75 && s.meanLooMsdr < 1.3, `msdr ${s.meanLooMsdr}`);
  assert.ok(s.meanRmse.kriging < s.meanRmse.idw && s.meanRmse.kriging < s.meanRmse.nearest);
  assert.ok(s.krigingBeatsNearest >= 9);
  const saved = JSON.parse(readFileSync(new URL("./eval/simulation.json", import.meta.url), "utf8"));
  assert.equal(saved.runs.length, 40);
});

test("CSV export defuses a column name that would run as a formula", () => {
  const r = analyze({ text: SAMPLE_TEXT.replace("x,y,value", "x,y,=HYPERLINK(1)") });
  assert.ok(!r.error, r.error);
  assert.match(toCsv(r), /^x,y,estimate/);
  assert.match(looCsv(r), /^x,y,'=HYPERLINK\(1\),/);
});
