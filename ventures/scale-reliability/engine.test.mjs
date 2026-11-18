import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  analyze, alphaFromCov, lambda2, lambda6, oneFactor, feldtInterval, fQuantile, fCdf, normCdf, normQuantile,
  symEigen, invert, spearmanBrownItems, parseCsv, covariance, rng, PAPERS, DEFAULTS,
} from "./engine.mjs";

const here = (f) => new URL(f, import.meta.url);
const csv = readFileSync(here("./data/phq9-nhanes-2017-2018.csv"), "utf8");
const ref = JSON.parse(readFileSync(here("./eval/reference.json"), "utf8"));
const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b} (tol ${tol})`);
const full = analyze({ csv, bootstrap: 0 });

test("alpha and its Feldt interval match pingouin and scipy on the NHANES PHQ-9 answers", () => {
  assert.equal(full.n, ref.n);
  assert.equal(full.k, ref.k);
  close(full.alpha.value, ref.alpha, 1e-12, "alpha");
  close(full.alpha.lower, ref.feldt95[0], 1e-9, "Feldt lower");
  close(full.alpha.upper, ref.feldt95[1], 1e-9, "Feldt upper");
  // pingouin prints the interval rounded to 3 decimals
  assert.equal(Number(full.alpha.lower.toFixed(3)), ref.feldt95Pingouin[0]);
  assert.equal(Number(full.alpha.upper.toFixed(3)), ref.feldt95Pingouin[1]);
});

test("standardised alpha, lambda-2, lambda-6 and the eigenvalues match numpy", () => {
  close(full.standardizedAlpha, ref.standardizedAlpha, 1e-12, "standardised alpha");
  close(full.lambda2, ref.lambda2, 1e-12, "lambda-2");
  close(full.lambda6, ref.lambda6, 1e-10, "lambda-6");
  full.eigenvalues.forEach((v, i) => close(v, ref.eigenvalues[i], 1e-10, `eigenvalue ${i}`));
});

test("omega matches factor_analyzer's minres loadings and scipy's least-squares fit", () => {
  close(full.omega.standardized, ref.omegaStandardized, 1e-6, "standardised omega (factor_analyzer)");
  close(full.omega.value, ref.omega, 1e-7, "omega (scipy ULS on the covariance)");
  full.items.forEach((it, i) => {
    const r = ref.items[i];
    assert.equal(it.name, r.name);
    close(it.itemRest, r.itemRest, 1e-12, `${it.name} item-rest r`);
    close(it.alphaIfDeleted, r.alphaIfDeleted, 1e-12, `${it.name} alpha if deleted`);
    close(it.standardizedLoading, r.standardizedLoading, 1e-5, `${it.name} standardised loading`);
    close(it.loading, r.loading, 1e-5, `${it.name} loading`);
  });
});

test("the PHQ-9 example reads as expected in words", () => {
  assert.match(full.summary[0], /^Cronbach's alpha: 0\.824 \(95% CI 0\.810 to 0\.837, Feldt\), good, for 9 items and 1494 respondents\./);
  assert.match(full.summary.join(" "), /Weakest item: "self_harm_thoughts"/);
  assert.deepEqual(full.input.skipped, [{ name: "seqn", reason: "looks like an identifier" }]);
  assert.equal(full.dropped, 6);
  assert.ok(full.omega.converged && !full.omega.heywood);
});

test("Guttman's ordering holds: alpha <= lambda-2, and omega >= alpha for these congeneric items", () => {
  assert.ok(full.alpha.value <= full.lambda2 + 1e-12);
  assert.ok(full.omega.value >= full.alpha.value);
  const R = rng(7);
  for (let t = 0; t < 30; t++) {
    const k = 3 + Math.floor(R() * 6);
    const rows = Array.from({ length: 40 }, () => { const f = R() * 2 - 1; return Array.from({ length: k }, () => f * R() + (R() - 0.5)); });
    const C = covariance(rows).cov;
    assert.ok(alphaFromCov(C) <= lambda2(C) + 1e-12, "alpha <= lambda-2");
  }
});

test("alpha is unchanged by shifting every item and by rescaling all items together; standardised alpha by rescaling one", () => {
  const shifted = csv.split("\n").map((line, i) => (i === 0 || !line ? line : line.split(",").map((v, j) => (j === 0 || v === "" ? v : String(Number(v) * 2 + 5))).join(","))).join("\n");
  const r = analyze({ csv: shifted, bootstrap: 0 });
  close(r.alpha.value, full.alpha.value, 1e-12, "alpha");
  close(r.omega.value, full.omega.value, 1e-8, "omega");
  const one = csv.split("\n").map((line, i) => (i === 0 || !line ? line : line.split(",").map((v, j) => (j === 1 && v !== "" ? String(Number(v) * 10) : v)).join(","))).join("\n");
  const s = analyze({ csv: one, bootstrap: 0 });
  close(s.standardizedAlpha, full.standardizedAlpha, 1e-12, "standardised alpha");
  close(s.omega.standardized, full.omega.standardized, 1e-8, "standardised omega");
  assert.ok(Math.abs(s.alpha.value - full.alpha.value) > 0.01, "raw alpha should move");
});

test("parallel items recover the reliability they were built with", () => {
  // k parallel items: true score T ~ N(0,1), error e ~ N(0, s2). Reliability of the sum = k/(k + s2).
  const R = rng(11);
  const gauss = () => Math.sqrt(-2 * Math.log(R() || 1e-300)) * Math.cos(2 * Math.PI * R());
  const k = 6, s2 = 2, n = 20000;
  const rows = Array.from({ length: n }, () => { const t = gauss(); return Array.from({ length: k }, () => t + Math.sqrt(s2) * gauss()); });
  const text = `${Array.from({ length: k }, (_, i) => `q${i + 1}`).join(",")}\n${rows.map((r) => r.join(",")).join("\n")}`;
  const r = analyze({ csv: text, bootstrap: 0 });
  const truth = k / (k + s2);
  close(r.alpha.value, truth, 0.01, "alpha");
  close(r.omega.value, truth, 0.01, "omega");
  close(r.lambda2, truth, 0.01, "lambda-2");
  assert.ok(r.alpha.lower < truth && truth < r.alpha.upper + 0.005);
});

test("a reverse-keyed item is flagged, and reversing it fixes the scale", () => {
  const lines = csv.trim().split("\n");
  const flipped = [lines[0], ...lines.slice(1).map((l) => l.split(",").map((v, j) => (j === 2 && v !== "" ? String(3 - Number(v)) : v)).join(","))].join("\n");
  const bad = analyze({ csv: flipped, bootstrap: 0 });
  assert.ok(bad.alpha.value < full.alpha.value - 0.05);
  assert.ok(bad.warnings.some((w) => /"down" correlates negatively/.test(w)));
  const fixed = analyze({ csv: flipped, reverse: "down", bootstrap: 0 });
  close(fixed.alpha.value, full.alpha.value, 1e-12, "alpha after reversing");
  assert.deepEqual(fixed.input.reversed, ["down"]);
  assert.equal(fixed.items[1].reversed, true);
  // with an explicit scale range wider than observed, reversal still preserves alpha (it is a reflection)
  close(analyze({ csv: flipped, reverse: ["down"], scaleMin: 0, scaleMax: 4, bootstrap: 0 }).alpha.value, full.alpha.value, 1e-12, "alpha with explicit range");
});

test("missing codes, item selection and errors", () => {
  const coded = csv.replace(/,,/g, ",9,").replace(/,\n/g, ",9\n");
  const m = analyze({ csv: coded, missing: "7,9", bootstrap: 0 });
  close(m.alpha.value, full.alpha.value, 1e-12, "9 treated as missing");
  const sub = analyze({ csv, items: "interest,down,sleep", bootstrap: 0 });
  assert.equal(sub.k, 3);
  assert.deepEqual(sub.input.items, ["interest", "down", "sleep"]);
  assert.throws(() => analyze({ csv, items: "interest,nope" }), /no column named "nope"/);
  assert.throws(() => analyze({ csv: "a\n1\n2" }), /at least two numeric item columns/);
  assert.throws(() => analyze({ csv: "a,b\n1,2" }), /only 1 respondent/);
  assert.throws(() => analyze({ csv: "a,b\n1,2\n1,3\n1,4\n1,1" }), /same answer to "a"/);
  assert.throws(() => analyze({ csv, confidence: 1.2 }), /confidence/);
  assert.throws(() => analyze({ csv, reverse: "seqn" }), /not one of the items/);
  const withText = analyze({ csv: "name,q1,q2\nann,1,2\nbo,2,2\ncy,3,4\ndi,2,1", bootstrap: 0 });
  assert.deepEqual(withText.input.items, ["q1", "q2"]);
  assert.ok(withText.warnings.some((w) => /only 4 complete respondents/.test(w)));
});

test("bootstrap intervals are seeded, bracket the estimate, and BCa is near the percentile interval here", () => {
  const a = analyze({ csv, bootstrap: 300, seed: 3 });
  const b = analyze({ csv, bootstrap: 300, seed: 3 });
  assert.deepEqual(a.omega.bootstrap, b.omega.bootstrap);
  for (const key of ["alpha", "omega"]) {
    const v = a[key].value, bo = a[key].bootstrap;
    assert.ok(bo.lower < v && v < bo.upper, key);
    close(bo.lower, bo.percentileLower, 0.01, `${key} BCa vs percentile`);
    assert.equal(bo.reps, 300);
  }
  // the bootstrap alpha interval should be close to Feldt's for this large sample
  close(a.alpha.bootstrap.lower, a.alpha.lower, 0.01, "bootstrap vs Feldt lower");
});

test("distribution helpers agree with known values", () => {
  close(normCdf(1.959963984540054), 0.975, 1e-12, "normCdf");
  close(normQuantile(0.975), 1.959963984540054, 1e-10, "normQuantile");
  close(fQuantile(0.95, 5, 10), 3.325834530413011, 1e-9, "F(5,10) 95th percentile");
  close(fCdf(3.325834530413011, 5, 10), 0.95, 1e-10, "F cdf");
  const fi = feldtInterval(0.8, 100, 10, 0.95);
  assert.ok(fi.lower < 0.8 && fi.upper > 0.8);
});

test("linear algebra helpers", () => {
  const M = [[4, 1, 2], [1, 3, 0], [2, 0, 5]];
  const { values, vectors } = symEigen(M);
  vectors.forEach((v, i) => M.forEach((row, r) => close(row.reduce((s, x, c) => s + x * v[c], 0), values[i] * v[r], 1e-10, "Av = lv")));
  close(values.reduce((a, b) => a + b, 0), 12, 1e-12, "trace");
  const inv = invert(M);
  M.forEach((row, i) => row.forEach((_, j) => close(M[i].reduce((s, x, c) => s + x * inv[c][j], 0), i === j ? 1 : 0, 1e-12, "M M^-1")));
  assert.equal(invert([[1, 2], [2, 4]]), null);
  assert.equal(lambda6([[1, 1], [1, 1]]), null);
});

test("one-factor fit recovers known loadings from an exact covariance", () => {
  const l = [0.9, 0.7, 0.5, 0.3], psi = [0.19, 0.51, 0.75, 0.91];
  const C = l.map((a, i) => l.map((b, j) => a * b + (i === j ? psi[i] : 0)));
  const fit = oneFactor(C);
  fit.loadings.forEach((v, i) => close(v, l[i], 1e-6, `loading ${i}`));
  const s = l.reduce((a, b) => a + b, 0);
  close(fit.omega, (s * s) / (s * s + psi.reduce((a, b) => a + b, 0)), 1e-8, "omega");
  close(fit.rmsr, 0, 1e-8, "residual");
});

test("Spearman-Brown and the CSV parser", () => {
  assert.equal(spearmanBrownItems(0.6, 10, 0.75).items, 20);
  // 16.27 items rounds up, not to nearest (quality audit 2026-11-17: ceil -> round survived).
  assert.equal(spearmanBrownItems(0.8236223352756988, 9, 0.9).items, 18);
  assert.equal(spearmanBrownItems(1, 10, 0.75), null);
  assert.deepEqual(parseCsv('a;b\n"1";2\n'), [["a", "b"], ["1", "2"]]);
  assert.deepEqual(parseCsv("a\tb\r\n1\t2"), [["a", "b"], ["1", "2"]]);
  assert.deepEqual(parseCsv('a,b\n"x, ""y""",2'), [["a", "b"], ['x, "y"', "2"]]);
});

test("PAPERS are complete and DEFAULTS sensible", () => {
  assert.ok(PAPERS.length >= 6);
  for (const p of PAPERS) for (const f of ["key", "authors", "title", "venue", "year", "url", "implemented", "deviations"]) assert.ok(p[f], `${p.key} ${f}`);
  assert.equal(DEFAULTS.confidence, 0.95);
  assert.equal(full.papers.length, PAPERS.length);
});

// Red-team 2026-11-17: four mutants escaped this suite.
test("parseCsv keeps a last line with no newline, even one column wide or ending in an empty cell", () => {
  assert.deepEqual(parseCsv("x\n5"), [["x"], ["5"]]);
  assert.deepEqual(parseCsv("a,b,c\n1,2,"), [["a", "b", "c"], ["1", "2", ""]]);
});

test("reversing needs a real scale range: equal minimum and maximum are refused", () => {
  const small = "a,b,c\n1,2,3\n2,3,4\n3,3,5\n4,5,4\n";
  assert.throws(() => analyze({ csv: small, reverse: "b", scaleMin: 3, scaleMax: 3, bootstrap: 0 }), /scale range/);
});

test("rng is mulberry32, so a seeded bootstrap gives the same interval from one release to the next", () => {
  assert.equal(rng(1)(), 0.6270739405881613);
});

test("the more-than-one-factor warning fires exactly when the second eigenvalue exceeds 1 and is over a third of the first", () => {
  const R = rng(5);
  let near = 0;
  for (let t = 0; t < 400; t++) {
    const k = 4 + Math.floor(R() * 5), split = 1 + Math.floor(R() * (k - 1)), mix = R();
    const rows = Array.from({ length: 60 }, () => {
      const f = R() * 2 - 1, g = R() * 2 - 1;
      return Array.from({ length: k }, (_, j) => (j < split ? f : mix * f + (1 - mix) * g) + (R() - 0.5) * (0.3 + R()));
    });
    const csvT = [Array.from({ length: k }, (_, j) => `i${j}`).join(","), ...rows.map((r) => r.join(","))].join("\n");
    const res = analyze({ csv: csvT, bootstrap: 0 });
    const [e0, e1] = res.eigenvalues;
    const want = e1 > 1 && e0 / e1 < 3;
    if (e1 > 1 && e0 / e1 >= 3 && e0 / e1 < 4) near++;
    assert.equal(res.warnings.some((w) => /may measure more than one thing/.test(w)), want, `eigenvalues ${e0}, ${e1}`);
  }
  assert.ok(near >= 3, `only ${near} draws had a ratio between 3 and 4`);
});

test("an absurd bootstrap count is refused instead of hanging the page or CLI", () => {
  const small = "a,b,c\n1,2,3\n2,3,4\n3,3,5\n4,5,4\n2,2,2\n5,4,5\n";
  assert.throws(() => analyze({ csv: small, bootstrap: 1e9 }), /bootstrap must be a whole number from 0/);
  assert.throws(() => analyze({ csv: small, bootstrap: -5 }), /bootstrap must be a whole number from 0/);
  assert.equal(analyze({ csv: small, bootstrap: 0 }).input.bootstrap, 0);
  assert.equal(analyze({ csv: small, bootstrap: 50 }).input.bootstrap, 50);
});
