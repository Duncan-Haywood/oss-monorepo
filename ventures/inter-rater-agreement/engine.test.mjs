import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  analyze, krippendorffAlpha, fleissKappa, gwetAC, cohenKappa, weightMatrix, icc, fPpf, fCdf, normPpf, normSf,
  readTable, parseCsv, landisKoch, kooLi, PAPERS, toCsv, report,
} from "./engine.mjs";

const REF = JSON.parse(readFileSync(new URL("./eval/reference.json", import.meta.url), "utf8"));
const EXAMPLE = readFileSync(new URL("./data/goemotions-sentiment.csv", import.meta.url), "utf8");
const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b} (tol ${tol})`);
const coef = (r, key) => r.coefficients.find((c) => c.key === key);

// rows of raters (null missing) -> subjects x category counts, categories 1..q
function countsOf(rows, q, base = 1) {
  return rows.map((row) => {
    const c = new Array(q).fill(0);
    for (const v of row) if (v != null) c[v - base]++;
    return c;
  });
}

test("Krippendorff (2011) worked example: the four published alphas", () => {
  const k = REF.krippendorff2011;
  const counts = countsOf(k.ratings, 5);
  const vals = [1, 2, 3, 4, 5];
  // Published in the paper to three decimals; the reference library to full precision.
  for (const [m, pub] of [["nominal", 0.743], ["ordinal", 0.815], ["interval", 0.849], ["ratio", 0.797]]) {
    const a = krippendorffAlpha(counts, vals, m);
    close(a, pub, 0.0005, `${m} vs paper`);
    close(a, k[`alpha_${m}`], 1e-12, `${m} vs krippendorff ${REF.versions.krippendorff}`);
  }
});

test("five raters with 15% missing: alpha for all four metrics, Fleiss and Gwet (plain and quadratic)", () => {
  const m = REF.multi_missing;
  const counts = countsOf(m.ratings, 4);
  for (const metric of ["nominal", "ordinal", "interval", "ratio"]) close(krippendorffAlpha(counts, [1, 2, 3, 4], metric), m[`alpha_${metric}`], 1e-12, metric);
  // irrCAC rounds to 5 decimals.
  close(fleissKappa(counts), m.fleiss, 6e-6, "Fleiss generalised");
  close(gwetAC(counts), m.gwet, 6e-6, "Gwet AC1");
  const Wq = weightMatrix(4, "quadratic");
  close(fleissKappa(counts, Wq), m.fleiss_quadratic, 6e-6, "Fleiss quadratic");
  close(gwetAC(counts, Wq), m.gwet_quadratic, 6e-6, "Gwet AC2 quadratic");
});

test("complete data: Fleiss (1971) equals statsmodels' fleiss_kappa", () => {
  const f = REF.fleiss_complete;
  close(fleissKappa(countsOf(f.ratings, 3, 0)), f.statsmodels_fleiss, 1e-12, "Fleiss");
});

test("two raters: Cohen's kappa (none, linear, quadratic) and its standard errors match sklearn and statsmodels", () => {
  const t = REF.two_raters;
  for (const w of ["none", "linear", "quadratic"]) {
    const W = w === "none" ? weightMatrix(5) : weightMatrix(5, w);
    const k = cohenKappa(t.a, t.b, 5, W);
    close(k.kappa, t[`sklearn_${w}`], 1e-12, `kappa ${w} vs sklearn`);
    close(k.se, t[`statsmodels_${w}`].se, 1e-12, `SE ${w}`);
    close(k.se0, t[`statsmodels_${w}`].se0, 1e-12, `null SE ${w}`);
  }
});

test("ICC: Shrout & Fleiss (1979) table and McGraw-Wong intervals", () => {
  const s = REF.shroutfleiss.icc;
  const r = icc(REF.shroutfleiss.ratings);
  // Shrout & Fleiss's own Table 4 values, to two decimals.
  const pub = { ICC1: 0.17, ICC2: 0.29, ICC3: 0.71, ICC1k: 0.44, ICC2k: 0.62, ICC3k: 0.91 };
  for (const f of r.forms) {
    close(f.value, pub[f.key], 0.005, `${f.key} vs paper`);
    close(f.value, s[f.key].icc, 1e-12, `${f.key} vs pingouin`);
    close(f.F, s[f.key].F, 1e-9, `${f.key} F`);
    close(f.p, s[f.key].p, 1e-9, `${f.key} p`);
    close(f.low, s[f.key].low, 1e-8, `${f.key} low`);
    close(f.high, s[f.key].high, 1e-8, `${f.key} high`);
    close(f.low, s[f.key].pingouin_ci95[0], 0.005, `${f.key} low vs pingouin (2 dp)`);
  }
});

test("ICC on 40 subjects x 3 biased raters, and interval alpha on the same", () => {
  const n = REF.icc_numeric;
  const r = icc(n.ratings);
  for (const f of r.forms) {
    close(f.value, n.icc[f.key].icc, 1e-12, f.key);
    close(f.low, n.icc[f.key].low, 1e-8, `${f.key} low`);
    close(f.high, n.icc[f.key].high, 1e-8, `${f.key} high`);
    close(f.p, n.icc[f.key].p, 1e-30 + 1e-6 * n.icc[f.key].p, `${f.key} p`);
  }
  const res = analyze({ ratings: n.ratings, bootstrap: 0 });
  assert.equal(res.scale, "interval");
  close(coef(res, "alpha").value, n.alpha_interval, 1e-12, "alpha interval");
  close(coef(res, "icc").value, n.icc.ICC2.icc, 1e-12, "headline ICC(2,1)");
});

test("the bundled GoEmotions example: long layout read, coefficients match irrCAC and krippendorff", () => {
  const g = REF.goemotions;
  const r = analyze({ csv: EXAMPLE });
  assert.equal(r.layout, "long");
  assert.equal(r.scale, "nominal");
  assert.equal(r.nSubjects, 300);
  assert.equal(r.nRaters, 75);
  assert.equal(r.nRatings, 1173);
  assert.deepEqual(r.categories.map((c) => c.category), g.categories);
  close(coef(r, "alpha").value, g.alpha_nominal, 1e-12, "alpha");
  close(coef(r, "fleiss").value, g.fleiss, 6e-6, "Fleiss");
  close(coef(r, "gwet").value, g.gwet, 6e-6, "Gwet");
  close(r.percentAgreement, g.pa, 6e-6, "percent agreement");
  const a = coef(r, "alpha");
  assert.ok(a.low < a.value && a.value < a.high, "interval brackets the estimate");
  assert.equal(r.cohen, null);
  assert.equal(r.pairwise, null, "75 raters: no pairwise table");
  assert.equal(r.dropOne.length, 75);
  assert.equal(r.perCategory.length, 5);
  assert.match(r.summary, /Krippendorff's alpha is 0\.276/);
  assert.match(r.summary, /below Krippendorff's 0\.667 minimum/);
});

test("bootstrap is seeded: same seed same interval, different seed different", () => {
  const a = analyze({ csv: EXAMPLE, bootstrap: 300 });
  const b = analyze({ csv: EXAMPLE, bootstrap: 300 });
  const c = analyze({ csv: EXAMPLE, bootstrap: 300, seed: 7 });
  assert.deepEqual(coef(a, "alpha"), coef(b, "alpha"));
  assert.notEqual(coef(a, "alpha").low, coef(c, "alpha").low);
});

test("perfect agreement gives 1, and independent random ratings give about 0", () => {
  const same = Array.from({ length: 30 }, (_, i) => [i % 4, i % 4, i % 4].map(String));
  const r = analyze({ ratings: same, scale: "nominal", bootstrap: 0 });
  for (const k of ["alpha", "fleiss", "gwet", "light"]) close(coef(r, k).value, 1, 1e-12, k);
  let s = 12345;
  const rnd = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
  const noise = Array.from({ length: 3000 }, () => [0, 1].map(() => String(Math.floor(rnd() * 3))));
  const n = analyze({ ratings: noise, bootstrap: 0 });
  assert.ok(Math.abs(coef(n, "alpha").value) < 0.03, `alpha ${coef(n, "alpha").value}`);
  assert.ok(Math.abs(coef(n, "cohen").value) < 0.03);
});

test("invariances: relabelling categories, reordering raters and subjects leave nominal alpha unchanged", () => {
  const m = REF.multi_missing.ratings;
  const base = krippendorffAlpha(countsOf(m, 4), [1, 2, 3, 4], "nominal");
  const relabel = { 1: "d", 2: "a", 3: "c", 4: "b" };
  const shuffled = [...m].reverse().map((row) => [...row].reverse().map((v) => (v == null ? "" : relabel[v])));
  const r = analyze({ ratings: shuffled, scale: "nominal", bootstrap: 0 });
  close(coef(r, "alpha").value, base, 1e-12, "alpha");
  // Interval alpha is unchanged by a linear change of units.
  const lin = m.map((row) => row.map((v) => (v == null ? null : 10 * v + 3)));
  const r2 = analyze({ ratings: lin, scale: "interval", bootstrap: 0 });
  close(coef(r2, "alpha").value, REF.multi_missing.alpha_interval, 1e-12, "interval alpha after 10x+3");
});

test("the same data in wide, long and counts layouts give the same alpha", () => {
  const m = REF.multi_missing.ratings;
  const wide = "id,r1,r2,r3,r4,r5\n" + m.map((row, i) => [`s${i}`, ...row.map((v) => v ?? "")].join(",")).join("\n");
  const long = "subject,rater,rating\n" + m.flatMap((row, i) => row.map((v, j) => (v == null ? null : `s${i},r${j},${v}`)).filter(Boolean)).join("\n");
  const counts = "id,1,2,3,4\n" + countsOf(m, 4).map((c, i) => [`s${i}`, ...c].join(",")).join("\n");
  const rw = analyze({ csv: wide, scale: "ordinal", bootstrap: 0 });
  const rl = analyze({ csv: long, scale: "ordinal", bootstrap: 0 });
  const rc = analyze({ csv: counts, layout: "counts", scale: "ordinal", bootstrap: 0 });
  assert.equal(rw.layout, "wide");
  assert.equal(rw.nRaters, 5);
  assert.equal(rl.layout, "long");
  assert.equal(rc.layout, "counts");
  for (const r of [rw, rl, rc]) close(coef(r, "alpha").value, REF.multi_missing.alpha_ordinal, 1e-12, r.layout);
  close(coef(rc, "fleiss").value, REF.multi_missing.fleiss_quadratic, 6e-6, "counts Fleiss quadratic");
  assert.equal(rc.dropOne, null, "counts carry no rater identity");
  assert.equal(rw.subjects[0].id, "s0");
});

test("auto scale: labels nominal, few whole numbers ordinal, many numbers interval, a category order ordinal", () => {
  assert.equal(analyze({ ratings: [["a", "b"], ["a", "a"], ["b", "b"]], bootstrap: 0 }).scale, "nominal");
  assert.equal(analyze({ ratings: [[1, 2], [2, 2], [3, 3], [1, 1]], bootstrap: 0 }).scale, "ordinal");
  assert.equal(analyze({ ratings: REF.icc_numeric.ratings, bootstrap: 0 }).scale, "interval");
  const r = analyze({ ratings: [["low", "mid"], ["mid", "mid"], ["high", "high"], ["low", "low"]], categories: "low,mid,high", bootstrap: 0 });
  assert.equal(r.scale, "ordinal");
  assert.deepEqual(r.categories.map((c) => c.category), ["low", "mid", "high"]);
});

test("two ordered raters: weighted kappas, confusion table, PABAK and the paradox note", () => {
  const t = REF.two_raters;
  const r = analyze({ ratings: t.a.map((v, i) => [v + 1, t.b[i] + 1]), bootstrap: 0 });
  assert.equal(r.scale, "ordinal");
  close(r.cohen.unweighted.kappa, t.sklearn_none, 1e-12, "unweighted");
  close(r.cohen.linear.kappa, t.sklearn_linear, 1e-12, "linear");
  close(r.cohen.quadratic.kappa, t.sklearn_quadratic, 1e-12, "quadratic");
  assert.equal(r.cohen.confusion.flat().reduce((s, v) => s + v, 0), 120);
  close(coef(r, "cohen").value, t.sklearn_quadratic, 1e-12, "headline is quadratic for ordinal");
  // Kappa paradox: 95% agreement on a rare category.
  const rows = [...Array(90).fill(["no", "no"]), ...Array(5).fill(["no", "yes"]), ...Array(5).fill(["yes", "no"])];
  const p = analyze({ ratings: rows, bootstrap: 0 });
  assert.ok(coef(p, "cohen").value < 0);
  close(p.cohen.pabak, 0.8, 1e-12, "PABAK");
  close(p.cohen.prevalenceIndex, 0.9, 1e-12, "prevalence index");
  assert.match(p.summary, /kappa paradox/);
});

test("drop-one finds the rater who disagrees", () => {
  const rows = Array.from({ length: 40 }, (_, i) => {
    const t = i % 3;
    return [t, t, t, (t + 1 + (i % 2)) % 3].map(String);
  });
  const r = analyze({ ratings: rows, raters: ["ann", "bo", "cy", "dee"], bootstrap: 0 });
  const best = [...r.dropOne].sort((a, b) => b.change - a.change)[0];
  assert.equal(best.rater, "dee");
  close(best.alphaWithout, 1, 1e-12, "alpha without dee");
  assert.match(r.summary, /Leaving out rater "dee"/);
  assert.equal(r.pairwise.pairs.length, 6);
});

test("missing markers, repeated long pairs and bad input", () => {
  const t = readTable({ csv: "item,coder,code\na,x,1\na,y,NA\na,y,2\nb,x,1\nb,y,1\nb,y,2\n" });
  assert.equal(t.layout, "long");
  assert.deepEqual(t.subjects.map((s) => s.values), [["1", "NA"], ["1", "1"]]);
  assert.match(t.warnings[0], /repeated/);
  assert.throws(() => analyze({ ratings: [["a", "b"]] }), /at least two subjects/);
  assert.throws(() => analyze({ ratings: [["a", "b"], ["b", "b"]], scale: "interval" }), /numeric ratings/);
  assert.throws(() => analyze({ csv: "r1,r2\n1,2\n2,2\n", scale: "bogus" }), /Unknown scale/);
  assert.throws(() => analyze({ counts: [[1.5, 2]] }), /whole numbers/);
  assert.throws(() => analyze({}), /Give/);
  assert.throws(() => analyze({ ratings: [["a", "b"], ["b", "b"]], categories: ["a"] }), /not in the category list/);
});

test("distribution helpers", () => {
  close(fPpf(0.975, 5, 18), 3.3820, 1e-4, "F(5,18) 97.5%");
  close(fCdf(fPpf(0.9, 3.7, 12.2), 3.7, 12.2), 0.9, 1e-10, "F round trip, fractional df");
  close(normPpf(0.975), 1.959963984540054, 1e-12, "z 97.5%");
  close(normSf(3), 0.0013498980316301, 1e-14, "normal tail");
  close(normSf(-1), 0.8413447460685429, 1e-14, "normal tail negative");
  assert.equal(landisKoch(0.5), "moderate");
  assert.equal(kooLi(0.8), "good");
});

test("PAPERS have what describe prints, and the CSV and report render", () => {
  assert.ok(PAPERS.length >= 10);
  for (const p of PAPERS) for (const k of ["authors", "title", "venue", "year", "url", "implemented", "deviations"]) assert.ok(p[k], `${p.title} ${k}`);
  const r = analyze({ csv: EXAMPLE, bootstrap: 50 });
  const csv = toCsv(r).trim().split("\n");
  assert.equal(csv.length, 301);
  assert.match(csv[0], /^subject,ratings,modal_rating/);
  assert.match(report(r), /Per category/);
  assert.equal(parseCsv("a;b\n1;2\n").header[1], "b");
});
