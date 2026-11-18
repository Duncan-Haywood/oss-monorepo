import { test } from "node:test";
import assert from "node:assert/strict";
import { analyze, logit, ipw, regressionAdjustment, aipw, matchNearest, balanceTable, effectiveSampleSize, overlap, buildDesign, parseCsv, treatmentValue, normalQuantile, PAPERS, DEFAULTS } from "./engine.mjs";
import { EXAMPLE_CSV, EXAMPLE_SPEC } from "./example-data.mjs";

function mulberry32(a) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

test("a randomised design: every estimator lands near the raw difference", () => {
  const rand = mulberry32(3);
  const X = [], d = [], y = [];
  for (let i = 0; i < 800; i++) { const x = rand() * 2; const t = rand() < 0.5 ? 1 : 0; X.push([1, x]); d.push(t); y.push(1 + 2 * x + 0.5 * t + (rand() - 0.5)); }
  const fit = logit(X, d);
  const naive = y.filter((_, i) => d[i]).reduce((a, b) => a + b, 0) / d.filter((v) => v).length - y.filter((_, i) => !d[i]).reduce((a, b) => a + b, 0) / d.filter((v) => !v).length;
  for (const r of [ipw({ X, d, y, fit }), regressionAdjustment({ X, d, y }), aipw({ X, d, y, fit })]) {
    assert.ok(Math.abs(r.estimate - 0.5) < 0.1, `${r.method}: ${r.estimate}`);
    assert.ok(Math.abs(r.estimate - naive) < 0.12, `${r.method} vs naive ${naive}`);
  }
});

test("a noiseless linear outcome: regression adjustment and AIPW recover the effect exactly", () => {
  const rand = mulberry32(11);
  const X = [], d = [], y = [];
  for (let i = 0; i < 300; i++) { const x = rand() * 4 - 2; const t = rand() < 1 / (1 + Math.exp(-x)) ? 1 : 0; X.push([1, x]); d.push(t); y.push(3 + x + 2 * t); }
  const fit = logit(X, d);
  assert.ok(Math.abs(regressionAdjustment({ X, d, y }).estimate - 2) < 1e-9);
  assert.ok(Math.abs(aipw({ X, d, y, fit }).estimate - 2) < 1e-9);
  for (const e of ["att", "atc"]) assert.ok(Math.abs(regressionAdjustment({ X, d, y, estimand: e }).estimate - 2) < 1e-9);
});

test("doubly robust: AIPW stays right when the outcome model is wrong but the propensity model is right", () => {
  const rand = mulberry32(5);
  let sumA = 0, sumR = 0;
  const reps = 30;
  for (let r = 0; r < reps; r++) {
    const X = [], d = [], y = [];
    for (let i = 0; i < 1500; i++) { const x = rand() * 4 - 2; const t = rand() < 1 / (1 + Math.exp(-1.5 * x)) ? 1 : 0; X.push([1, x]); d.push(t); y.push(3 * Math.exp(x) + t + (rand() - 0.5)); }
    const fit = logit(X, d);
    sumA += aipw({ X, d, y, fit }).estimate; sumR += regressionAdjustment({ X, d, y }).estimate;
  }
  assert.ok(Math.abs(sumA / reps - 1) < 0.1, `AIPW mean ${sumA / reps}, RA ${sumR / reps}`);
  assert.ok(Math.abs(sumR / reps - 1) > 0.15, `misspecified RA mean ${sumR / reps} should be off`);
});

test("IPW weights: ATT gives treated units weight 1 and balances the weighted control means", () => {
  const { X, d, y, cols } = buildDesign(parseCsv(EXAMPLE_CSV).records, { treatment: "trained", outcome: "earnings_after", covariates: EXAMPLE_SPEC.covariates.split(", ") });
  const r = ipw({ X, d, y, estimand: "att" });
  r.weights.forEach((w, i) => { if (d[i]) assert.ok(Math.abs(w - 1) < 1e-12); });
  const b = balanceTable(cols, d, r.weights);
  for (const row of b) assert.ok(Math.abs(row.smdAfter) < 0.1, `${row.name} ${row.smdAfter}`);
  assert.ok(Math.max(...b.map((row) => Math.abs(row.smdBefore))) > 0.4);
});

test("matching: exact pairs, caliper, no reuse without replacement, reuse with", () => {
  const ps = [0.6, 0.7, 0.3, 0.6, 0.69, 0.05];
  const d = [1, 1, 1, 0, 0, 0];
  const y = [10, 12, 7, 9, 10, 1];
  const withR = matchNearest({ ps, d, y, estimand: "att", caliper: 0 });
  assert.deepEqual(withR.pairs.map(([t, c]) => [t, c]).sort(), [[0, 3], [1, 4], [2, 3]]);
  assert.equal(withR.maxReuse, 2);
  const without = matchNearest({ ps, d, y, estimand: "att", caliper: 0, replace: false });
  assert.equal(new Set(without.pairs.map((p) => p[1])).size, without.pairs.length);
  assert.equal(without.pairs.length, 3);
  const tight = matchNearest({ ps, d, y, estimand: "att", caliper: 0.05 });
  assert.ok(tight.unmatched >= 1);
  assert.equal(tight.matched + tight.unmatched, 3);
  const atc = matchNearest({ ps, d, y, estimand: "atc", caliper: 0 });
  assert.equal(atc.focalCount, 3);
  atc.pairs.forEach(([t, c]) => { assert.equal(d[t], 1); assert.equal(d[c], 0); });
});

test("effective sample size, overlap and treatment parsing", () => {
  assert.equal(effectiveSampleSize([1, 1, 1, 1]), 4);
  assert.ok(Math.abs(effectiveSampleSize([10, 1, 1, 1]) - 169 / 103) < 1e-12);
  const ov = overlap([0.1, 0.2, 0.5, 0.3, 0.9, 0.995], [1, 1, 1, 0, 0, 0]);
  assert.deepEqual(ov.commonSupport, [0.3, 0.5]);
  assert.equal(ov.outsideCommonSupport, 4);
  assert.equal(ov.extreme, 1);
  assert.equal(ov.treated.reduce((a, b) => a + b, 0), 3);
  for (const [v, want] of [["1", 1], ["Yes", 1], ["treated", 1], ["0", 0], ["no", 0], ["control", 0]]) assert.equal(treatmentValue(v), want);
  assert.ok(Number.isNaN(treatmentValue("2")));
  assert.ok(Math.abs(normalQuantile(0.975) - 1.959963984540054) < 1e-12);
});

test("text covariates become indicators and bad rows are dropped with a note", () => {
  const csv = "t,y,region,age\n" + Array.from({ length: 10 }, (_, i) => `${i % 2},${i},${["north", "south", "east"][i % 3]},${30 + i}`).join("\n") + "\n0,,north,33\n1,5,south,x\n";
  const { cols, notes, d } = buildDesign(parseCsv(csv).records, { treatment: "t", outcome: "y", covariates: ["region", "age"] });
    assert.deepEqual(cols.map((c) => c.name), ["region=north", "region=south", "age"]);
  assert.equal(d.length, 10);
  assert.ok(notes.some((n) => /left out/.test(n)));
});

test("analyze on the example: the raw comparison is negative, the adjusted ones positive and near the truth", () => {
  const r = analyze({ csv: EXAMPLE_CSV, ...EXAMPLE_SPEC });
  assert.equal(r.n.total, 2000);
  assert.equal(r.n.treated, 727);
  assert.ok(r.naive.estimate < -3);
  for (const m of ["ipw", "ra", "aipw"]) {
    const e = r.estimates.ate[m];
    assert.ok(e.ci[0] > 0, `${m} ATE interval excludes zero`);
    // this draw lands low: RA's and AIPW's 95% intervals end just under the truth (README, "What the example shows")
    assert.ok(Math.abs(e.estimate - 1.3327) < 2.5 * e.se, `${m} ATE within 2.5 SE of the sample truth 1.333: ${e.estimate} (SE ${e.se})`);
  }
  for (const m of ["ipw", "ra", "match"]) {
    const e = r.estimates.att[m];
    assert.ok(e.ci[0] < 1.6439 && 1.6439 < e.ci[1], `${m} ATT interval covers the sample truth 1.644: ${e.ci}`);
  }
  assert.match(r.summary, /doubly robust AIPW/);
  assert.match(r.summary, /no diagnostic here can check that/);
  assert.ok(r.balance.weighted.every((b) => Math.abs(b.smdAfter) < 0.1));
  assert.ok(r.balance.matched.every((b) => Math.abs(b.smdAfter) < 0.1));
  assert.equal(r.scores.length, 2000);
});

test("analyze: trimming refits on fewer units and says so; leaving out confounders is visible", () => {
  const t = analyze({ csv: EXAMPLE_CSV, ...EXAMPLE_SPEC, trim: "crump" });
  assert.ok(t.trimmed.dropped > 0 && t.n.total === 2000 - t.trimmed.dropped);
  assert.ok(t.notes.some((n) => /Trimming dropped/.test(n)));
  const few = analyze({ csv: EXAMPLE_CSV, ...EXAMPLE_SPEC, covariates: "age, education_years" });
  assert.ok(few.estimates.ate.aipw.estimate < 0, "two covariates leave the confounding by earnings in");
});

test("analyze: input errors are explained", () => {
  assert.throws(() => analyze({ csv: EXAMPLE_CSV, ...EXAMPLE_SPEC, treatment: "nope" }), /No column named "nope"/);
  assert.throws(() => analyze({ csv: EXAMPLE_CSV, ...EXAMPLE_SPEC, covariates: "" }), /at least one covariate/);
  assert.throws(() => analyze({ csv: EXAMPLE_CSV, ...EXAMPLE_SPEC, covariates: "earnings_after" }), /cannot also be a covariate/);
  assert.throws(() => analyze({ csv: EXAMPLE_CSV, ...EXAMPLE_SPEC, estimand: "late" }), /estimand/);
  assert.throws(() => analyze({ csv: EXAMPLE_CSV, ...EXAMPLE_SPEC, trim: "0.7" }), /trim/);
  assert.throws(() => analyze({ csv: "t,y,x\n1,1,1\n0,1,2\n", treatment: "t", outcome: "y", covariates: "x" }), /at least 5 treated/);
  assert.throws(() => analyze({ csv: "t,y,x,x2\n" + Array.from({ length: 20 }, (_, i) => `${i % 2},${i},${i},${2 * i}`).join("\n"), treatment: "t", outcome: "y", covariates: "x,x2" }), /singular/);
});

test("papers are complete and the defaults are what the page shows", () => {
  for (const p of PAPERS) for (const k of ["authors", "title", "venue", "year", "url", "implemented", "deviations"]) assert.ok(p[k], `${p.title} ${k}`);
  assert.deepEqual(DEFAULTS, { estimand: "ate", trim: "none", caliper: 0.2, replace: true, alpha: 0.05 });
});
