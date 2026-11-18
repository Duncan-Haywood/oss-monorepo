import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  analyze, parsePairs, deming, demingJackknife, weightedDeming, passingBablok, cusumLinearity, kendallTau,
  blandAltman, ols, normQuantile, normCdf, tQuantile, tTwoSided, kolmogorovSurvival, exactScale, rng, toCsv, csvCell, SAMPLE_TEXT,
} from "./engine.mjs";

const file = (f) => readFileSync(new URL(`./${f}`, import.meta.url), "utf8");
const REF = JSON.parse(file("eval/reference.json"));
const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${msg}: ${a} vs ${b}`);

test("distribution helpers match known values", () => {
  close(normQuantile(0.975), 1.959963984540054, 1e-12, "z 0.975");
  close(normQuantile(0.005), -2.5758293035489004, 1e-11, "z 0.005");
  close(normCdf(-1.959963984540054), 0.025, 1e-12, "Phi");
  close(tQuantile(0.025, 10), 2.228138851986274, 1e-10, "t 10 df");
  close(tQuantile(0.025, 2), 4.302652729749464, 1e-10, "t 2 df");
  close(tTwoSided(2.0, 5), 0.10193947882985835, 1e-10, "t p (scipy 2 * t.sf(2, 5))");
  close(kolmogorovSurvival(1.3581), 0.05, 2e-4, "Kolmogorov 5%");
  close(kolmogorovSurvival(1.6276), 0.01, 2e-4, "Kolmogorov 1%");
});

test("Deming, jackknife, weighted Deming, Passing-Bablok and Kendall agree with the independent Python reference", () => {
  assert.ok(REF.cases.length >= 30);
  for (const c of REF.cases) {
    const d = demingJackknife(c.x, c.y, c.lam);
    close(d.slope, c.deming.slope, 1e-11, "deming slope (numpy closed form)");
    close(d.intercept, c.deming.intercept, 1e-10, "deming intercept (numpy closed form)");
    close(d.slope, c.deming.odrSlope, 1e-5, "deming slope (scipy ODR)");
    close(d.intercept, c.deming.odrIntercept, 1e-4, "deming intercept (scipy ODR, iterative)");
    close(d.seSlope, c.deming.seSlope, 1e-9, "jackknife se slope");
    close(d.seIntercept, c.deming.seIntercept, 1e-9, "jackknife se intercept");
    close(d.covAB, c.deming.covAB, 1e-9, "jackknife cov");
    const w = weightedDeming(c.x, c.y, c.lam, 0.05, { jackknife: false });
    close(w.slope, c.weightedDeming.slope, 1e-10, "weighted deming slope");
    close(w.intercept, c.weightedDeming.intercept, 1e-9, "weighted deming intercept");
    close(w.slope, c.weightedDeming.odrSlope, 1e-5, "weighted deming vs fixed-weight ODR");
    close(w.intercept, c.weightedDeming.odrIntercept, 1e-4, "weighted deming intercept vs fixed-weight ODR");
    for (const method of ["brute", "fast"]) {
      const pb = passingBablok(c.x, c.y, 0.05, { method });
      close(pb.slope, c.passingBablok.slope, 1e-12, `PB slope ${method}`);
      close(pb.intercept, c.passingBablok.intercept, 1e-10, `PB intercept ${method}`);
      for (let k = 0; k < 2; k++) {
        close(pb.slopeCI[k], c.passingBablok.slopeCI[k], 1e-12, `PB slope CI ${method}`);
        close(pb.interceptCI[k], c.passingBablok.interceptCI[k], 1e-10, `PB intercept CI ${method}`);
      }
      assert.equal(pb.N, c.passingBablok.N);
      assert.equal(pb.K, c.passingBablok.K);
    }
    const kt = kendallTau(c.x, c.y);
    close(kt.tau, c.kendall.tau, 1e-12, "tau-b");
    close(kt.p, c.kendall.p, 1e-9, "tau p");
  }
});

test("the NHANES example: every number agrees with the reference, Passing-Bablok by slope selection", () => {
  const r = analyze({ text: file("data/nhanes-2017-2018-systolic.csv"), decisionLevels: [130] });
  const ref = REF.nhanes;
  assert.equal(r.n, ref.n);
  assert.equal(r.passingBablok.algorithm, "slope selection by inversion counting");
  assert.equal(r.passingBablok.N, ref.passingBablok.N);
  assert.equal(r.passingBablok.K, ref.passingBablok.K);
  close(r.passingBablok.slope, ref.passingBablok.slope, 1e-12, "slope");
  close(r.passingBablok.intercept, ref.passingBablok.intercept, 1e-10, "intercept");
  for (let k = 0; k < 2; k++) {
    close(r.passingBablok.slopeCI[k], ref.passingBablok.slopeCI[k], 1e-12, "slope CI");
    close(r.passingBablok.interceptCI[k], ref.passingBablok.interceptCI[k], 1e-10, "intercept CI");
  }
  for (const k of ["slope", "intercept", "seSlope", "seIntercept", "covAB"]) close(r.deming[k], ref.deming[k], 1e-9, `deming ${k}`);
  close(r.deming.slope, ref.deming.odrSlope, 1e-5, "deming slope vs ODR");
  close(r.kendall.tau, ref.kendall.tau, 1e-12, "tau");
  close(r.ols.slope, ref.ols.slope, 1e-10, "ols");
});

test("Bland and Altman's 1986 peak-flow example gives the published bias, SD and limits", () => {
  const p = parsePairs(file("data/bland-altman-1986-peak-flow.csv"));
  assert.equal(p.x.length, 17);
  assert.equal(p.xName, "wright_l_min");
  // The paper reports Wright minus mini: -2.1, SD 38.8, limits -79.7 to 75.5 (mean +/- 2 SD).
  const ba = blandAltman(p.y, p.x, { multiplier: 2 });
  assert.equal(ba.bias.toFixed(1), "-2.1");
  assert.equal(ba.sd.toFixed(1), "38.8");
  assert.ok(Math.abs(ba.lower - -79.7) < 0.1 && Math.abs(ba.upper - 75.5) < 0.1, `${ba.lower} ${ba.upper}`);
});

test("fast slope selection equals sorting every slope, with heavy ties, vertical pairs and slopes of -1", () => {
  const draw = rng(42);
  let checked = 0;
  for (let t = 0; t < 400; t++) {
    const n = 5 + Math.floor(draw() * 70);
    const x = [], y = [];
    const dec = t % 3;
    for (let i = 0; i < n; i++) {
      const a = Math.floor(draw() * 15);
      x.push(dec ? +(a / 10 ** dec).toFixed(dec) : a);
      const b = t % 4 === 0 ? 20 - a + Math.floor(draw() * 3) : Math.floor(a * (0.5 + draw()) + draw() * 4 - 2);
      y.push(dec ? +(b / 10 ** dec).toFixed(dec) : b);
    }
    let A;
    try { A = passingBablok(x, y, 0.05, { method: "brute" }); } catch { continue; }
    const B = passingBablok(x, y, 0.05, { method: "fast" });
    const same = (u, v) => (Number.isNaN(u) && Number.isNaN(v)) || u === v || Math.abs(u - v) <= 1e-12 * Math.max(1, Math.abs(u));
    assert.ok(same(A.slope, B.slope), `slope ${A.slope} ${B.slope}`);
    assert.ok(same(A.slopeCI[0], B.slopeCI[0]) && same(A.slopeCI[1], B.slopeCI[1]), "CI");
    assert.deepEqual([A.N, A.K], [B.N, B.K]);
    checked++;
  }
  assert.ok(checked > 350);
});

test("exact scaling finds ties and -1 slopes that floating point would miss", () => {
  const s = exactScale([0.1, 0.3], [0.3, 0.1]);
  assert.equal(s.exact, true);
  assert.deepEqual([s.X, s.Y], [[1, 3], [3, 1]]);
  const pb = passingBablok([0.1, 0.3, 0.7, 1.2, 1.5], [0.3, 0.1, 0.8, 1.1, 1.7]);
  assert.equal(pb.pairs.minusOne, 1);
});

test("Passing-Bablok is symmetric: swapping the methods inverts the slope", () => {
  const p = parsePairs(SAMPLE_TEXT);
  const a = passingBablok(p.x, p.y), b = passingBablok(p.y, p.x);
  close(a.slope * b.slope, 1, 1e-3, "b(x,y) b(y,x)");
});

test("Deming with lambda 1 is orthogonal regression; lambda to infinity tends to least squares", () => {
  const p = parsePairs(SAMPLE_TEXT);
  const o = ols(p.x, p.y);
  close(deming(p.x, p.y, 1e9).slope, o.slope, 1e-6, "large lambda");
  const d = deming(p.x, p.y, 1);
  // Orthogonal: the slope minimises the sum of squared perpendicular distances.
  const perp = (b) => { const a = d.my - b * d.mx; return p.x.reduce((s, xi, i) => s + (p.y[i] - a - b * xi) ** 2 / (1 + b * b), 0); };
  assert.ok(perp(d.slope) <= perp(d.slope + 1e-4) && perp(d.slope) <= perp(d.slope - 1e-4));
});

test("jackknife shortcut equals refitting each leave-one-out set", () => {
  const p = parsePairs(SAMPLE_TEXT);
  const j = demingJackknife(p.x, p.y, 2);
  const n = p.x.length, bs = [];
  for (let i = 0; i < n; i++) bs.push(deming(p.x.filter((_, k) => k !== i), p.y.filter((_, k) => k !== i), 2).slope);
  const m = bs.reduce((s, v) => s + v, 0) / n;
  close(j.seSlope, Math.sqrt(((n - 1) / n) * bs.reduce((s, v) => s + (v - m) ** 2, 0)), 1e-10, "se");
});

test("the CUSUM test passes a straight line and flags a curve", () => {
  const draw = rng(3);
  const x = [], yl = [], yc = [];
  for (let i = 0; i < 120; i++) { const t = 10 + i; const e = () => (draw() - 0.5) * 4; x.push(t + e()); yl.push(t + e()); yc.push(t + 0.02 * (t - 70) ** 2 + e()); }
  const a = passingBablok(x, yl), b = passingBablok(x, yc);
  assert.equal(cusumLinearity(x, yl, a.slope, a.intercept).linear, true);
  assert.equal(cusumLinearity(x, yc, b.slope, b.intercept).linear, false);
});

test("decision levels, bootstrap, percentage scale, repeatability SDs and warnings", () => {
  const r = analyze({ text: SAMPLE_TEXT, decisionLevels: [10, 20], baScale: "percent", sdX: 0.2, sdY: 0.3 });
  close(r.lambda, 2.25, 1e-12, "lambda from SDs");
  assert.equal(r.blandAltman.scale, "percent");
  assert.equal(r.decision.length, 2);
  const d = r.decision[0];
  close(d.deming.bias, r.deming.intercept + (r.deming.slope - 1) * 10, 1e-12, "bias at 10");
  assert.ok(d.deming.ci[0] < d.deming.bias && d.deming.bias < d.deming.ci[1]);
  assert.ok(d.passingBablok.ci[0] < d.passingBablok.ci[1]);
  assert.ok(d.passingBablok.resamples >= 990);
  assert.ok(r.warnings.some((w) => /Only 20 pairs/.test(w)));
  const again = analyze({ text: SAMPLE_TEXT, decisionLevels: [10, 20], baScale: "percent", sdX: 0.2, sdY: 0.3 });
  assert.deepEqual(again.decision[0].passingBablok.ci, d.passingBablok.ci, "seeded bootstrap is repeatable");
  assert.equal(r.summary.length, 6);
});

test("parsing picks columns, skips ids and bad rows, and reports clear errors", () => {
  const p = parsePairs("seqn,a,b,c\n1,2,3,4\n2,3,x,5\n3,4,5,6\n4,5,6,7\n5,6,7,8\n6,7,8,9");
  assert.deepEqual([p.xName, p.yName, p.x, p.y, p.skipped], ["a", "b", [2, 4, 5, 6, 7], [3, 5, 6, 7, 8], 1]);
  const q = parsePairs("seqn,a,b,c\n1,2,3,4\n3,4,5,6", { x: "c", y: 2 });
  assert.deepEqual([q.xName, q.yName], ["c", "a"]);
  assert.deepEqual(parsePairs("1\t2\n3\t4.5").y, [2, 4.5]);
  assert.throws(() => parsePairs(""), /Paste paired readings/);
  assert.throws(() => parsePairs("a,b\n1,2", { x: "z" }), /No column named "z"/);
  assert.throws(() => analyze({ x: [1, 2, 3], y: [1, 2, 3] }), /at least 5/);
  assert.throws(() => analyze({ x: [1, 2], y: [1] }), /same length/);
  assert.throws(() => analyze({ text: SAMPLE_TEXT, lambda: -1 }), /above zero/);
  assert.throws(() => weightedDeming([1, 2, 0, 4, 5], [1, 2, 3, 4, 5]), /above zero/);
});

test("negative readings skip weighted Deming but the rest still runs", () => {
  const r = analyze({ x: [-2, -1, 0, 1, 2, 3, 4], y: [-2.1, -0.8, 0.2, 1.1, 1.9, 3.2, 4.1] });
  assert.equal(r.weightedDeming, null);
  assert.ok(Number.isFinite(r.passingBablok.slope));
});

test("CSV export has a row per pair and guards formula cells", () => {
  const r = analyze({ text: SAMPLE_TEXT });
  const lines = toCsv(r).trim().split("\n");
  assert.equal(lines.length, 21);
  assert.equal(lines[0], "old_method,new_method,mean,difference,passing_bablok_fit,deming_fit");
  assert.equal(csvCell("=SUM(A1)"), "'=SUM(A1)");
  assert.equal(csvCell("-1.5"), "-1.5");
});

test("simulation file: intervals near 95% and the CUSUM conservative but not blind", () => {
  const s = JSON.parse(file("eval/simulation.json"));
  assert.equal(s.settings.datasets, 1000);
  for (const k of ["demingSlope", "passingBablokSlope"]) assert.ok(s.constant[k] > 93 && s.constant[k] < 97, k);
  assert.ok(s.proportional.weightedDemingSlope > 93);
  assert.ok(s.constant.cusumRejectRate <= 5 && s.curved.cusumRejectRate > 50);
});

test("the CUSUM normalisation file backs the README's comparison", () => {
  const c = JSON.parse(file("eval/cusum-normalisation.json"));
  assert.deepEqual(c.rows.map((r) => r.falseAlarmPctBelowPlusOne), [2.4, 5.5, 8.2]);
  assert.ok(c.rows.every((r) => r.falseAlarmPctOffLinePlusOne <= 1));
  assert.match(file("README.md"), /gave 2\.4%, 5\.5% and 8\.2% false alarms/);
});

// ---------------------------------------------------------------- red team 2026-11-17

test("a semicolon CSV with decimal commas (Excel in most of Europe) reads the right numbers", () => {
  // Before the fix, "4,1;4,3" split on the comma: the first row became a header and every
  // value lost its decimals or its integer part, with no error.
  const bare = parsePairs("4,1;4,3\n5,0;5,4\n5,6;5,8\n6,3;6,9\n7,1;7,4\n7,9;8,6\n");
  assert.deepEqual([bare.x, bare.y, bare.skipped], [[4.1, 5, 5.6, 6.3, 7.1, 7.9], [4.3, 5.4, 5.8, 6.9, 7.4, 8.6], 0]);
  const named = parsePairs("id;alt;neu\n1;4,1;4,3\n2;5,0;5,4\n3;5,6;5,8\n4;6,3;6,9\n5;7,1;7,4\n");
  assert.deepEqual([named.xName, named.yName, named.x, named.y], ["alt", "neu", [4.1, 5, 5.6, 6.3, 7.1], [4.3, 5.4, 5.8, 6.9, 7.4]]);
  // A comma file keeps the comma as the separator, and a stray ; in one header cell does not flip it.
  assert.deepEqual(parsePairs("a;b,c\n1,2\n3,4").x, [1, 3]);
  assert.deepEqual(parsePairs("a,b\n1.5,2\n3,4").x, [1.5, 3]);
});

test("a missing reading is an error, never a zero", () => {
  const y = [1.1, 2.1, 2.9, 4.2, 5.1, 5.9];
  for (const bad of [null, "", false, "n/a", [], undefined]) {
    assert.throws(() => analyze({ x: [1, 2, 3, bad, 5, 6], y }), /Every reading must be a number/, String(bad));
  }
  assert.deepEqual(analyze({ x: ["1", "2", " 3", "4e0", "5", "6"], y }).x, [1, 2, 3, 4, 5, 6]);
});

test("decision levels may be one number or a list in a string, not only an array", () => {
  const p = parsePairs(SAMPLE_TEXT);
  assert.deepEqual(analyze({ x: p.x, y: p.y, decisionLevels: 10, bootstrap: 0 }).decision.map((d) => d.level), [10]);
  assert.deepEqual(analyze({ x: p.x, y: p.y, decisionLevels: "10, 20", bootstrap: 0 }).decision.map((d) => d.level), [10, 20]);
  assert.deepEqual(analyze({ x: p.x, y: p.y, decisionLevels: [10, null, ""], bootstrap: 0 }).decision.map((d) => d.level), [10]);
  assert.deepEqual(analyze({ x: p.x, y: p.y, decisionLevels: "6,000; 12", bootstrap: 0 }).decision.map((d) => d.level), [6000, 12]);
});

test("Kendall's tie-corrected variance equals the exact permutation variance of S", () => {
  // Independent of the formula: enumerate every permutation of y and take the variance of S.
  const x = [1, 1, 2, 3, 3, 3, 4], y = [2, 5, 5, 1, 7, 7, 7];
  const perms = (a) => (a.length <= 1 ? [a] : a.flatMap((v, i) => perms([...a.slice(0, i), ...a.slice(i + 1)]).map((p) => [v, ...p])));
  const S = (yy) => { let s = 0; for (let i = 0; i < x.length; i++) for (let j = i + 1; j < x.length; j++) s += Math.sign(x[j] - x[i]) * Math.sign(yy[j] - yy[i]); return s; };
  const all = perms(y).map(S);
  const m = all.reduce((s, v) => s + v, 0) / all.length;
  const varS = all.reduce((s, v) => s + (v - m) ** 2, 0) / all.length;
  const kt = kendallTau(x, y);
  assert.equal(kt.S, S(y));
  close(kt.z, kt.S / Math.sqrt(varS), 1e-12, "z from the exact permutation variance");
});

test("Bland-Altman SD is the sample SD of the differences, exactly", () => {
  const ba = blandAltman([1, 2, 3, 4, 5], [1, 2, 3, 4, 7]);
  // differences 0,0,0,0,2: mean 0.4, sum of squares 3.2, SD sqrt(0.8).
  close(ba.bias, 0.4, 1e-15, "bias");
  close(ba.sd, Math.sqrt(0.8), 1e-15, "sd");
});

test("choosing only the y column keeps it, even when it is the first column", () => {
  const p = parsePairs("a,b,c\n1,2,3\n4,5,6\n7,8,9", { y: "a" });
  assert.deepEqual([p.xName, p.yName], ["b", "a"]);
});

test("CUSUM treats points on the line as on it, at any magnitude", () => {
  // Readings typed to two decimals that lie on y = 3 + 1.1 x at 1e7 leave residuals of rounding noise (about 1e-9).
  const x = [], y = [];
  for (let i = 0; i < 40; i++) { const v = 1e7 + i * 1234.5; x.push(v); y.push(+(3 + 1.1 * v + (i % 4 === 0 ? 50 : i % 4 === 2 ? -50 : 0)).toFixed(2)); }
  assert.ok(x.some((v, i) => i % 2 && y[i] - (3 + 1.1 * v) !== 0), "the test needs non-zero rounding residuals");
  const c = cusumLinearity(x, y, 1.1, 3);
  assert.deepEqual([c.above, c.below], [10, 10]);
});
