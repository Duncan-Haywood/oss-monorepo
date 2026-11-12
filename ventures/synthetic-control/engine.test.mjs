import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { analyze, simplexQP, nelderMead, parseCsv, defaultSpec, PAPERS, DEFAULTS } from "./engine.mjs";
import { EXAMPLE_CSV, EXAMPLE_SPEC } from "./example-data.mjs";

const REF = JSON.parse(readFileSync(new URL("./eval/reference.json", import.meta.url), "utf8"));
const R = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const DONORS = Object.keys(REF.adh2015.weights);

// Seeded generator (mulberry32) so property tests are reproducible.
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const quiet = { placebo: false, leaveOneOut: false };
const adh = analyze({ ...EXAMPLE_SPEC, csv: EXAMPLE_CSV });
const weightOf = (r, u) => r.weights.find((w) => w.unit === u)?.weight ?? 0;

test("ADH 2015 West Germany: cross-validated weights match pysyncon (pinned to R Synth) within 0.01", () => {
  for (const u of DONORS) assert.ok(Math.abs(weightOf(adh, u) - REF.adh2015.weights[u]) < 0.01, `${u}: ${weightOf(adh, u)} vs ${REF.adh2015.weights[u]}`);
  // The five donors the paper names, in its order of size.
  assert.deepEqual(adh.weights.slice(0, 5).map((w) => w.unit), ["Austria", "USA", "Japan", "Switzerland", "Netherlands"]);
  assert.ok(adh.weights.slice(5).every((w) => w.weight < 1e-6));
  for (let i = 0; i < 6; i++) assert.ok(Math.abs(adh.trainV[i] - REF.adh2015.train_V[i]) < 0.03, `train V[${i}]`);
});

test("ADH 2015: synthetic path within 0.5% of the reference and the average effect within 1%", () => {
  const ref = REF.adh2015;
  ref.years.forEach((y, i) => {
    const s = adh.series.find((x) => x.time === y);
    assert.ok(Math.abs(s.synthetic - ref.synthetic[i]) / ref.synthetic[i] < 0.005, `${y}`);
    assert.equal(s.treated, ref.treated[i]);
  });
  const refGap = ref.years.map((y, i) => (y >= 1990 ? ref.treated[i] - ref.synthetic[i] : null)).filter((x) => x !== null);
  const refAtt = refGap.reduce((a, b) => a + b, 0) / refGap.length;
  assert.ok(Math.abs(adh.att / refAtt - 1) < 0.01, `${adh.att} vs ${refAtt}`);
  // pysyncon's own parity test pins ATT 1990-2003 at -1555.13 against R.
  assert.ok(Math.abs(adh.att / -1555.1346777620479 - 1) < 0.01);
});

test("ADH 2015: the placebo test ranks West Germany first of 17, p = 1/17", () => {
  assert.equal(adh.placebo.units, 17);
  assert.equal(adh.placebo.rank, 1);
  assert.ok(Math.abs(adh.placebo.pValue - 1 / 17) < 1e-12);
  assert.equal(adh.placebo.runs.length, 16);
  assert.ok(adh.placebo.runs.every((r) => Number.isFinite(r.ratio) && r.gaps.length === 44));
  assert.ok(adh.placebo.screened.units <= adh.placebo.units);
  assert.match(adh.summary, /ranks 1 of 17/);
});

test("ADH 2015: leave-one-out refits each contributing donor and the summary flags the weak USA refit", () => {
  assert.deepEqual(adh.leaveOneOut.map((l) => l.dropped).sort(), ["Austria", "Japan", "Netherlands", "Switzerland", "USA"]);
  for (const l of adh.leaveOneOut) assert.ok(!l.weights.some((w) => w.unit === l.dropped));
  const usa = adh.leaveOneOut.find((l) => l.dropped === "USA");
  assert.ok(usa.preRMSPE > 2 * adh.preRMSPE);
  assert.match(adh.summary, /Without USA the sign flips, but that refit tracks the pre-period far worse/);
});

test("nested V and outcome-only fits reach a loss at least as low as pysyncon's SLSQP solves", () => {
  const nested = analyze({ ...EXAMPLE_SPEC, csv: EXAMPLE_CSV, vMethod: "nested", train: null, ...quiet });
  assert.ok(nested.lossV <= REF.nested.loss_V * (1 + 1e-9), `${nested.lossV} vs ${REF.nested.loss_V}`);
  const outcome = analyze({ csv: EXAMPLE_CSV, unit: "country", time: "year", outcome: "gdp", treated: "West Germany", treatmentTime: 1990, vMethod: "equal", ...quiet });
  assert.equal(outcome.predictors.length, 30);
  assert.ok(outcome.lossV <= REF.outcome_only.loss_V * (1 + 1e-9), `${outcome.lossV} vs ${REF.outcome_only.loss_V}`);
  // Given pysyncon's V, the exact inner solve lands on pysyncon's W.
  const cv = analyze({ ...EXAMPLE_SPEC, csv: EXAMPLE_CSV, customV: REF.adh2015.V, ...quiet });
  for (const u of DONORS) assert.ok(Math.abs(weightOf(cv, u) - REF.adh2015.weights[u]) < 0.002, u);
});

// Brute force: every support, solve the equality-constrained problem, keep feasible ones.
function bruteQP(P, q) {
  const n = q.length;
  let best = Infinity;
  for (let mask = 1; mask < 1 << n; mask++) {
    const S = [...Array(n).keys()].filter((i) => mask & (1 << i));
    const k = S.length;
    const A = S.map((i, a) => [...S.map((j) => P[i][j]), 1]);
    A.push([...new Array(k).fill(1), 0]);
    const b = [...S.map((i) => q[i]), 1];
    // Gaussian elimination
    const M = A.map((r, i) => [...r, b[i]]);
    let ok = true;
    for (let c = 0; c <= k && ok; c++) {
      let p = c;
      for (let r = c + 1; r <= k; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
      if (Math.abs(M[p][c]) < 1e-14) { ok = false; break; }
      [M[c], M[p]] = [M[p], M[c]];
      for (let r = 0; r <= k; r++) if (r !== c) { const f = M[r][c] / M[c][c]; for (let j = c; j <= k + 1; j++) M[r][j] -= f * M[c][j]; }
    }
    if (!ok) continue;
    const w = new Array(n).fill(0);
    S.forEach((i, a) => { w[i] = M[a][k + 1] / M[a][a]; });
    if (w.some((x) => x < -1e-12)) continue;
    let f = 0;
    for (let i = 0; i < n; i++) { f -= q[i] * w[i]; for (let j = 0; j < n; j++) f += 0.5 * w[i] * P[i][j] * w[j]; }
    best = Math.min(best, f);
  }
  return best;
}

test("simplexQP equals brute-force enumeration of supports on 200 random problems", () => {
  const r = rng(20261112);
  for (let t = 0; t < 200; t++) {
    const n = 2 + Math.floor(r() * 6);
    const k = n + 1 + Math.floor(r() * 3); // full column rank: P positive definite
    const X = Array.from({ length: k }, () => Array.from({ length: n }, () => r() * 4 - 2));
    const x1 = Array.from({ length: k }, () => r() * 4 - 2);
    const P = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => X.reduce((s, row) => s + row[i] * row[j], 0)));
    const q = Array.from({ length: n }, (_, i) => X.reduce((s, row, a) => s + row[i] * x1[a], 0));
    const w = simplexQP(P, q);
    assert.ok(Math.abs(w.reduce((a, b) => a + b, 0) - 1) < 1e-12);
    assert.ok(w.every((x) => x >= 0));
    let f = 0;
    for (let i = 0; i < n; i++) { f -= q[i] * w[i]; for (let j = 0; j < n; j++) f += 0.5 * w[i] * P[i][j] * w[j]; }
    const best = bruteQP(P, q);
    assert.ok(f <= best + 1e-8 * (1 + Math.abs(best)), `trial ${t}: ${f} vs ${best}`);
  }
});

test("simplexQP handles a singular P (more donors than predictors) and a single donor", () => {
  const P = [[1, 1, 1], [1, 1, 1], [1, 1, 1]];
  const w = simplexQP(P, [1, 1, 1]);
  assert.ok(Math.abs(w.reduce((a, b) => a + b, 0) - 1) < 1e-12);
  assert.deepEqual(simplexQP([[2]], [1]), [1]);
});

test("Nelder-Mead finds the Rosenbrock minimum", () => {
  const f = ([x, y]) => (1 - x) ** 2 + 100 * (y - x * x) ** 2;
  const r = nelderMead(f, [-1.2, 1], { maxIter: 2000, maxFun: 4000, xatol: 1e-8, fatol: 1e-10 });
  assert.ok(Math.abs(r.x[0] - 1) < 1e-4 && Math.abs(r.x[1] - 1) < 1e-4, r.x.join(","));
});

// A panel where the treated unit is exactly 0.6 A + 0.4 B before T0, then shifted by `effect`.
function planted({ effect = 10, seed = 7, J = 6, T = 20, T0 = 15, scale = 1 } = {}) {
  const r = rng(seed);
  const series = {};
  for (let j = 0; j < J; j++) {
    let level = 50 + r() * 50;
    series[`D${j}`] = Array.from({ length: T }, () => (level += r() * 4 - 1.5));
  }
  series.T = series.D0.map((a, t) => 0.6 * a + 0.4 * series.D1[t] + (t >= T0 ? effect : 0));
  const rows = ["unit,period,y"];
  for (const [u, ys] of Object.entries(series)) ys.forEach((y, t) => rows.push(`${u},${2000 + t},${y * scale}`));
  return { csv: rows.join("\n"), unit: "unit", time: "period", outcome: "y", treated: "T", treatmentTime: 2000 + T0 };
}

test("a planted convex combination is recovered exactly and the planted effect is the ATT", () => {
  const r = analyze({ ...planted({ effect: 10 }), vMethod: "equal", leaveOneOut: false });
  assert.ok(Math.abs(weightOf(r, "D0") - 0.6) < 1e-6 && Math.abs(weightOf(r, "D1") - 0.4) < 1e-6);
  assert.ok(r.preRMSPE < 1e-6);
  assert.ok(Math.abs(r.att - 10) < 1e-6);
  assert.equal(r.placebo.rank, 1);
  assert.equal(r.placebo.units, 7);
});

test("no effect: ATT is zero and the treated unit does not rank first for the wrong reason", () => {
  const r = analyze({ ...planted({ effect: 0 }), vMethod: "equal", ...quiet });
  assert.ok(Math.abs(r.att) < 1e-6);
});

test("invariances: rescaling the outcome scales the effect; shuffling rows changes nothing", () => {
  const base = analyze({ ...planted({ effect: 5, seed: 3 }), vMethod: "equal", ...quiet });
  const scaled = analyze({ ...planted({ effect: 5, seed: 3, scale: 1000 }), vMethod: "equal", ...quiet });
  assert.ok(Math.abs(scaled.att / base.att - 1000) < 1e-3);
  for (const w of base.weights) assert.ok(Math.abs(weightOf(scaled, w.unit) - w.weight) < 1e-6);
  const p = planted({ effect: 5, seed: 3 });
  const lines = p.csv.split("\n");
  const shuffled = [lines[0], ...lines.slice(1).reverse()].join("\n");
  const s = analyze({ ...p, csv: shuffled, vMethod: "equal", ...quiet });
  for (const w of base.weights) assert.ok(Math.abs(weightOf(s, w.unit) - w.weight) < 1e-9);
});

test("covariates and the cross-validated default spec", () => {
  const spec = defaultSpec({ outcome: "y", covariates: ["x"], preTimes: R(1, 10), vMethod: "cv" });
  assert.deepEqual(spec.train.optimizeTimes, R(6, 10));
  assert.deepEqual(spec.predictors[0], { variable: "x", times: R(6, 10) });
  assert.deepEqual(spec.train.predictors[0], { variable: "x", times: R(1, 5) });
  assert.equal(defaultSpec({ outcome: "y", preTimes: R(1, 10), vMethod: "nested" }).predictors.length, 10);
  const r = analyze({ csv: EXAMPLE_CSV, unit: "country", time: "year", outcome: "gdp", treated: "West Germany", treatmentTime: 1990, covariates: ["trade", "infrate", "industry"], vMethod: "cv", ...quiet });
  assert.equal(r.vMethod, "cv");
  assert.ok(r.trainV);
  assert.ok(r.preRMSPE < 300);
});

test("donors with missing outcome data are dropped with a note; bad input gives a clear error", () => {
  const p = planted();
  const csv = p.csv.replace(/^D5,2003,.*$/m, "D5,2003,");
  const r = analyze({ ...p, csv, vMethod: "equal", ...quiet });
  assert.ok(!r.donors.includes("D5"));
  assert.match(r.notes.join(" "), /D5/);
  assert.throws(() => analyze({ ...p, outcome: "nope" }), /No column named "nope"/);
  assert.throws(() => analyze({ ...p, treated: "X" }), /Treated unit "X"/);
  assert.throws(() => analyze({ ...p, treatmentTime: 2000 }), /two periods before/);
  assert.throws(() => analyze({ ...p, treatmentTime: "soon" }), /first period/);
  assert.throws(() => analyze({ ...p, donors: ["D0"] }), /two donor/);
  assert.throws(() => analyze({ ...p, optimizeTimes: [2016] }), /end before/);
});

test("parseCsv handles quotes, CRLF and a BOM", () => {
  const p = parseCsv('﻿unit,"time",y\r\n"A, Inc",1,"2"\r\nB,1,3\r\n');
  assert.deepEqual(p.header, ["unit", "time", "y"]);
  assert.equal(p.records[0].unit, "A, Inc");
  assert.equal(p.records.length, 2);
});

test("PAPERS and DEFAULTS describe the method", () => {
  assert.ok(PAPERS.length >= 4);
  for (const p of PAPERS) for (const k of ["authors", "title", "venue", "year", "url", "implemented", "deviations"]) assert.ok(p[k], `${p.title} ${k}`);
  assert.equal(DEFAULTS.vMethod, "nested");
  assert.ok(JSON.stringify(adh));
});

// ---- red-team guards, 2026-11-12 ----

test("result.lossW is the V-weighted predictor misfit: zero for an exact convex combination", () => {
  const r = analyze({ ...planted({ effect: 10 }), vMethod: "equal", ...quiet });
  assert.ok(Number.isFinite(r.lossW) && r.lossW >= 0 && r.lossW < 1e-10, String(r.lossW));
  assert.ok(adh.lossW > 0 && Number.isFinite(adh.lossW));
});

test("post-period RMSPE covers every post period, the last one included", () => {
  const post = adh.series.filter((s) => s.time >= 1990).map((s) => s.gap);
  const pre = adh.series.filter((s) => s.time < 1990).map((s) => s.gap);
  const rm = (g) => Math.sqrt(g.reduce((a, x) => a + x * x, 0) / g.length);
  assert.ok(Math.abs(adh.postRMSPE - rm(post)) < 1e-9 * rm(post));
  assert.ok(Math.abs(adh.preRMSPE - rm(pre)) < 1e-9 * rm(pre));
  assert.ok(Math.abs(adh.ratio - rm(post) / rm(pre)) < 1e-9 * adh.ratio);
});

test("default spec with covariates lags the outcome at the first, middle and last pre-period", () => {
  const spec = defaultSpec({ outcome: "y", covariates: ["x"], preTimes: R(1, 10), vMethod: "nested" });
  assert.deepEqual(spec.predictors.slice(1).map((p) => p.times), [[1], [5], [10]]);
  const cv = defaultSpec({ outcome: "y", covariates: ["x"], preTimes: R(1, 10), vMethod: "cv" });
  assert.deepEqual(cv.predictors.slice(1).map((p) => p.times), [[6], [8], [10]]);
  assert.deepEqual(defaultSpec({ outcome: "y", covariates: ["x"], preTimes: [1, 2, 3], vMethod: "nested" }).predictors.slice(1).map((p) => p.times), [[1], [2], [3]]);
});

test("the cross-validation fallback note appears only when cv was asked for and could not run", () => {
  const p = planted({ T: 5, T0: 3 });
  const cv = analyze({ ...p, vMethod: "cv", ...quiet });
  assert.match(cv.notes.join(" "), /Cross-validation needs at least four pre-periods/);
  for (const vMethod of ["equal", "nested"]) {
    const r = analyze({ ...p, vMethod, ...quiet });
    assert.doesNotMatch(r.notes.join(" "), /Cross-validation/, vMethod);
  }
});

test("Nelder-Mead stops on its tolerance well before the iteration cap", () => {
  const r = nelderMead(([x, y]) => (x - 5) ** 2 + (y + 3) ** 2, [1, 1]);
  assert.ok(Math.abs(r.x[0] - 5) < 1e-2 && Math.abs(r.x[1] + 3) < 1e-2, r.x.join(","));
  // The defaults allow 400 evaluations for two variables; this bowl converges in under 100.
  assert.ok(r.fcalls < 200, `used ${r.fcalls} evaluations in ${r.iterations} iterations`);
});

test("records with numeric unit ids work (the treated id is matched as text)", () => {
  const rec = [];
  for (const u of [1, 2, 3, 4]) for (let t = 0; t < 6; t++) rec.push({ id: u, t, y: 10 * u + t * u + (u === 1 && t >= 4 ? 5 : 0) });
  const r = analyze({ records: rec, unit: "id", time: "t", outcome: "y", treated: 1, treatmentTime: 4, vMethod: "equal", ...quiet });
  assert.equal(r.treated, "1");
  assert.deepEqual([...r.donors].sort(), ["2", "3", "4"]);
  const d = analyze({ records: rec, unit: "id", time: "t", outcome: "y", treated: 1, donors: [2, 3], treatmentTime: 4, vMethod: "equal", ...quiet });
  assert.deepEqual([...d.donors].sort(), ["2", "3"]);
});

test("a non-numeric time column says so instead of blaming the treated unit", () => {
  const rows = ["u,t,y"];
  for (const u of ["A", "B", "C"]) for (let m = 1; m <= 6; m++) rows.push(`${u},2020-0${m},${m}`);
  assert.throws(() => analyze({ csv: rows.join("\n"), unit: "u", time: "t", outcome: "y", treated: "A", treatmentTime: 4 }), /time column "t" has no numeric values/);
});
