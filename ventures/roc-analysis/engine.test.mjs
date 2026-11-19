import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { analyze, placements, midranks, delong, rocCurve, areaUnder, mcclish, wilson, atCut, cutoffs, decisionCurve, chi2Sf, normInv, normSf, parseCsv, readData, toCsv, report, PAPERS } from "./engine.mjs";
import { EXAMPLE_CSV } from "./example-data.mjs";

const REF = JSON.parse(readFileSync(new URL("./eval/reference.json", import.meta.url), "utf8"));
const WDBC = readFileSync(new URL("./data/wdbc-markers.csv", import.meta.url), "utf8");
const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ""} ${a} vs ${b} (tol ${tol})`);
const refCase = (name) => REF.cases.find((c) => c.name === name);

function hanley() {
  const normal = [33, 6, 6, 11, 2];
  const abnormal = [3, 2, 2, 11, 33];
  const score = [];
  const y = [];
  normal.forEach((c, k) => { for (let i = 0; i < c; i++) { score.push(k + 1); y.push(0); } });
  abnormal.forEach((c, k) => { for (let i = 0; i < c; i++) { score.push(k + 1); y.push(1); } });
  return { score, y };
}

test("the example file and the bundled copy are the same bytes", () => {
  assert.equal(EXAMPLE_CSV, WDBC);
});

test("every paper has a DOI, what was implemented, and a deviations field", () => {
  for (const p of PAPERS) {
    assert.match(p.doi, /^10\./);
    assert.ok(p.implemented.length > 40);
    assert.ok("deviations" in p);
  }
});

test("midranks give tied values the mean of their ranks", () => {
  assert.deepEqual([...midranks([3, 1, 3, 2, 3])], [4, 1, 4, 2, 4]);
});

test("Hanley & McNeil (1982) rating data: AUC 0.893, as the paper reports", () => {
  const { score, y } = hanley();
  const p = placements(score, y);
  close(p.auc, 0.893, 0.0005, "published");
  const ref = refCase("hanley-mcneil-1982");
  close(p.auc, ref.auc[0], 1e-12);
  const d = delong([score], y);
  close(d.S[0][0], ref.S[0][0], 1e-14, "DeLong variance");
  // the polyline area equals the Mann-Whitney AUC with ties counted half
  close(areaUnder(rocCurve(score, y).points), p.auc, 1e-12);
});

test("WDBC: AUCs, DeLong covariance matrix, paired tests and chi-square match the O(mn) definition", () => {
  const ref = refCase("wdbc");
  const r = analyze({ csv: WDBC, resamples: 0 });
  assert.deepEqual(r.columns.scores, ref.names);
  assert.equal(r.n, 569);
  assert.equal(r.cases, 212);
  r.results.forEach((x, k) => {
    close(x.auc, ref.auc[k], 1e-12, `auc ${x.name}`);
    close(x.auc, ref.auc_mannwhitney[k], 1e-12, `mann-whitney ${x.name}`);
    close(x.lower, ref.lower[k], 1e-9, `lower ${x.name}`);
    close(x.upper, ref.upper[k], 1e-9, `upper ${x.name}`);
    close(x.partial.raw, ref.partial[k].raw, 1e-12, `pAUC ${x.name}`);
    close(x.partial.standardised, ref.partial[k].standardised, 1e-12);
  });
  for (let a = 0; a < 5; a++) for (let b = 0; b < 5; b++) close(r.covariance[a][b], ref.S[a][b], 1e-14, `S[${a}][${b}]`);
  r.comparison.pairs.forEach((p, i) => {
    const q = ref.pairs[i];
    assert.equal(p.a, q.a);
    close(p.diff, q.diff, 1e-12);
    close(p.se, q.se, 1e-12);
    close(p.z, q.z, 1e-8);
    close(p.p, q.p, Math.max(1e-7 * q.p, 1e-15), `p ${p.a}-${p.b}`);
  });
  close(r.comparison.overall.chi2, ref.overall.chi2, 1e-7);
  assert.equal(r.comparison.overall.df, 4);
});

test("WDBC: accuracy at a cut-off, Wilson intervals and LR+ match scipy", () => {
  const ref = refCase("wdbc").cut;
  const r = analyze({ csv: WDBC, scoreColumns: ["worst_concave_points"], threshold: ref.threshold, resamples: 0 });
  const a = r.results[0].at;
  assert.ok(a.chosen);
  assert.deepEqual([a.tp, a.fp, a.fn, a.tn], [ref.tp, ref.fp, ref.fn, ref.tn]);
  close(a.sensitivity.lower, ref.sens_ci[0], 1e-9);
  close(a.sensitivity.upper, ref.sens_ci[1], 1e-9);
  close(a.specificity.lower, ref.spec_ci[0], 1e-9);
  close(a.specificity.upper, ref.spec_ci[1], 1e-9);
  close(a.lrPlus.est, ref.lr_plus, 1e-9);
  close(a.lrPlus.lower, ref.lr_plus_ci[0], 1e-6);
  close(a.lrPlus.upper, ref.lr_plus_ci[1], 1e-6);
  const y = refCase("wdbc").youden;
  close(r.results[0].cutoffs.youden.threshold, y.threshold, 0);
  close(r.results[0].cutoffs.youden.youden, y.j, 1e-12);
});

test("simulated ties, a lower-is-case score and a 0.2 partial AUC match the reference", () => {
  const ref = refCase("simulated");
  const s = REF.simulated_data;
  const r = analyze({ y: s.y, scores: { a: s.a, b: s.b, c: s.c }, direction: { c: "lower" }, partialFpr: 0.2, threshold: 0.5, resamples: 0 });
  r.results.forEach((x, k) => {
    close(x.auc, ref.auc[k], 1e-12, x.name);
    close(x.partial.raw, ref.partial[k].raw, 1e-12, `pAUC ${x.name}`);
  });
  for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) close(r.covariance[a][b], ref.S[a][b], 1e-14);
  close(r.comparison.overall.chi2, ref.overall.chi2, 1e-8);
  close(r.comparison.overall.p, ref.overall.p, 1e-7);
  const at = r.results[0].at;
  assert.deepEqual([at.tp, at.fp, at.fn, at.tn], [ref.cut.tp, ref.cut.fp, ref.cut.fn, ref.cut.tn]);
  // a lower-is-case score reports its cut-offs on its own scale
  assert.equal(r.results[2].direction, "lower");
  const yc = r.results[2].cutoffs.youden;
  const cases = s.y.reduce((t, v, i) => t + (v && s.c[i] <= yc.threshold ? 1 : 0), 0);
  close(yc.sensitivity, cases / s.y.reduce((t, v) => t + v, 0), 1e-12);
});

test("decision curve: net benefit matches the formula, only for probability columns", () => {
  const r = analyze({ csv: WDBC, resamples: 0 });
  const withCurve = r.results.filter((x) => x.decision).map((x) => x.name);
  assert.deepEqual(withCurve, ["cv_probability"]);
  const dc = r.results[4].decision;
  for (const q of REF.decision_wdbc_cv_probability) {
    const row = dc.rows.find((x) => Math.abs(x.pt - q.pt) < 1e-9);
    close(row.model, q.model, 1e-12, `model at ${q.pt}`);
    close(row.all, q.all, 1e-12, `all at ${q.pt}`);
  }
  // asking for a column that is not a probability draws none and says so
  const r2 = analyze({ csv: WDBC, scoreColumns: "worst_perimeter", probabilityColumns: "worst_perimeter", resamples: 0 });
  assert.equal(r2.results[0].decision, null);
  assert.ok(r2.warnings.some((w) => /decision curve needs probabilities/.test(w)));
});

test("perfect, useless and reversed scores", () => {
  const y = [0, 0, 0, 0, 0, 1, 1, 1, 1, 1];
  const perfect = analyze({ y, score: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], resamples: 0 });
  assert.equal(perfect.results[0].auc, 1);
  assert.equal(perfect.results[0].at.sensitivity.est, 1);
  assert.equal(perfect.results[0].at.specificity.est, 1);
  const flat = analyze({ y, score: new Array(10).fill(3), resamples: 0 });
  assert.equal(flat.results[0].auc, 0.5);
  const rev = analyze({ y, score: [10, 9, 8, 7, 6, 5, 4, 3, 2, 1], resamples: 0 });
  assert.equal(rev.results[0].auc, 0);
  assert.ok(rev.warnings.some((w) => /below 0\.5/.test(w)));
  const fixed = analyze({ y, score: [10, 9, 8, 7, 6, 5, 4, 3, 2, 1], direction: "lower", resamples: 0 });
  assert.equal(fixed.results[0].auc, 1);
});

test("cut-off rules: target sensitivity takes the most specific cut that reaches it", () => {
  const { score, y } = hanley();
  const c = cutoffs(rocCurve(score, y).points, { targetSensitivity: 0.9, targetSpecificity: 0.9 });
  // rating >= 4 catches 44 of 51 (86%); >= 3 catches 46 (90.2%)
  assert.equal(c.forSensitivity.threshold, 3);
  // rating >= 5 keeps 56 of 58 normals (96.6%); >= 4 keeps 45 (77.6%)
  assert.equal(c.forSpecificity.threshold, 5);
  assert.equal(c.youden.threshold, 4);
});

test("special functions", () => {
  close(normInv(0.975), 1.959963984540054, 1e-8);
  close(normSf(1.959963984540054), 0.025, 1e-8);
  close(chi2Sf(3.841458820694124, 1), 0.05, 1e-9);
  close(chi2Sf(9.487729036781154, 4), 0.05, 1e-9);
  close(chi2Sf(0.5, 3), 0.918891411654676, 1e-9);
  const w = wilson(0, 10);
  assert.equal(w.lower, 0);
  close(mcclish(0.005, 0.1), 0.5, 1e-12);
  close(mcclish(0.1, 0.1), 1, 1e-12);
});

test("prevalence option gives Bayes predictive values", () => {
  const { score, y } = hanley();
  const a = atCut(score, y, 4, { prevalence: 0.1 });
  const s = a.sensitivity.est;
  const sp = a.specificity.est;
  close(a.ppv.est, (s * 0.1) / (s * 0.1 + (1 - sp) * 0.9), 1e-12);
});

test("bootstrap interval for the partial AUC brackets the estimate and reproduces with the seed", () => {
  const a = analyze({ csv: WDBC, scoreColumns: ["worst_perimeter"], resamples: 200, seed: 7 });
  const b = analyze({ csv: WDBC, scoreColumns: ["worst_perimeter"], resamples: 200, seed: 7 });
  const p = a.results[0].partial;
  assert.ok(p.interval.lower < p.standardised && p.standardised < p.interval.upper);
  assert.deepEqual(p.interval, b.results[0].partial.interval);
});

test("reading tables: labels, guessed case value, skipped rows and errors", () => {
  const csv = "patient,group,marker,other\n1,control,1.2,3\n2,case,3.4,1\n3,control,0.8,2\n4,case,2.2,\n5,control,1.1,4\n6,case,2.9,1\n7,control,1.5,2\n8,case,1.9,2\n9,control,0.4,5\n10,case,4.0,1\n11,control,1.0,3\n12,case,2.5,2";
  const d = readData(parseCsv(csv), {});
  assert.equal(d.columns.outcome, "group");
  assert.deepEqual(d.columns.scores, ["marker", "other"]);
  assert.equal(d.skipped, 1);
  assert.equal(d.y.length, 11);
  const r = analyze({ csv, scoreColumns: "marker", resamples: 0 });
  assert.equal(r.results[0].auc, 1);
  assert.throws(() => analyze({ csv: "a,b\nx,2\ny,4\nz,5" }), /No outcome column/);
  // a yes/no test result is a score too: its curve has one corner
  const bin = analyze({ csv: "test,disease\n" + [[1, 1], [1, 1], [0, 1], [1, 0], [0, 0], [0, 0], [0, 0], [1, 1], [0, 0], [0, 1]].map((r) => r.join(",")).join("\n"), outcomeColumn: "disease", resamples: 0 });
  assert.deepEqual(bin.columns.scores, ["test"]);
  assert.equal(bin.results[0].distinct, 2);
  assert.throws(() => analyze({ csv, scoreColumns: "nope" }), /No column named "nope"/);
  assert.throws(() => analyze({ y: [1, 0, 1], score: [1, 2, 3] }), /at least 2 cases and 2 non-cases/);
  assert.throws(() => analyze({ y: [1, 0], score: [1] }), /one number per outcome/);
  assert.throws(() => analyze({ csv, level: 2 }), /level must be/);
  assert.throws(() => analyze({}), /Give "csv"/);
});

test("report, summary and CSV of every cut-off", () => {
  const r = analyze({ csv: WDBC, resamples: 0 });
  assert.match(r.summary, /cv_probability, has AUC 0\.991/);
  assert.match(r.summary, /worst_concave_points vs worst_perimeter \(p = 0\.2395\)/);
  const txt = report(r);
  assert.match(txt, /Paired comparisons \(DeLong\)/);
  assert.match(txt, /not medical, legal, financial or professional advice/);
  const lines = toCsv(r).trim().split("\n");
  assert.equal(lines[0], "score,threshold,true_positives,false_positives,sensitivity,specificity,youden_j");
  const distinct = r.results.reduce((s, x) => s + x.distinct, 0);
  assert.equal(lines.length, 1 + distinct);
  assert.ok(r.results.every((x) => x.curve.length <= 600));
});

test("parseCsv keeps a quoted field with commas, quotes and line breaks together", () => {
  const p = parseCsv('\uFEFFnote,y,s\r\n# a comment\r\n"two\nlines, and ""quotes""",1,0.5\n\nplain,0,0.2\n');
  assert.deepEqual(p.header, ["note", "y", "s"]);
  assert.equal(p.rows.length, 2);
  assert.deepEqual(p.rows[0], ['two\nlines, and "quotes"', "1", "0.5"]);
  assert.deepEqual(parseCsv("a b\n1 2\n3 4").rows, [["1", "2"], ["3", "4"]]);
});
