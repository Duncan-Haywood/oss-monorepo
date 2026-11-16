import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  analyze, buildModel, kalmanFilter, kalmanSmoother, fitModel, concentratedLoglik,
  chiSquareSf, fCdf, normalQuantile, betaInc, toCsv, readSeries, PAPERS,
} from "./engine.mjs";

const here = (p) => new URL(p, import.meta.url);
const REF = JSON.parse(readFileSync(here("./eval/reference.json"), "utf8"));
const NILE = readFileSync(here("./data/nile.csv"), "utf8");
const UK = readFileSync(here("./data/uk-driver-deaths.csv"), "utf8");

const close = (a, b, rel, abs, what) => {
  const tol = Math.max(abs, rel * Math.max(Math.abs(a), Math.abs(b)));
  assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} vs ${b} (tol ${tol})`);
};

for (const c of REF.cases) {
  test(`filter and smoother match statsmodels ${REF.statsmodels} at equal variances: ${c.name}`, () => {
    const model = buildModel(c.spec, c.variances);
    const f = kalmanFilter(model, c.y);
    const s = kalmanSmoother(model, f);
    close(f.loglik, c.loglik, 1e-9, 1e-7, "loglik");
    const n = c.y.length;
    const scaleY = Math.max(...c.y.filter((v) => v != null).map(Math.abs));
    for (let t = 0; t < n; t++) {
      for (let i = 0; i < c.smoothedState.length; i++) {
        close(s.state[t][i], c.smoothedState[i][t], 1e-7, 1e-7 * scaleY, `state ${i} at ${t}`);
        close(s.stateVar[t][i][i], c.smoothedStateVar[i][t], 1e-6, 1e-9 * scaleY * scaleY, `state var ${i} at ${t}`);
      }
      close(s.eps[t].mean, c.smoothedIrregular[t], 1e-6, 1e-7 * scaleY, `irregular at ${t}`);
      close(s.eps[t].var, c.smoothedIrregularVar[t], 1e-6, 1e-9 * scaleY * scaleY, `irregular var at ${t}`);
      close(s.eta[t].mean[0], c.smoothedLevelDisturbance[t], 1e-6, 1e-7 * scaleY, `level disturbance at ${t}`);
      close(s.eta[t].varDiag[0], c.smoothedLevelDisturbanceVar[t], 1e-6, 1e-9 * scaleY * scaleY, `level disturbance var at ${t}`);
      const st = f.steps[t];
      if (st.kind === "std") {
        close(st.v, c.forecastError[t], 1e-7, 1e-7 * scaleY, `one-step error at ${t}`);
        close(st.F, c.forecastErrorVar[t], 1e-7, 1e-9, `one-step variance at ${t}`);
      }
    }
  });

  test(`maximum likelihood at least as high as statsmodels' fit: ${c.name}`, () => {
    const fit = fitModel(c.spec, c.y);
    assert.ok(fit.loglik >= c.statsmodelsMleLoglik - 1e-5, `${fit.loglik} < ${c.statsmodelsMleLoglik}`);
    // and the reported loglik is the unconcentrated one at the reported variances
    const f = kalmanFilter(buildModel(c.spec, fit.variances), c.y);
    close(f.loglik, fit.loglik, 1e-9, 1e-7, "concentrated vs full loglik");
  });
}

test("forecasts match statsmodels (Nile, local level)", () => {
  const c = REF.cases.find((x) => x.name === "nile-level");
  const r = analyze({ y: c.y, slope: "none", season: 0, horizon: 8 });
  // engine fits its own variances; compare at the reference ones instead
  const model = buildModel(c.spec, c.variances);
  const f = kalmanFilter(model, c.y);
  assert.equal(f.stillDiffuse, false);
  close(f.aEnd[0], c.forecastMean[0], 1e-9, 1e-6, "forecast mean");
  close(f.PstarEnd[0][0] + c.variances.irregular, c.forecastVar[0], 1e-9, 1e-6, "forecast var");
  assert.equal(r.forecast.length, 8);
  for (let h = 1; h < 8; h++) assert.ok(r.forecast[h].hi - r.forecast[h].lo > r.forecast[h - 1].hi - r.forecast[h - 1].lo);
});

test("Nile local level reproduces Durbin & Koopman's published MLE (sec. 2.10.3: 15099 and 1469.1)", () => {
  const r = analyze({ csv: NILE, slope: "none" });
  close(r.model.variances.irregular, 15099, 2e-4, 0, "irregular");
  close(r.model.variances.level, 1469.1, 5e-4, 0, "level");
  // the 1898/1899 drop (Aswan dam) is the largest level shift; 1913 the largest outlier
  assert.equal(r.shifts[0].from, "1898");
  assert.equal(r.shifts[0].to, "1899");
  assert.ok(r.shifts[0].tStat < -2.5);
  assert.equal(r.outliers[0].label, "1913");
});

test("UK driver deaths (logs, monthly): auto season 12 finds the February 1983 seat-belt law as the largest shift", () => {
  const r = analyze({ csv: UK, log: true });
  assert.equal(r.model.season, 12);
  assert.equal(r.shifts[0].from, "1983-01");
  assert.equal(r.shifts[0].to, "1983-02");
  assert.ok(r.shifts[0].tStat < -3);
  const ref = REF.cases.find((x) => x.name === "uk-log-level-seasonal");
  if (r.model.slope === "none") close(r.model.loglik, ref.statsmodelsMleLoglik, 1e-6, 1e-4, "loglik");
});

test("exact diffuse smoother agrees with a large-kappa approximate diffuse filter", () => {
  // Independent internal check: replace P_inf by kappa * I in an ordinary filter.
  const c = REF.cases.find((x) => x.name === "nile-gaps-trend");
  const model = buildModel(c.spec, c.variances);
  const exact = kalmanSmoother(model, kalmanFilter(model, c.y));
  const kappa = 1e9;
  const approxModel = { ...model };
  // Ordinary filter: emulate by making the exact filter see P_star = kappa I and P_inf = 0.
  const { m, T, Z, H, RQR } = model;
  let a = new Array(m).fill(0);
  let P = Array.from({ length: m }, (_, i) => Array.from({ length: m }, (_, j) => (i === j ? kappa : 0)));
  const as = [], Ps = [], vs = [], Fs = [], Ks = [];
  const mul = (A, B) => A.map((r) => B[0].map((_, j) => r.reduce((s, v, k) => s + v * B[k][j], 0)));
  const Tt = T[0].map((_, j) => T.map((r) => r[j]));
  for (let t = 0; t < c.y.length; t++) {
    as.push(a); Ps.push(P);
    if (c.y[t] == null) {
      vs.push(null); Fs.push(null); Ks.push(null);
      a = T.map((r) => r.reduce((s, v, k) => s + v * a[k], 0));
      P = mul(mul(T, P), Tt).map((r, i) => r.map((v, j) => v + RQR[i][j]));
      continue;
    }
    const PZ = P.map((r) => r.reduce((s, v, k) => s + v * Z[k], 0));
    const F = Z.reduce((s, v, k) => s + v * PZ[k], 0) + H;
    const v = c.y[t] - Z.reduce((s, z, k) => s + z * a[k], 0);
    const K = T.map((r) => r.reduce((s, x, k) => s + x * PZ[k], 0) / F);
    vs.push(v); Fs.push(F); Ks.push(K);
    a = T.map((r, i) => r.reduce((s, x, k) => s + x * a[k], 0) + K[i] * v);
    const L = T.map((r, i) => r.map((x, j) => x - K[i] * Z[j]));
    P = mul(mul(T, P), L[0].map((_, j) => L.map((r) => r[j]))).map((r, i) => r.map((x, j) => x + RQR[i][j]));
  }
  let r = new Array(m).fill(0);
  for (let t = c.y.length - 1; t >= 0; t--) {
    if (vs[t] == null) r = Tt.map((row) => row.reduce((s, x, k) => s + x * r[k], 0));
    else {
      const L = T.map((row, i) => row.map((x, j) => x - Ks[t][i] * Z[j]));
      r = Z.map((z, i) => (z * vs[t]) / Fs[t] + L.reduce((s, row, k) => s + row[i] * r[k], 0));
    }
    const smoothed = as[t].map((x, i) => x + Ps[t][i].reduce((s, p, k) => s + p * r[k], 0));
    close(exact.state[t][0], smoothed[0], 1e-4, 1e-2, `level at ${t}`);
  }
  void approxModel;
});

test("concentrated loglik is maximised by the scale it reports", () => {
  const y = REF.cases[0].y;
  const c = concentratedLoglik({ slope: "none", season: 0 }, { level: 0.1 }, y);
  for (const k of [0.9, 1.1]) {
    const f = kalmanFilter(buildModel({ slope: "none", season: 0 }, { irregular: c.scale * k, level: 0.1 * c.scale * k }), y);
    assert.ok(f.loglik < c.loglik);
  }
  const f = kalmanFilter(buildModel({ slope: "none", season: 0 }, { irregular: c.scale, level: 0.1 * c.scale }), y);
  close(f.loglik, c.loglik, 1e-10, 1e-8, "at the scale");
});

test("affine invariance: shifting and scaling the data shifts and scales the level; t statistics unchanged", () => {
  const y = REF.cases[0].y;
  const a = analyze({ y, slope: "none", season: 0 });
  const b = analyze({ y: y.map((v) => 3 * v - 500), slope: "none", season: 0 });
  close(b.model.signalToNoise, a.model.signalToNoise, 1e-4, 1e-8, "snr");
  for (const t of [0, 27, 50, 99]) {
    close(b.points[t].level, 3 * a.points[t].level - 500, 1e-5, 1e-3, `level ${t}`);
    close(b.points[t].shiftT ?? 0, a.points[t].shiftT ?? 0, 1e-3, 1e-4, `shift t ${t}`);
  }
});

test("missing values: smoothed through, wider band, no flags at the gap", () => {
  const y = REF.cases[0].y.slice();
  y[40] = null;
  const r = analyze({ y, slope: "none", season: 0 });
  const w = (p) => p.levelHi - p.levelLo;
  assert.ok(w(r.points[40]) > w(r.points[39]) && w(r.points[40]) > w(r.points[41]));
  assert.equal(r.points[40].outlierT, undefined);
  assert.match(r.summary, /1 missing value/);
});

test("a pure noise series gives a level variance of zero and a flat line", () => {
  let s = 12345;
  const rand = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
  const y = Array.from({ length: 120 }, () => {
    const u = rand() || 1e-12, v = rand();
    return 50 + 2 * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  });
  const r = analyze({ y, slope: "none", season: 0 });
  assert.ok(r.model.variances.level < 1e-3 * r.model.variances.irregular);
  const lv = r.points.map((p) => p.level);
  assert.ok(Math.max(...lv) - Math.min(...lv) < 1e-3);
});

test("a step in the level is found as a shift, a spike as an outlier", () => {
  const y = Array.from({ length: 80 }, (_, i) => (i < 40 ? 10 : 16) + 0.8 * Math.sin(i * 2.3) + 0.5 * Math.cos(i * 0.7));
  y[60] += 9;
  const r = analyze({ y, slope: "none", season: 0 });
  assert.equal(r.shifts[0].t, 39);
  assert.equal(r.outliers[0].t, 60);
});

test("special functions against known values", () => {
  close(chiSquareSf(3.841458820694124, 1), 0.05, 1e-9, 0, "chi2 1df");
  close(chiSquareSf(18.307038053275146, 10), 0.05, 1e-9, 0, "chi2 10df");
  close(fCdf(1, 7, 7), 0.5, 1e-12, 0, "F median symmetric");
  close(fCdf(2.9782370160182, 10, 10), 0.95, 1e-8, 0, "F(10,10) 95%");
  close(betaInc(2, 3, 0.4), 0.5248, 1e-10, 0, "I_0.4(2,3)");
  close(normalQuantile(0.95), 1.6448536269514722, 1e-12, 0, "z 0.95");
});

test("CSV reading: picks time and value columns, accepts NA, warns on text", () => {
  const s = readSeries("month,sales,region\n2020-01,10,a\n2020-02,NA,a\n2020-03,x,a\n2020-04,12,a\n");
  assert.equal(s.timeColumn, "month");
  assert.equal(s.column, "sales");
  assert.deepEqual(s.y, [10, null, null, 12]);
  assert.deepEqual(s.badLines, [4]);
  assert.ok(analyze({ csv: "a\n1\n2" }).error);
  assert.ok(analyze({ csv: NILE, log: true, y: undefined }).summary);
  assert.ok(analyze({ y: [1, 2, -3, 4, 5, 6, 7], log: true }).error);
});

test("CSV output has one row per point plus forecasts", () => {
  const r = analyze({ csv: NILE, slope: "none", horizon: 3 });
  const lines = toCsv(r).trim().split("\n");
  assert.equal(lines.length, 1 + 100 + 3);
  assert.match(lines[0], /^label,y,level,level_lo,level_hi/);
});

test("result is JSON-serialisable and every paper has the documented fields", () => {
  const r = analyze({ csv: NILE });
  assert.doesNotThrow(() => JSON.stringify(r));
  for (const p of PAPERS) for (const k of ["authors", "title", "venue", "year", "url", "implemented", "deviations"]) assert.ok(p[k] != null, k);
});
