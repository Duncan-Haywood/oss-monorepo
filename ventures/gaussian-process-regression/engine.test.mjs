import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  KERNELS, PAPERS, kernelLayout, kernelAt, logMarginal, predict, predictLinearMean, leaveOneOut, fitKernel,
  minimizeBox, cholesky, decimalYear, formatDate, parseCsv, analyze, toCsv, csvCell, olsLine, rng,
} from "./engine.mjs";
import { scoreKernel } from "./eval/holdout.mjs";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const INPUTS = JSON.parse(read("./eval/inputs.json"));
const REF = JSON.parse(read("./eval/reference.json"));
const n = INPUTS.y.length;
const meanY = INPUTS.y.reduce((a, b) => a + b, 0) / n;
const sdY = Math.sqrt(INPUTS.y.reduce((a, b) => a + (b - meanY) ** 2, 0) / n);
const yz = INPUTS.y.map((v) => (v - meanY) / sdY);

test("reference was produced by scikit-learn 1.9.1 on the bundled file", () => {
  assert.equal(REF.sklearn, "1.9.1");
  assert.equal(n, 201);
  assert.deepEqual(Object.keys(REF.kernels), Object.keys(KERNELS));
  const csv = parseCsv(read("./data/mauna-loa-co2-2010-2026.csv"));
  assert.deepEqual(csv.rows.map((r) => decimalYear(r.cells[0])), INPUTS.x);
});

test("theta layout is scikit-learn's theta order for every kernel", () => {
  const names = { variance: "constant_value", length: "length_scale", alpha: "alpha", periodLength: "length_scale", period: "periodicity", noise: "noise_level" };
  for (const k of Object.keys(KERNELS)) {
    const layout = kernelLayout(k);
    const order = REF.kernels[k].theta_order;
    assert.equal(layout.length, order.length, k);
    layout.forEach((p, i) => assert.ok(order[i].endsWith(names[p.kind]), `${k}[${i}]: ${p.kind} vs ${order[i]}`));
  }
});

for (const k of Object.keys(KERNELS)) {
  test(`${k}: log marginal likelihood, gradient and predictions agree with scikit-learn to 1e-9`, () => {
    const spec = INPUTS.kernels[k];
    const R = REF.kernels[k];
    const r = logMarginal(k, spec.theta, INPUTS.x, yz, { grad: true });
    assert.ok(Math.abs(r.lml - R.lml) < 1e-9, `lml ${r.lml} vs ${R.lml}`);
    r.grad.forEach((g, i) => assert.ok(Math.abs(g - R.grad[i]) < 1e-9 * Math.max(1, Math.abs(R.grad[i])), `grad[${i}] ${g} vs ${R.grad[i]}`));
    const p = predict(k, spec.theta, INPUTS.x, yz, INPUTS.xNew);
    p.forEach((q, i) => {
      assert.ok(Math.abs(q.mean * sdY + meanY - R.mean[i]) < 1e-9, `mean[${i}]`);
      assert.ok(Math.abs(Math.sqrt(q.obsVar) * sdY - R.sd[i]) < 1e-9, `sd[${i}]`);
    });
  });
}

test("from scikit-learn's own start and bounds, the fit reaches its optimum (six kernels) or a KKT point (periodic)", () => {
  for (const k of Object.keys(KERNELS)) {
    const spec = INPUTS.kernels[k];
    const bounds = spec.bounds.map((b, i) => ({ lo: b[0], hi: b[1], init: spec.start[i] }));
    const f = fitKernel(k, INPUTS.x, yz, { restarts: 0, bounds });
    if (k === "periodic") {
      // Both optimisers stop at a local optimum; ours is the all-noise corner.
      // Check it is one: every free component of the projected gradient is ~0.
      const g = logMarginal(k, f.theta, INPUTS.x, yz, { grad: true }).grad;
      f.theta.forEach((t, i) => {
        const atLo = Math.abs(Math.log(t / spec.bounds[i][0])) < 1e-3, atHi = Math.abs(Math.log(t / spec.bounds[i][1])) < 1e-3;
        if (atLo) assert.ok(g[i] < 1e-3, `periodic[${i}] at lower bound wants to go lower`);
        else if (atHi) assert.ok(g[i] > -1e-3, `periodic[${i}] at upper bound wants to go higher`);
        else assert.ok(Math.abs(g[i]) < 1e-3, `periodic[${i}] gradient ${g[i]}`);
      });
      assert.ok(f.lml < REF.kernels[k].fit_lml, "documented: scikit-learn's L-BFGS-B finds a higher peak here");
    } else {
      assert.ok(f.lml >= REF.kernels[k].fit_lml - 1e-3, `${k}: ${f.lml} < sklearn ${REF.kernels[k].fit_lml}`);
    }
  }
});

test("gradient matches central finite differences on random hyperparameters", () => {
  const rand = rng(7);
  const x = Array.from({ length: 40 }, (_, i) => i * 0.37 + rand() * 0.2);
  const y = x.map((v) => Math.sin(v) + 0.3 * Math.cos(3 * v) + 0.1 * (rand() - 0.5));
  for (const k of Object.keys(KERNELS)) {
    const theta = kernelLayout(k).map((p) => (p.kind === "period" ? 2 + rand() : p.kind === "noise" ? 0.05 + 0.1 * rand() : 0.5 + 1.5 * rand()));
    const g = logMarginal(k, theta, x, y, { grad: true }).grad;
    theta.forEach((t, i) => {
      const h = 1e-5;
      const up = theta.slice(), dn = theta.slice();
      up[i] = t * Math.exp(h); dn[i] = t * Math.exp(-h);
      const fd = (logMarginal(k, up, x, y).lml - logMarginal(k, dn, x, y).lml) / (2 * h);
      assert.ok(Math.abs(fd - g[i]) < 1e-5 * Math.max(1, Math.abs(fd)), `${k}[${i}] analytic ${g[i]} vs fd ${fd}`);
    });
  }
});

test("closed-form leave-one-out equals refitting without each point (R&W eqs. 5.10-5.12)", () => {
  const x = INPUTS.x.slice(0, 30), y = yz.slice(0, 30);
  const theta = INPUTS.kernels.rbf.theta;
  const loo = leaveOneOut("rbf", theta, x, y);
  for (const i of [0, 7, 29]) {
    const xs = x.filter((_, j) => j !== i), ys = y.filter((_, j) => j !== i);
    const [p] = predict("rbf", theta, xs, ys, [x[i]]);
    assert.ok(Math.abs(p.mean - loo[i].mean) < 1e-8, `mean ${i}`);
    assert.ok(Math.abs(p.obsVar - loo[i].variance) < 1e-8, `var ${i}`);
  }
});

test("posterior interpolates noise-free data and reverts to the mean far away", () => {
  const x = [0, 1, 2, 3, 4], y = [0.3, -0.2, 0.5, 0.1, -0.4];
  const theta = [1, 1, 1e-8];
  const p = predict("rbf", theta, x, y, [...x, 100]);
  x.forEach((_, i) => {
    assert.ok(Math.abs(p[i].mean - y[i]) < 1e-5);
    assert.ok(p[i].latentVar < 1e-5);
  });
  assert.ok(Math.abs(p[5].mean) < 1e-9);
  assert.ok(Math.abs(p[5].latentVar - 1) < 1e-9);
});

test("linear mean: an exact line is recovered and its uncertainty grows far from the data", () => {
  const x = Array.from({ length: 20 }, (_, i) => i);
  const y = x.map((v) => 2 + 0.5 * v);
  const theta = [0.01, 3, 1e-4];
  const p = predictLinearMean("rbf", theta, x, y, [5, 40, 400]);
  assert.ok(Math.abs(p.beta.slope - 0.5) < 1e-6 && Math.abs(p.beta.intercept - 2) < 1e-5);
  assert.ok(Math.abs(p[1].mean - 22) < 1e-4 && Math.abs(p[2].mean - 202) < 1e-3);
  assert.ok(p[0].latentVar < p[1].latentVar && p[1].latentVar < p[2].latentVar);
  const ols = olsLine([0, 1, 2], [1, 3, 5]);
  assert.deepEqual([ols.intercept, ols.slope], [1, 2]);
});

test("kernel values: k(0) is the signal variance and every kernel falls with distance near 0", () => {
  for (const k of Object.keys(KERNELS)) {
    const theta = kernelLayout(k).map((p) => (p.kind === "variance" ? 2 : p.kind === "period" ? 10 : 1));
    const nTerms = KERNELS[k].terms.length;
    assert.ok(Math.abs(kernelAt(k, theta, 0) - 2 * nTerms) < 1e-12, k);
    assert.ok(kernelAt(k, theta, 0.5) < kernelAt(k, theta, 0), k);
  }
  // periodic: exactly the same one period later
  assert.ok(Math.abs(kernelAt("periodic", [1, 1, 3, 0], 3) - 1) < 1e-12);
});

test("cholesky rejects a matrix that is not positive definite", () => {
  assert.equal(cholesky(Float64Array.from([1, 2, 2, 1]), 2), false);
  const A = Float64Array.from([4, 2, 2, 3]);
  assert.equal(cholesky(A, 2), true);
  assert.deepEqual([...A].map((v) => +v.toFixed(12)), [2, 0, 1, +Math.sqrt(2).toFixed(12)]);
});

test("minimizeBox finds a bounded quadratic's minimum, at a bound when it must", () => {
  const fg = (v) => [(v[0] - 3) ** 2 + 10 * (v[1] + 1) ** 2, [2 * (v[0] - 3), 20 * (v[1] + 1)]];
  const r = minimizeBox(fg, [0, 0], [-5, 0], [5, 5]);
  assert.ok(Math.abs(r.x[0] - 3) < 1e-5);
  assert.equal(r.x[1], 0);
  assert.ok(r.converged);
});

test("dates: decimal years round trip, and bad dates are refused", () => {
  assert.ok(Math.abs(decimalYear("2024-07") - (2024 + 6.5 / 12)) < 1e-12);
  assert.equal(formatDate(decimalYear("2024-07")), "2024-07");
  assert.equal(formatDate(decimalYear("2023-12")), "2023-12");
  assert.equal(formatDate(decimalYear("2024-02-29"), false), "2024-02-29");
  assert.ok(Number.isNaN(decimalYear("2023-02-30")));
  assert.ok(Number.isNaN(decimalYear("2023-13")));
});

test("analyze on the example with the winning kernel: summary, units, LOO, forecast", () => {
  const r = analyze({ csv: read("./data/mauna-loa-co2-2010-2026.csv"), kernel: "smooth-quasiperiodic", predictAt: "2027-01, 2030-01" });
  assert.equal(r.n, 201);
  assert.equal(r.dateMode, true);
  assert.equal(r.mean, "linear");
  assert.ok(r.trend.slope > 2.3 && r.trend.slope < 2.6, `trend ${r.trend.slope} ppm/yr`);
  const period = r.hyperparameters.find((h) => h.kind === "period");
  assert.ok(Math.abs(period.value - 1) < 0.01, "a one-year cycle");
  const noise = r.hyperparameters.find((h) => h.kind === "noise");
  assert.ok(noise.value > 0.2 && noise.value < 0.4, `noise SD ${noise.value} ppm`);
  assert.ok(r.loo.coverage95 > 0.92 && r.loo.coverage95 < 0.99);
  assert.equal(r.loo.outliers[0].xLabel, "2016-04");
  assert.equal(r.predictions.length, 2);
  assert.ok(r.predictions.every((p) => p.beyondData && p.lo < p.mean && p.mean < p.hi && p.obsLo <= p.lo));
  assert.ok(r.predictions[1].hi - r.predictions[1].lo > r.predictions[0].hi - r.predictions[0].lo, "band widens with distance");
  assert.match(r.summary, /repeats every 1 year;/);
  assert.match(r.summary, /straight-line trend of \+2\.\d+ co2_ppm per year/);
  const csv = toCsv(r).trim().split("\n");
  assert.equal(csv[0], "x,mean,sd,lo95,hi95,new_reading_lo95,new_reading_hi95");
  assert.equal(csv.length, 241);
  assert.match(csv[1], /^2010-01,/);
});

test("held-out forecast numbers on the page still reproduce (eval/holdout.json)", () => {
  const H = JSON.parse(read("./eval/holdout.json"));
  const html = read("./index.html");
  for (const m of ["linear", "constant"]) {
    const best = H.results[m][0];
    assert.equal(best.kernel, "smooth-quasiperiodic");
    const again = scoreKernel(best.kernel, m);
    assert.ok(Math.abs(again.rmse - best.rmse) < 0.02, `${m}: rmse ${again.rmse} vs stored ${best.rmse}`);
    assert.ok(Math.abs(again.coverage95 - best.coverage95) < 0.06, `${m}: coverage`);
  }
  const lin = H.results.linear[0], con = H.results.constant[0];
  assert.ok(html.includes(`${lin.rmse.toFixed(2)} ppm`), "linear RMSE on page");
  assert.ok(html.includes(`(${H.seasonalNaive.rmse.toFixed(2)} ppm)`), "naive RMSE on page");
  assert.ok(html.includes(`${Math.round(lin.coverage95 * 100)}% of the`), "linear coverage on page");
  assert.ok(html.includes(`${con.rmse.toFixed(2)} ppm and the band held ${Math.round(con.coverage95 * 100)}%`), "constant-mean numbers on page");
});

test("auto mode ranks kernels by evidence on a small periodic series", () => {
  const rand = rng(3);
  const x = Array.from({ length: 60 }, (_, i) => i);
  const y = x.map((v) => Math.sin((2 * Math.PI * v) / 12) + 0.1 * (rand() - 0.5));
  const r = analyze({ x, y, restarts: 1, mean: "constant" });
  assert.equal(r.comparison.length, 7);
  assert.equal(r.comparison[0].delta, 0);
  assert.ok(r.comparison.every((c, i) => i === 0 || c.delta <= r.comparison[i - 1].delta));
  assert.ok(["periodic", "quasiperiodic", "smooth-quasiperiodic"].includes(r.kernel), r.kernel);
  const p = r.hyperparameters.find((h) => h.kind === "period");
  assert.ok(Math.abs(p.value - 12) < 0.1, `period ${p.value}`);
});

test("errors and edge cases are reported, not thrown", () => {
  assert.match(analyze({ csv: "" }).error, /empty/);
  assert.match(analyze({ csv: "x,y\n1,2\n2,3" }).error, /at least 5/);
  assert.match(analyze({ csv: "x,y\n1,2\n1,3\n1,4\n1,5\n1,6" }).error, /same/);
  assert.match(analyze({ csv: "x,y\n1,2\n2,2\n3,2\n4,2\n5,2" }).error, /nothing to fit/);
  assert.match(analyze({ csv: "a,b\n1,2\n2,3\n3,4\n4,5\n5,6", xColumn: "zz" }).error, /No column named "zz"/);
  assert.match(analyze({ csv: "a,b\n1,2", kernel: "nope" }).error, /Unknown kernel|at least 5/);
  for (const kernel of ["nope", "constructor", "toString"]) assert.match(analyze({ x: [1, 2, 3, 4, 5, 6], y: [1, 2, 1, 2, 1, 2], kernel }).error, /Unknown kernel/);
  assert.match(analyze({ x: [1, 2, 3, 4, 5, 6], y: [1, 2, 1, 2, 1, 2], mean: "cubic" }).error, /Unknown mean/);
  const big = Array.from({ length: 1501 }, (_, i) => `${i},${i % 7}`).join("\n");
  assert.match(analyze({ csv: `x,y\n${big}` }).error, /up to 1,500/);
  const r = analyze({ csv: "t,v,w\n1,2,9\n2,,9\n3,2.5,9\n4,3.1,9\n5,2.9,9\n6,3.6,9", kernel: "rbf", restarts: 0 });
  assert.ok(!r.error);
  assert.equal(r.n, 5);
  assert.ok(r.warnings.some((w) => /Skipped 1 row/.test(w)));
  assert.ok(r.warnings.some((w) => /left out "w"/.test(w)));
});

test("CSV export guards against spreadsheet formulas", () => {
  assert.equal(csvCell("=SUM(A1)"), "'=SUM(A1)");
  assert.equal(csvCell("-1.5"), "-1.5");
  assert.equal(csvCell('a,"b"'), '"a,""b"""');
});

test("the papers carry what was implemented and how we deviate", () => {
  assert.ok(PAPERS.length >= 3);
  for (const p of PAPERS) for (const k of ["authors", "title", "venue", "year", "url", "implemented", "deviations"]) assert.ok(p[k], `${p.title}: ${k}`);
});
