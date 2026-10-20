import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  analyze, DEFAULTS, PAPERS, METHODS, rng, normal, quantileIndex, conformalQuantile, ridgeSolve, ridgeFit, ridgeCV,
  quantileRegression, pinballLoss, pinball, fitConformal, parseCsv, prepareData, solve,
} from "./engine.mjs";

const diabetes = readFileSync(new URL("./data/diabetes.csv", import.meta.url), "utf8");

// ------------------------------------------------------------ (b) quantile index

test("quantile index is ceil((n+1)(1-alpha)), checked exactly with integer arithmetic", () => {
  // coverage = p/q as integers, so ceil((n+1)p/q) = floor(((n+1)p + q - 1)/q) has no rounding.
  const levels = [[1, 2], [4, 5], [9, 10], [19, 20], [39, 40], [99, 100], [2, 3], [3, 4]];
  for (const [p, q] of levels) {
    for (let n = 1; n <= 400; n++) {
      const exact = Math.floor(((n + 1) * p + q - 1) / q);
      assert.equal(quantileIndex(n, 1 - p / q), exact, `n=${n}, coverage=${p}/${q}`);
    }
  }
});

test("hand-checked small cases, including the infinite interval", () => {
  assert.equal(quantileIndex(9, 0.1), 9); // 10*0.9 = 9 exactly; float must not round it up to 10
  assert.equal(quantileIndex(19, 0.1), 18);
  assert.equal(quantileIndex(10, 0.1), 10); // ceil(9.9)
  assert.equal(quantileIndex(99, 0.1), 90);
  assert.equal(quantileIndex(4, 0.2), 4);
  assert.equal(quantileIndex(19, 0.05), 19);
  const scores = [5, 1, 4, 2, 3, 9, 8, 7, 6];
  assert.deepEqual(conformalQuantile(scores, 0.1), { k: 9, n: 9, q: 9, infinite: false });
  assert.deepEqual(conformalQuantile(scores, 0.2), { k: 8, n: 9, q: 8, infinite: false });
  const inf = conformalQuantile(scores.slice(0, 8), 0.1); // ceil(9*0.9)=ceil(8.1)=9 > 8
  assert.equal(inf.k, 9);
  assert.equal(inf.q, Infinity);
  assert.equal(inf.infinite, true);
});

test("the k-th of n exchangeable scores covers a new score with probability exactly k/(n+1)", () => {
  const rand = rng(2024);
  for (const [n, alpha] of [[9, 0.1], [8, 0.2], [24, 0.1]]) {
    const reps = 20000;
    let hit = 0;
    for (let r = 0; r < reps; r++) {
      const s = Array.from({ length: n }, rand);
      if (rand() <= conformalQuantile(s, alpha).q) hit++;
    }
    const expected = quantileIndex(n, alpha) / (n + 1);
    assert.ok(Math.abs(hit / reps - expected) < 0.008, `n=${n} alpha=${alpha}: ${hit / reps} vs ${expected}`);
  }
});

// ------------------------------------------------------------ (c) ridge

test("ridgeSolve matches the closed-form normal equations on a hand-checkable problem", () => {
  // Z'Z = [[2,1],[1,2]], +I = [[3,1],[1,3]], Z'y = [4,5]; inverse = (1/8)[[3,-1],[-1,3]] -> [7/8, 11/8].
  const beta = ridgeSolve([[1, 0], [0, 1], [1, 1]], [1, 2, 3], 1);
  assert.ok(Math.abs(beta[0] - 7 / 8) < 1e-12);
  assert.ok(Math.abs(beta[1] - 11 / 8) < 1e-12);
  // lambda = 0 is ordinary least squares: (Z'Z)^-1 Z'y = (1/3)[[2,-1],[-1,2]][4,5] = [1, 2].
  const ols = ridgeSolve([[1, 0], [0, 1], [1, 1]], [1, 2, 3], 0);
  assert.ok(Math.abs(ols[0] - 1) < 1e-12 && Math.abs(ols[1] - 2) < 1e-12);
});

test("ridgeFit with standardisation agrees with a direct solve of the same penalised problem", () => {
  const rand = rng(5);
  const X = Array.from({ length: 30 }, () => [normal(rand) * 3 + 10, normal(rand)]);
  const y = X.map(([a, b]) => 4 + 0.5 * a - 2 * b + normal(rand));
  const lam = 0.3;
  const m = ridgeFit(X, y, lam);
  // Direct: centre, divide by population sd, solve (Z'Z + lam n I) b = Z'(y - ybar).
  const n = X.length;
  const mean = [0, 1].map((j) => X.reduce((s, x) => s + x[j], 0) / n);
  const sd = [0, 1].map((j) => Math.sqrt(X.reduce((s, x) => s + (x[j] - mean[j]) ** 2, 0) / n));
  const Z = X.map((x) => x.map((v, j) => (v - mean[j]) / sd[j]));
  const ybar = y.reduce((a, b) => a + b, 0) / n;
  const G = [[0, 0], [0, 0]], r = [0, 0];
  Z.forEach((z, i) => { for (let a = 0; a < 2; a++) { r[a] += z[a] * (y[i] - ybar); for (let b = 0; b < 2; b++) G[a][b] += z[a] * z[b]; } });
  G[0][0] += lam * n; G[1][1] += lam * n;
  const b = solve(G, r);
  assert.ok(Math.abs(m.coef[0] - b[0] / sd[0]) < 1e-10);
  assert.ok(Math.abs(m.coef[1] - b[1] / sd[1]) < 1e-10);
  // Near-zero penalty on exact linear data recovers the coefficients.
  const exact = ridgeFit(X, X.map(([a, c]) => 4 + 0.5 * a - 2 * c), 1e-12);
  assert.ok(Math.abs(exact.intercept - 4) < 1e-6 && Math.abs(exact.coef[0] - 0.5) < 1e-7 && Math.abs(exact.coef[1] + 2) < 1e-7);
});

test("ridgeCV picks a small penalty for clean signal and a larger one for pure noise", () => {
  const rand = rng(9);
  const X = Array.from({ length: 80 }, () => Array.from({ length: 5 }, () => normal(rand)));
  const signal = ridgeCV(X, X.map((x) => x[0] - x[1] + 0.05 * normal(rand)));
  const noise = ridgeCV(X, X.map(() => normal(rand)));
  assert.ok(signal.lambda <= 0.01, `signal lambda ${signal.lambda}`);
  assert.ok(noise.lambda > signal.lambda, `noise lambda ${noise.lambda}`);
  assert.equal(signal.oofResiduals.length, 80);
});

// ------------------------------------------------------------ (d) quantile regression

test("quantile regression recovers exact coefficients on noiseless data at every level", () => {
  const rand = rng(11);
  const X = Array.from({ length: 60 }, () => [normal(rand), normal(rand) * 4 + 2]);
  const y = X.map(([a, b]) => 2 + 3 * a - b);
  for (const tau of [0.05, 0.25, 0.5, 0.9, 0.95]) {
    const f = quantileRegression(X, y, tau);
    assert.ok(Math.abs(f.intercept - 2) < 1e-7, `tau ${tau} intercept ${f.intercept}`);
    assert.ok(Math.abs(f.coef[0] - 3) < 1e-7 && Math.abs(f.coef[1] + 1) < 1e-7, `tau ${tau} coef ${f.coef}`);
  }
});

test("quantile regression on near-noiseless data with known noise quantiles", () => {
  // y = 1 + 2x + e, e uniform on [-0.001, 0.001]: the tau-quantile line is 1 + 2x + (2tau - 1)*0.001.
  const rand = rng(12);
  const X = Array.from({ length: 400 }, () => [rand() * 10]);
  const y = X.map(([x]) => 1 + 2 * x + (rand() * 2 - 1) * 0.001);
  for (const tau of [0.1, 0.5, 0.9]) {
    const f = quantileRegression(X, y, tau);
    assert.ok(Math.abs(f.coef[0] - 2) < 2e-4, `slope ${f.coef[0]}`);
    assert.ok(Math.abs(f.intercept - (1 + (2 * tau - 1) * 0.001)) < 5e-4, `intercept ${f.intercept}`);
  }
});

test("quantile regression equals the brute-force optimum over all exact-fit lines and planes", () => {
  // The LP optimum is attained at a basic solution that interpolates p data points,
  // so enumerating every p-subset gives an independent reference minimum.
  const rand = rng(13);
  for (const [n, p] of [[15, 1], [12, 2]]) {
    const X = Array.from({ length: n }, () => Array.from({ length: p }, () => normal(rand)));
    const y = X.map((x) => x.reduce((a, v) => a + v, 0) + normal(rand) * (1 + Math.abs(x[0])));
    for (const tau of [0.1, 0.5, 0.8]) {
      let best = Infinity;
      const pick = (start, chosen) => {
        if (chosen.length === p + 1) {
          const A = chosen.map((i) => [1, ...X[i]]);
          const b = solve(A, chosen.map((i) => y[i]));
          if (b) best = Math.min(best, pinballLoss(X, y, tau, b[0], b.slice(1)));
          return;
        }
        for (let i = start; i < n; i++) pick(i + 1, [...chosen, i]);
      };
      pick(0, []);
      const f = quantileRegression(X, y, tau);
      const got = pinballLoss(X, y, tau, f.intercept, f.coef);
      assert.ok(Math.abs(got - best) < 1e-8 * (1 + best), `n=${n} p=${p} tau=${tau}: ${got} vs brute ${best}`);
    }
  }
});

test("on the diabetes data the fitted quantiles beat every perturbed solution and satisfy the sign condition", () => {
  const d = prepareData(diabetes);
  const rand = rng(14);
  for (const tau of [0.05, 0.5, 0.95]) {
    const f = quantileRegression(d.X, d.y, tau);
    const base = pinballLoss(d.X, d.y, tau, f.intercept, f.coef);
    for (let t = 0; t < 200; t++) {
      const scale = 10 ** (-4 + 4 * rand());
      const coef = f.coef.map((c) => c + scale * normal(rand) * (Math.abs(c) + 1e-3));
      const b0 = f.intercept + scale * normal(rand) * 10;
      assert.ok(pinballLoss(d.X, d.y, tau, b0, coef) >= base - 1e-9 * base, `tau ${tau} perturbation ${t}`);
    }
    // Subgradient condition for the intercept: #{r < 0} <= tau*n <= #{r <= 0}.
    const r = d.X.map((x, i) => d.y[i] - f.predict(x));
    const neg = r.filter((v) => v < -1e-7).length;
    const nonpos = r.filter((v) => v <= 1e-7).length;
    assert.ok(neg <= tau * d.X.length + 1e-9 && tau * d.X.length <= nonpos + 1e-9, `tau ${tau}: ${neg} ${nonpos}`);
  }
  assert.equal(pinball(-2, 0.1), 1.8);
  assert.equal(pinball(2, 0.1), 0.2);
});

// ------------------------------------------------------------ (a) coverage property

function synthetic(rand, n, kind) {
  const X = [], y = [];
  for (let i = 0; i < n; i++) {
    const x = [normal(rand), normal(rand), rand() * 2 - 1];
    let e;
    if (kind === "hetero") e = (0.2 + 1.5 * (x[2] + 1)) * normal(rand); // spread linear in a feature
    else if (kind === "vshape") e = (0.3 + 1.5 * Math.abs(x[0])) * normal(rand); // spread a linear model cannot follow
    else if (kind === "skewed") e = -Math.log(1 - rand()) - 1 + 0.2 * normal(rand); // centred exponential
    else e = normal(rand);
    X.push(x);
    y.push(1 + 2 * x[0] - x[1] + 0.5 * x[2] + e);
  }
  return { X, y };
}

for (const kind of ["hetero", "vshape", "homo", "skewed"]) {
  test(`average coverage over 200 seeded repetitions sits in [1-alpha, 1-alpha+1/(n_cal+1)] (${kind} noise)`, () => {
    const alpha = 0.1, nTr = 100, nCal = 99, nTe = 200, reps = 200, tol = 0.01;
    const sums = { split: 0, normalized: 0, cqr: 0 };
    const widths = { split: 0, normalized: 0, cqr: 0 };
    for (let r = 0; r < reps; r++) {
      const rand = rng(1000 + r + { hetero: 0, vshape: 20000, homo: 50000, skewed: 90000 }[kind]);
      const tr = synthetic(rand, nTr, kind), cal = synthetic(rand, nCal, kind), te = synthetic(rand, nTe, kind);
      for (const m of Object.keys(sums)) {
        const fit = fitConformal(m, tr.X, tr.y, cal.X, cal.y, alpha, { seed: r + 1 });
        let c = 0, w = 0;
        te.X.forEach((x, i) => { const [lo, hi] = fit.interval(x); if (te.y[i] >= lo && te.y[i] <= hi) c++; w += hi - lo; });
        sums[m] += c / nTe;
        widths[m] += w / nTe;
      }
    }
    for (const m of Object.keys(sums)) {
      const cov = sums[m] / reps;
      assert.ok(cov >= 1 - alpha - tol, `${m} ${kind}: ${cov}`);
      assert.ok(cov <= 1 - alpha + 1 / (nCal + 1) + tol, `${m} ${kind}: ${cov}`);
    }
    if (kind === "hetero") {
      // Adaptive methods should be narrower than the constant-width band when noise scales with x.
      assert.ok(widths.normalized < widths.split, `normalized ${widths.normalized} vs split ${widths.split}`);
      assert.ok(widths.cqr < widths.split, `cqr ${widths.cqr} vs split ${widths.split}`);
    }
  });
}

// ------------------------------------------------------------ (e) CSV parsing

test("CSV: header, tab and semicolon delimiters, quotes and no-header naming", () => {
  const p = parseCsv("a,b,y\n1,2,3\n4,5,6\n");
  assert.deepEqual(p.columns, ["a", "b", "y"]);
  assert.equal(p.rows.length, 2);
  assert.deepEqual(parseCsv("a\tb\ty\n1\t2\t3").columns, ["a", "b", "y"]);
  assert.deepEqual(parseCsv("a;b;y\n1;2;3").columns, ["a", "b", "y"]);
  assert.deepEqual(parseCsv('"x, one",y\n1,2').columns, ["x, one", "y"]);
  const nh = parseCsv("1,2,3\n4,5,6");
  assert.equal(nh.hasHeader, false);
  assert.deepEqual(nh.columns, ["c1", "c2", "c3"]);
  assert.equal(nh.rows.length, 2);
  assert.match(parseCsv("").error, /empty/);
  assert.match(parseCsv("a,b\n1,2,3").error, /Line 2 has 3 fields/);
  assert.match(parseCsv("a,a\n1,2").error, /appears twice/);
});

test("CSV: rows with missing values are dropped and counted; the default target is the last column", () => {
  const d = prepareData("a,b,y\n1,2,3\n,5,6\n7,NA,9\n10,11,\n13,14,15\n");
  assert.equal(d.target, "y");
  assert.deepEqual(d.features, ["a", "b"]);
  assert.equal(d.dropped, 3);
  assert.deepEqual(d.y, [3, 15]);
  assert.deepEqual(d.line, [2, 6]);
  // A missing value in an unused column does not drop the row.
  const e = prepareData("a,b,y\n1,,3\n4,5,6", { features: ["a"] });
  assert.equal(e.dropped, 0);
});

test("CSV: a non-numeric column is rejected with a clear error when selected, and left out by default", () => {
  const text = "id,x,y\nA1,1,2\nB2,2,4\nC3,3,6";
  assert.match(prepareData(text, { features: ["id", "x"] }).error, /Column "id" is not numeric: line 2 has "A1"/);
  assert.match(prepareData("x,y\n1,a\n2,3").error, /Column "y" is not numeric: line 2 has "a"/);
  const d = prepareData(text);
  assert.deepEqual(d.features, ["x"]);
  assert.deepEqual(d.excluded, ["id"]);
  assert.match(prepareData(text, { target: "nope" }).error, /not in the header/);
  assert.match(prepareData(text, { features: ["y"], target: "y" }).error, /cannot also be a feature/);
  const r = analyze({ csv: diabetes.replace("AGE,SEX", "AGE,SEXLABEL").replace(/\n59,2,/, "\n59,male,") });
  assert.ok(!r.error);
  assert.match(r.warnings.join(" "), /Non-numeric column left out of the features: SEXLABEL/);
});

// ------------------------------------------------------------ analyze()

test("analyze on the full diabetes data reports every method with a finite calibrated quantile", () => {
  const r = analyze({ csv: diabetes });
  assert.ok(!r.error, r.error);
  assert.equal(r.rows.used, 442);
  assert.equal(r.target, "Y");
  assert.equal(r.features.length, 10);
  assert.equal(r.split.calibration + r.split.test + r.split.train, 442);
  assert.equal(r.quantileIndex, quantileIndex(r.split.calibration, 0.1));
  assert.equal(r.methods.length, 3);
  for (const m of r.methods) {
    assert.equal(m.infinite, false);
    assert.equal(m.test.length, r.split.test);
    assert.ok(m.empiricalCoverage > 0.75 && m.empiricalCoverage <= 1, `${m.id} ${m.empiricalCoverage}`);
    assert.ok(m.repeated.meanCoverage > 0.85 && m.repeated.meanCoverage < 0.95, `${m.id} ${m.repeated.meanCoverage}`);
    assert.ok(m.meanWidth > 50 && m.meanWidth < 400);
    for (const row of m.test) assert.equal(row.covered, row.y >= row.lo && row.y <= row.hi);
  }
  assert.match(r.summary, /Predicting Y from 10 features/);
  assert.match(r.summary, /marginal/);
  assert.doesNotThrow(() => JSON.stringify(r));
});

test("analyze is deterministic for a seed and changes with the seed", () => {
  const a = analyze({ csv: diabetes, method: "split", repeats: 0 });
  const b = analyze({ csv: diabetes, method: "split", repeats: 0 });
  const c = analyze({ csv: diabetes, method: "split", repeats: 0, seed: 2 });
  assert.deepEqual(a, b);
  assert.notDeepEqual(a.methods[0].test, c.methods[0].test);
});

test("too few calibration rows gives an infinite interval and says so", () => {
  // 40 rows, 10% calibration = 4 rows; 90% needs ceil(5*0.9) = 5 > 4.
  const r = analyze({ csv: DEFAULTS.csv.split("\n").slice(0, 41).join("\n"), calibrationFraction: 0.1, testFraction: 0.2, method: "split", repeats: 0 });
  assert.ok(!r.error, r.error);
  assert.equal(r.split.calibration, 4);
  assert.equal(r.finite, false);
  assert.equal(r.methods[0].infinite, true);
  assert.equal(r.methods[0].quantile, "Infinity");
  assert.equal(r.methods[0].empiricalCoverage, 1);
  assert.equal(r.minCalibrationForFinite, 9);
  assert.match(r.warnings.join(" "), /every interval is infinite.*at least 9 calibration rows/);
  assert.match(r.summary, /whole real line/);
});

test("new rows get intervals from the same calibrated predictor (objects, arrays or CSV)", () => {
  const row = { AGE: 50, SEX: 1, BMI: 25, BP: 90, S1: 180, S2: 110, S3: 50, S4: 4, S5: 4.5, S6: 90 };
  const asObj = analyze({ csv: diabetes, newRows: [row], repeats: 0 });
  const asArr = analyze({ csv: diabetes, newRows: [Object.values(row)], repeats: 0 });
  const asCsv = analyze({ csv: diabetes, newRows: `${Object.keys(row).join(",")}\n${Object.values(row).join(",")}`, repeats: 0 });
  for (const m of asObj.methods) {
    const nr = m.newRows[0];
    assert.ok(nr.lo < nr.pred && nr.pred < nr.hi);
    assert.deepEqual(asArr.methods.find((x) => x.id === m.id).newRows[0], nr);
    assert.deepEqual(asCsv.methods.find((x) => x.id === m.id).newRows[0], nr);
  }
  const split = asObj.methods.find((m) => m.id === "split");
  assert.ok(Math.abs((split.newRows[0].hi - split.newRows[0].lo) / 2 - split.quantile) < 1e-5);
  assert.match(analyze({ csv: diabetes, newRows: [[1, 2]] }).error, /expected 10/);
  assert.match(analyze({ csv: diabetes, newRows: "AGE,SEX\n1,2" }).error, /missing feature column "BMI"/);
});

test("analyze accepts CSV as a string first argument and validates options", () => {
  const r = analyze("x,y\n" + Array.from({ length: 40 }, (_, i) => `${i},${2 * i + (i % 3)}`).join("\n"), { method: "cqr", repeats: 0 });
  assert.ok(!r.error, r.error);
  assert.equal(r.methods[0].id, "cqr");
  assert.match(analyze({ coverage: 1.2 }).error, /between 0 and 1/);
  assert.match(analyze({ method: "bogus" }).error, /Unknown method/);
  assert.match(analyze({ testFraction: 0.6, calibrationFraction: 0.5 }).error, /sum to less than 1/);
  assert.match(analyze({ csv: "a,b,c,d,y\n1,2,3,4,5\n2,3,4,5,6\n3,4,5,6,8\n4,5,6,7,9" }).error, /training rows/);
});

test("analyze() with no arguments runs on the bundled real sample", () => {
  const r = analyze();
  assert.ok(!r.error, r.error);
  assert.equal(r.rows.used, 100);
  assert.equal(r.methods.length, 3);
  assert.ok(DEFAULTS.csv.startsWith("AGE,SEX,BMI,BP,S1,S2,S3,S4,S5,S6,Y\n59,2,32.1,101,157,93.2,38,4,4.8598,87,151"));
  // The sample is the first 100 data rows of the real file, verbatim.
  assert.equal(DEFAULTS.csv.trim(), diabetes.trim().split("\n").slice(0, 101).join("\n"));
});

test("PAPERS carry the fields the spec requires", () => {
  assert.ok(PAPERS.length >= 4);
  for (const p of PAPERS) for (const k of ["authors", "title", "venue", "year", "url", "implemented", "deviations"]) assert.ok(p[k], `${p.title} ${k}`);
  assert.ok(PAPERS.some((p) => p.doi === "10.1080/01621459.2017.1307116"));
  assert.ok(PAPERS.some((p) => /1905\.03222/.test(p.url)));
  assert.deepEqual(Object.keys(METHODS), ["split", "normalized", "cqr"]);
});
