import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { analyze, parseResponses, compressPatterns, fitModel, summedScoreDistribution, marginalLogLik, chiSquareSurvival, testInformation, SAMPLE_TEXT, PAPERS, csvCell, itemCsv, peopleCsv, report } from "./engine.mjs";

const file = (f) => readFileSync(new URL(`./${f}`, import.meta.url), "utf8");
const LSAT = file("data/lsat6.csv");
const close = (x, y, tol, msg) => assert.ok(Math.abs(x - y) <= tol, `${msg}: ${x} vs ${y}`);

// Rizopoulos (2006), J. Stat. Softw. 17(5), output of rasch(LSAT) and anova(fit2, fit3), printed to 4 / 3 / 2 digits.
test("1PL on LSAT reproduces ltm's published estimates, standard errors and fit statistics", () => {
  const r = analyze({ text: LSAT, model: "1pl" });
  const b = [-3.6153, -1.3224, -0.3176, -1.7301, -2.7802];
  const se = [0.3266, 0.1422, 0.0977, 0.1691, 0.251];
  r.itemTable.forEach((it, j) => {
    close(it.b, b[j], 5e-5, `b${j + 1}`);
    close(it.bSE, se[j], 5e-5, `se(b${j + 1})`);
    close(it.a, 0.7551, 5e-5, "a");
    close(it.aSE, 0.0694, 5e-5, "se(a)");
  });
  close(r.fit.logLik, -2466.938, 5e-4, "logLik");
  close(r.fit.aic, 4945.875, 5e-4, "AIC");
  close(r.fit.bic, 4975.322, 5e-4, "BIC");
});

test("2PL on LSAT reproduces ltm's likelihood-ratio table", () => {
  const r = analyze({ text: LSAT, model: "auto" });
  close(r.fits["2pl"].logLik, -2466.65, 5e-3, "logLik");
  close(r.fits["2pl"].aic, 4953.31, 5e-3, "AIC");
  close(r.fits["2pl"].bic, 5002.38, 5e-3, "BIC");
  close(r.comparison.lr, 0.57, 5e-3, "LRT");
  assert.equal(r.comparison.df, 4);
  close(r.comparison.p, 0.967, 5e-4, "p");
  assert.equal(r.model, "1pl");
});

test("matches the independent girth implementation (eval/reference.json)", () => {
  const ref = JSON.parse(file("eval/reference.json"));
  for (const [name, f, tol] of [["lsat6", "data/lsat6.csv", 5e-4], ["sim2pl", "eval/sim-2pl.csv", 5e-3]]) {
    const text = file(f);
    const two = analyze({ text, model: "2pl", standardErrors: false });
    const one = analyze({ text, model: "1pl", standardErrors: false });
    two.itemTable.forEach((it, j) => { close(it.a, ref[name]["2pl"].a[j], tol, `${name} 2pl a${j}`); close(it.b, ref[name]["2pl"].b[j], tol, `${name} 2pl b${j}`); });
    close(one.itemTable[0].a, ref[name]["1pl"].a, tol, `${name} 1pl a`);
    one.itemTable.forEach((it, j) => close(it.b, ref[name]["1pl"].b[j], tol, `${name} 1pl b${j}`));
  }
});

test("pattern counts and expanded rows give the same fit", () => {
  const lines = LSAT.trim().split("\n");
  const rows = [lines[0].replace(",count", "")];
  for (const l of lines.slice(1)) { const c = l.split(","); for (let k = 0; k < Number(c[5]); k++) rows.push(c.slice(0, 5).join(",")); }
  const a = analyze({ text: LSAT, model: "2pl", standardErrors: false });
  const b = analyze({ text: rows.join("\n"), model: "2pl", standardErrors: false });
  assert.equal(b.n, 1000);
  close(a.fit.logLik, b.fit.logLik, 1e-8, "logLik");
  a.itemTable.forEach((it, j) => close(it.b, b.itemTable[j].b, 1e-8, "b"));
});

test("the EM log-likelihood never decreases, and the fit is a stationary point", () => {
  const data = parseResponses(file("eval/sim-2pl.csv"));
  const pat = compressPatterns(data.X, data.weights);
  let prev = -Infinity;
  for (const it of [1, 2, 5, 10, 30, 100]) {
    const f = fitModel(pat, data.items.length, "2pl", { maxIter: it });
    assert.ok(f.ll >= prev - 1e-9, `iteration ${it}`);
    prev = f.ll;
  }
  const f = fitModel(pat, data.items.length, "2pl");
  assert.ok(f.converged);
  // Moving any parameter a little must not raise the marginal likelihood.
  for (let j = 0; j < f.a.length; j++) for (const [da, dd] of [[1e-3, 0], [-1e-3, 0], [0, 1e-3], [0, -1e-3]]) {
    const a = f.a.slice(), d = f.d.slice();
    a[j] += da; d[j] += dd;
    assert.ok(marginalLogLik(pat, a, d) <= f.ll + 1e-7, `item ${j} ${da} ${dd}`);
  }
});

test("Lord-Wingersky distribution sums to one and matches brute force", () => {
  const P = [[0.2], [0.7], [0.5], [0.9]];
  const L = summedScoreDistribution(P, [0, 1, 2, 3], 1)[0];
  close(L.reduce((s, v) => s + v, 0), 1, 1e-12, "sum");
  const brute = new Array(5).fill(0);
  for (let m = 0; m < 16; m++) {
    let p = 1, s = 0;
    for (let j = 0; j < 4; j++) { const x = (m >> j) & 1; p *= x ? P[j][0] : 1 - P[j][0]; s += x; }
    brute[s] += p;
  }
  L.forEach((v, s) => close(v, brute[s], 1e-12, `score ${s}`));
});

test("chi-square tail matches known quantiles", () => {
  close(chiSquareSurvival(3.841459, 1), 0.05, 1e-6, "1 df");
  close(chiSquareSurvival(9.487729, 4), 0.05, 1e-6, "4 df");
  close(chiSquareSurvival(30.14353, 19), 0.05, 1e-6, "19 df");
  close(chiSquareSurvival(124.3421, 100), 0.05, 1e-5, "100 df");
  close(chiSquareSurvival(2, 2), Math.exp(-1), 1e-12, "2 df closed form");
  assert.equal(chiSquareSurvival(0, 3), 1);
});

test("test information is the sum of item informations, peaking at b for a lone item", () => {
  const c = testInformation([1.5], [-1.5 * 0.7], -4, 4, 0.1);
  const peak = c.reduce((m, p) => (p.info > m.info ? p : m));
  close(peak.theta, 0.7, 1e-9, "peak");
  close(peak.info, 1.5 ** 2 / 4, 1e-12, "a^2/4");
  const two = testInformation([1, 2], [0, 1], 0, 0, 1)[0];
  close(two.info, two.items[0] + two.items[1], 1e-12, "sum");
});

test("S-X2 on LSAT: groups, df and p-values are well formed; complete data gives a score table", () => {
  const r = analyze({ text: LSAT, model: "1pl" });
  for (const it of r.itemTable) { assert.ok(it.sx2df >= 1); assert.ok(it.sx2p > 0.05 && it.sx2p <= 1); }
  assert.equal(r.scoreTable.length, 6);
  close(r.scoreTable.reduce((s, x) => s + x.expectedShare, 0), 1, 1e-10, "score probabilities");
  for (let s = 1; s < 6; s++) assert.ok(r.scoreTable[s].eap > r.scoreTable[s - 1].eap);
});

test("key scoring, distractors and missing answers", () => {
  const r = analyze({ text: SAMPLE_TEXT });
  assert.ok(r.keyed);
  assert.equal(r.n, 20);
  assert.equal(r.distractors.length, 6);
  const q1 = r.distractors[0];
  assert.equal(q1.key, "B");
  close(q1.options.reduce((s, o) => s + o.share, 0), 1, 1e-12, "shares");
  assert.ok(r.warnings.some((w) => /Only 20 people/.test(w)));
  // The same answers scored by hand.
  const lines = SAMPLE_TEXT.trim().split("\n");
  const key = lines[1].split(",").slice(1);
  const scored = [lines[0], ...lines.slice(2).map((l) => { const c = l.split(","); return [c[0], ...c.slice(1).map((v, j) => (v === key[j] ? 1 : 0))].join(","); })].join("\n");
  const s = analyze({ text: scored, standardErrors: false });
  const k = analyze({ text: SAMPLE_TEXT, standardErrors: false });
  close(s.fit.logLik, k.fit.logLik, 1e-10, "keyed = hand-scored");
  // The key option overrides the row; blanks are missing.
  const withBlank = SAMPLE_TEXT.replace("Ben,B,D,C,C,A,D", "Ben,B,,C,C,A,D");
  const m = analyze({ text: withBlank });
  assert.equal(m.complete, false);
  assert.equal(m.scoreTable, null);
  assert.equal(m.itemTable[0].sx2, null);
  assert.equal(m.people.find((p) => p.id === "Ben").answered, 5);
});

test("parsing: headers, ids, weights, words for right and wrong, and clear errors", () => {
  const d = parseResponses("a,b,c\n1,0,1\n0,1,1\n");
  assert.deepEqual(d.items, ["a", "b", "c"]);
  const n = parseResponses("1,0,1\n0,1,0\n");
  assert.deepEqual(n.items, ["Item 1", "Item 2", "Item 3"]);
  assert.equal(n.X.length, 2);
  const w = parseResponses("name\tq1\tq2\nx\tright\twrong\ny\ttrue\tfalse\n");
  assert.deepEqual(w.ids, ["x", "y"]);
  assert.deepEqual(Array.from(w.X[0]), [1, 0]);
  const k = parseResponses("q1,q2\nA,B\nB,B\n", { key: "AB" });
  assert.deepEqual(k.X.map((x) => Array.from(x)), [[1, 1], [0, 1]]);
  assert.throws(() => parseResponses("q1,q2\nA,B\n"), /answer key/);
  assert.throws(() => parseResponses("q1,q2\nA,B\n", { key: "A" }), /1 answers but the table has 2/);
  assert.throws(() => analyze({ text: "a,b\n1,0\n0,1\n" }), /At least 20 people/);
  assert.throws(() => analyze({ text: "a,b,count\n1,1,30\n1,0,10\n" }), /a does not/);
  assert.throws(() => analyze({ text: LSAT, model: "3pl" }), /model must be/);
});

test("negative discrimination is flagged (a reversed key)", () => {
  const lines = LSAT.trim().split("\n");
  const flipped = [lines[0], ...lines.slice(1).map((l) => { const c = l.split(","); c[2] = c[2] === "1" ? "0" : "1"; return c.join(","); })].join("\n");
  const r = analyze({ text: flipped, model: "2pl" });
  assert.ok(r.itemTable[2].a < 0);
  assert.match(r.itemTable[2].flags.join(" "), /negative slope/);
});

test("simulation: recovery, coverage and S-X2 false alarms are on target (eval/simulation.json)", () => {
  const s = JSON.parse(file("eval/simulation.json")).summary;
  assert.ok(s.coverageA > 0.93 && s.coverageA < 0.97, `coverage a ${s.coverageA}`);
  assert.ok(s.coverageB > 0.93 && s.coverageB < 0.97, `coverage b ${s.coverageB}`);
  assert.ok(s.sx2FalseAlarmRate > 0.03 && s.sx2FalseAlarmRate < 0.07);
  assert.ok(s.rmseA < 0.2 && s.rmseB < 0.2);
});

test("outputs: CSVs, report and PAPERS", () => {
  const r = analyze({ text: LSAT });
  const items = itemCsv(r).trim().split("\n");
  assert.equal(items.length, 6);
  assert.match(items[0], /^item,a,a_se,b,b_se/);
  const people = peopleCsv(r).trim().split("\n");
  assert.equal(people.length, 31);
  assert.match(report(r), /No warranty/);
  const evil = analyze({ text: LSAT.replace("item1,", "=HYPERLINK(1),") });
  assert.match(itemCsv(evil), /\n'=HYPERLINK\(1\),/);
  assert.equal(csvCell("-3.5"), "-3.5");
  assert.equal(csvCell('a,"b"'), '"a,""b"""');
  for (const p of PAPERS) { assert.ok(p.cite && p.implemented && p.deviations, p.key); if (p.doi) assert.match(p.doi, /^10\./); }
});

// Red-team 2026-11-17: the 2PL standard errors had no check (only 1PL's), so a
// wrong unpacking of the interleaved (a, d) vector escaped. This compares them
// with an independent route: the second differences of the marginal
// log-likelihood itself (not the analytic score the engine differentiates).
test("2PL standard errors match the inverse of a finite-difference Hessian of the log-likelihood", () => {
  const r = analyze({ text: LSAT, model: "2pl" });
  const data = parseResponses(LSAT);
  const pat = compressPatterns(data.X, data.weights);
  const a = r.itemTable.map((it) => it.a), d = r.itemTable.map((it) => -it.a * it.b);
  const p0 = a.flatMap((v, j) => [v, d[j]]);
  const ll = (p) => marginalLogLik(pat, p.filter((_, i) => i % 2 === 0), p.filter((_, i) => i % 2 === 1));
  const k = p0.length, h = 1e-3;
  const H = Array.from({ length: k }, () => new Array(k).fill(0));
  const at = (i, si, j, sj) => { const p = p0.slice(); p[i] += si * h; p[j] += sj * h; return ll(p); };
  for (let i = 0; i < k; i++) for (let j = i; j < k; j++) {
    H[i][j] = H[j][i] = -(at(i, 1, j, 1) - at(i, 1, j, -1) - at(i, -1, j, 1) + at(i, -1, j, -1)) / (4 * h * h);
  }
  // Gauss-Jordan inverse
  const M = H.map((row, i) => [...row, ...row.map((_, j) => (i === j ? 1 : 0))]);
  for (let c = 0; c < k; c++) {
    let piv = c;
    for (let r2 = c + 1; r2 < k; r2++) if (Math.abs(M[r2][c]) > Math.abs(M[piv][c])) piv = r2;
    [M[c], M[piv]] = [M[piv], M[c]];
    const pv = M[c][c];
    for (let j = 0; j < 2 * k; j++) M[c][j] /= pv;
    for (let r2 = 0; r2 < k; r2++) if (r2 !== c) { const f = M[r2][c]; for (let j = 0; j < 2 * k; j++) M[r2][j] -= f * M[c][j]; }
  }
  const C = M.map((row) => row.slice(k));
  r.itemTable.forEach((it, j) => {
    const va = C[2 * j][2 * j], vd = C[2 * j + 1][2 * j + 1], cad = C[2 * j][2 * j + 1];
    const b = it.b, aj = it.a;
    const vb = (b * b * va + vd + 2 * b * cad) / (aj * aj);
    close(it.aSE, Math.sqrt(va), 2e-3 * Math.sqrt(va), `se(a${j + 1})`);
    close(it.bSE, Math.sqrt(vb), 2e-3 * Math.sqrt(vb), `se(b${j + 1})`);
  });
});

test("quoted cells: a closing quote ends the field, so a quoted header keeps its comma and the next column", () => {
  const d = parseResponses('"Item, one","q2",q3\n1,0,1\n0,1,1\n');
  assert.deepEqual(d.items, ["Item, one", "q2", "q3"]);
  assert.deepEqual(d.X.map((x) => Array.from(x)), [[1, 0, 1], [0, 1, 1]]);
  assert.throws(() => parseResponses("   \n  "), /No data/);
  assert.throws(() => parseResponses(null), /No data/);
});
