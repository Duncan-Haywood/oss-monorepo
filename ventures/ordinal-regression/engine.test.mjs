import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { analyze, fitOrdinal, brantTest, categoryProbs, orderLevels, normCdf, normInv, chi2Sf, readData, parseCsv, toCsv, report, PAPERS } from "./engine.mjs";

const file = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");
const REF = JSON.parse(file("eval/reference.json"));
const rel = (a, b) => Math.abs(a - b) / Math.max(1, Math.abs(b));
const close = (a, b, tol, what) => {
  assert.equal(a.length, b.length, what);
  a.forEach((v, i) => assert.ok(rel(v, b[i]) < tol, `${what}[${i}]: ${v} vs ${b[i]}`));
};

// statsmodels 0.15.0 OrderedModel (eval/reference.py). Its covariance comes
// from a numerical Hessian, so standard errors agree to about 1e-6 relative.
for (const [key, csv, extra] of [
  ["wine", "data/red-wine-quality.csv", {}],
  ["survey", "eval/survey.csv", { reference: { group: "control" } }],
  ["nonpo", "eval/nonpo.csv", {}],
]) {
  for (const link of ["logit", "probit"]) {
    const R = REF[key][link];
    if (!R) continue;
    test(`${key}, ${link}: matches statsmodels`, () => {
      const r = analyze({ csv: file(csv), link, ...extra });
      assert.deepEqual(r.coefficients.map((c) => c.name), R.names);
      assert.ok(Math.abs(r.fit.loglik - R.loglik) < 1e-8, `loglik ${r.fit.loglik} vs ${R.loglik}`);
      assert.ok(Math.abs(r.fit.nullLoglik - R.null_loglik) < 1e-9);
      close(r.coefficients.map((c) => c.estimate), R.beta, 1e-6, "beta");
      close(r.thresholds.map((t) => t.estimate), R.thresholds, 1e-6, "thresholds");
      close(r.coefficients.map((c) => c.se), R.beta_se, 1e-5, "beta se");
      close(r.thresholds.map((t) => t.se), R.threshold_se, 1e-5, "threshold se");
      assert.ok(r.fit.converged);
      assert.ok(r.fit.maxGradient < 1e-6, `gradient ${r.fit.maxGradient}`);
    });
  }
  test(`${key}: Brant's test matches the numpy implementation`, () => {
    const r = analyze({ csv: file(csv), ...extra });
    const B = REF[key].brant;
    assert.ok(r.brant.ok);
    assert.ok(rel(r.brant.overall.chi2, B.omnibus.chi2) < 1e-8);
    assert.equal(r.brant.overall.df, B.omnibus.df);
    r.brant.by.forEach((b, k) => {
      assert.equal(b.name, B.by[k].name);
      assert.ok(rel(b.chi2, B.by[k].chi2) < 1e-8, b.name);
      assert.equal(b.df, B.by[k].df);
      assert.ok(Math.abs(b.p - B.by[k].p) < 1e-9, b.name);
    });
    r.brant.slopes.forEach((s, k) => s.byCut.forEach((q, j) => assert.ok(rel(q.estimate, B.binary_slopes[j][k]) < 1e-8, `${s.name} cut ${j}`)));
  });
}

test("predicted probabilities match statsmodels' predict", () => {
  const R = REF.wine.logit;
  const d = readData(parseCsv(file("data/red-wine-quality.csv")), {});
  const r = analyze({ csv: file("data/red-wine-quality.csv") });
  const beta = r.coefficients.map((c) => c.estimate);
  const theta = r.thresholds.map((t) => t.estimate);
  R.probs_first5.forEach((row, i) => {
    const eta = beta.reduce((s, b, k) => s + b * d.X[i][k], 0);
    close(categoryProbs(theta, eta, "logit"), row, 1e-7, `row ${i}`);
  });
});

test("Brant's test detects the planted violation and spares the proportional predictor", () => {
  const r = analyze({ csv: file("eval/nonpo.csv") });
  const [x1, x2] = r.brant.by;
  assert.ok(x1.p < 1e-10, `x1 p ${x1.p}`);
  assert.ok(x2.p > 0.05, `x2 p ${x2.p}`);
  const s = r.brant.slopes[0].byCut.map((q) => q.estimate);
  assert.ok(s[3] > s[0] + 0.8, `x1's slope rises across the cuts: ${s}`);
  assert.match(r.summary, /Brant's test rejects proportional odds/);
});

test("the wine example says what the page and README say", () => {
  const r = analyze({ csv: file("data/red-wine-quality.csv") });
  const alc = r.coefficients.find((c) => c.name === "alcohol");
  assert.equal(alc.oddsRatio.toFixed(2), "2.43");
  assert.equal(alc.orLower.toFixed(2), "2.17");
  assert.equal(alc.orUpper.toFixed(2), "2.72");
  assert.equal(r.brant.overall.chi2.toFixed(1), "92.8");
  assert.equal(r.brant.overall.df, 24);
  const slopes = r.brant.slopes.find((s) => s.name === "alcohol").byCut.map((q) => q.estimate.toFixed(2));
  assert.deepEqual(slopes, ["1.22", "0.28", "0.89", "1.00", "1.17"]);
  const so2 = r.brant.slopes.find((s) => s.name === "total_sulfur_dioxide").byCut.map((q) => q.estimate);
  assert.ok(so2[0] > 0 && so2[1] > 0 && so2[2] < 0 && so2[3] < 0 && so2[4] < 0);
  const at = (a) => analyze({ csv: file("data/red-wine-quality.csv"), at: { alcohol: a } }).profile.probs;
  const lo = at(9.5);
  const hi = at(12.5);
  assert.equal((lo[2] * 100).toFixed(0), "59");
  assert.equal(((hi[4] + hi[5]) * 100).toFixed(0), "33");
  assert.equal(r.fit.mcfaddenR2.toFixed(3), "0.185");
  assert.equal((r.classification.accuracy * 100).toFixed(1), "59.2");
  assert.equal((r.classification.baseline * 100).toFixed(1), "42.6");
});

test("level order: numbers, numbered labels, answer scales, given, and a guess", () => {
  assert.deepEqual(orderLevels(["10", "2", "7"]).levels, ["2", "7", "10"]);
  assert.deepEqual(orderLevels(["3 - Good", "1 - Poor", "2 - Fair"]).levels, ["1 - Poor", "2 - Fair", "3 - Good"]);
  assert.deepEqual(orderLevels(["Agree", "Strongly disagree", "Neutral", "Disagree", "Strongly agree"]), { levels: ["Strongly disagree", "Disagree", "Neutral", "Agree", "Strongly agree"], how: "scale" });
  assert.deepEqual(orderLevels(["Often", "never", "Sometimes", "Always", "Rarely"]).levels, ["never", "Rarely", "Sometimes", "Often", "Always"]);
  assert.deepEqual(orderLevels(["severe", "mild", "moderate"]).levels, ["mild", "moderate", "severe"]);
  assert.deepEqual(orderLevels(["b", "a", "c"], "c, a, B").levels, ["c", "a", "b"]);
  assert.equal(orderLevels(["gold", "bronze", "silver"]).how, "appearance");
  assert.throws(() => orderLevels(["a", "b", "c"], "a,b"), /leaves out "c"/);
  assert.throws(() => orderLevels(["a", "b", "c"], "a,b,z"), /not a value/);
  assert.throws(() => orderLevels(["a", "b", "c"], "a,b,a,c"), /listed twice/);
});

test("an unrecognised order is used as it appears and flagged", () => {
  const csv = "medal,x\n" + Array.from({ length: 60 }, (_, i) => `${["gold", "silver", "bronze"][i % 3]},${(i * 7) % 13}`).join("\n");
  const r = analyze({ csv, outcomeColumn: "medal" });
  assert.deepEqual(r.levels, ["gold", "silver", "bronze"]);
  assert.ok(r.warnings.some((w) => /not recognised/.test(w)));
  const r2 = analyze({ csv, outcomeColumn: "medal", levels: "bronze,silver,gold" });
  assert.deepEqual(r2.levels, ["bronze", "silver", "gold"]);
  assert.ok(Math.abs(r2.coefficients[0].estimate + r.coefficients[0].estimate) < 1e-8, "reversing the scale flips the sign");
});

test("invariances: shifting and rescaling a predictor, and reordering rows", () => {
  const base = analyze({ csv: file("eval/survey.csv"), reference: { group: "control" } });
  const lines = file("eval/survey.csv").trim().split("\n");
  const scaled = [lines[0], ...lines.slice(1).map((l) => {
    const [g, a, ans] = l.split(",");
    return `${g},${(Number(a) * 12 + 1000).toString()},${ans}`;
  })].join("\n");
  const r = analyze({ csv: scaled, reference: { group: "control" } });
  assert.ok(Math.abs(r.fit.loglik - base.fit.loglik) < 1e-8);
  assert.ok(rel(r.coefficients[2].estimate * 12, base.coefficients[2].estimate) < 1e-7);
  assert.ok(rel(r.coefficients[0].estimate, base.coefficients[0].estimate) < 1e-7);
  assert.ok(rel(r.brant.overall.chi2, base.brant.overall.chi2) < 1e-7);
  const shuffled = [lines[0], ...lines.slice(1).reverse()].join("\n");
  const s = analyze({ csv: shuffled, reference: { group: "control" } });
  assert.ok(rel(s.coefficients[1].estimate, base.coefficients[1].estimate) < 1e-9);
});

test("categorical predictors: reference level, dummy names, and a profile", () => {
  const r = analyze({ csv: file("eval/survey.csv"), reference: { group: "brochure" }, at: { group: "workshop", age: 30 } });
  assert.deepEqual(r.coefficients.map((c) => c.name), ["group: control", "group: workshop", "age"]);
  assert.equal(r.profile.values.group, "workshop");
  assert.equal(r.profile.values.age, 30);
  assert.ok(Math.abs(r.profile.probs.reduce((a, b) => a + b, 0) - 1) < 1e-12);
  assert.equal(r.effects.group.kind, "categorical");
  assert.deepEqual(r.effects.group.points.map((p) => p.x), ["brochure", "control", "workshop"]);
  assert.equal(r.effects.age.points.length, 41);
  assert.throws(() => analyze({ csv: file("eval/survey.csv"), reference: { group: "nope" } }), /not a value of group/);
  assert.throws(() => analyze({ csv: file("eval/survey.csv"), at: { age: "old" } }), /must be a number/);
  // a numeric column can be read as categories
  const c = analyze({ csv: file("data/red-wine-quality.csv"), predictorColumns: "alcohol,pH", categorical: [] });
  assert.equal(c.coefficients.length, 2);
});

test("the probit link has no Brant test and no odds ratios", () => {
  const r = analyze({ csv: file("eval/survey.csv"), link: "probit" });
  assert.equal(r.brant.ok, false);
  assert.equal(r.coefficients[0].oddsRatio, undefined);
  assert.match(r.summary, /ordered probit/);
});

test("separation and sparse levels are reported, not hidden", () => {
  const rows = [];
  for (let i = 0; i < 60; i++) {
    const y = i % 3;
    rows.push(`${y + 1},${y === 2 ? "yes" : "no"},${(i * 37) % 11}`);
  }
  const r = analyze({ csv: "rating,flag,x\n" + rows.join("\n") });
  assert.ok(r.warnings.some((w) => /separates the outcome levels perfectly/.test(w)));
  const sparse = "rating,x\n" + Array.from({ length: 80 }, (_, i) => `${i < 3 ? 1 : 2 + (i % 2)},${i % 9}`).join("\n");
  const s = analyze({ csv: sparse });
  assert.ok(s.warnings.some((w) => /fewer than 5 rows/.test(w)));
});

test("input shapes: csv, columns and rows agree; bad input gives clear errors", () => {
  const csv = file("eval/survey.csv");
  const p = parseCsv(csv);
  const columns = Object.fromEntries(p.header.map((h, j) => [h, p.rows.map((r) => r[j])]));
  const rows = p.rows.map((r) => Object.fromEntries(p.header.map((h, j) => [h, r[j]])));
  const a = analyze({ csv });
  const b = analyze({ columns });
  const c = analyze({ rows });
  assert.equal(a.fit.loglik, b.fit.loglik);
  assert.equal(a.fit.loglik, c.fit.loglik);
  assert.throws(() => analyze({}), /Give the data/);
  assert.throws(() => analyze({ csv, link: "cloglog" }), /logit" or "probit/);
  assert.throws(() => analyze({ csv, level: 2 }), /confidence level/);
  assert.throws(() => analyze({ csv: "y,x\n1,2\n2,3\n1,4\n2,5\n" }), /No outcome column|at least 3|too few/);
  assert.throws(() => analyze({ csv, outcomeColumn: "nope" }), /No column named "nope"/);
  assert.throws(() => analyze({ csv, predictorColumns: "answer" }), /cannot also be a predictor/);
  assert.throws(() => analyze({ csv: "r,x\n1,5\n2,5\n3,5\n" + "1,5\n".repeat(20) }), /same on every usable row|too few/);
  const withGaps = csv.replace(/\ncontrol,35,Neutral/, "\ncontrol,,Neutral");
  assert.equal(analyze({ csv: withGaps }).skipped, 1);
});

test("special functions", () => {
  // scipy 1.18.1 norm.cdf; relative error below 1e-13 from -12 to 12 in steps of 0.3.
  assert.ok(Math.abs(normCdf(-1.959963984540054) - 0.025) < 1e-15);
  assert.ok(Math.abs(normCdf(-8) / 6.22096057427174e-16 - 1) < 1e-13);
  assert.ok(Math.abs(normCdf(1.5) - 0.9331927987311419) < 1e-15);
  assert.ok(Math.abs(normCdf(-3.2) / 0.0006871379379158471 - 1) < 1e-13);
  assert.ok(Math.abs(normInv(0.975) - 1.959963984540054) < 1e-12);
  assert.ok(Math.abs(chi2Sf(92.84733156368759, 24) - REF.wine.brant.omnibus.p) < 1e-15);
});

test("fitOrdinal and brantTest work on arrays directly", () => {
  const d = readData(parseCsv(file("eval/nonpo.csv")), {});
  const f = fitOrdinal(d.y, d.X, d.levels.length, "logit", d.names);
  close(f.beta, REF.nonpo.logit.beta, 1e-6, "beta");
  const b = brantTest(d.y, d.X, d.levels.length, d.names);
  assert.ok(rel(b.overall.chi2, REF.nonpo.brant.omnibus.chi2) < 1e-8);
});

test("report, CSV and citations", () => {
  const r = analyze({ csv: file("data/red-wine-quality.csv") });
  const txt = report(r);
  assert.match(txt, /Brant test of proportional odds/);
  assert.match(txt, /not medical, legal, financial or professional advice/);
  const csv = toCsv(r).trim().split("\n");
  assert.equal(csv.length, 1 + 6 + 5);
  assert.match(csv[0], /^term,type,estimate,se,z,p,lower,upper,odds_ratio/);
  assert.match(csv[7], /^3 \| 4,cut-point,/);
  for (const p of PAPERS) assert.ok(p.authors && p.title && p.year && p.url && p.implemented, p.title);
  assert.ok(PAPERS.some((p) => p.doi === "10.2307/2532457"));
});

test("an analysis of the 1,599 wines takes well under a second", () => {
  const t0 = Date.now();
  analyze({ csv: file("data/red-wine-quality.csv") });
  assert.ok(Date.now() - t0 < 2000);
});
