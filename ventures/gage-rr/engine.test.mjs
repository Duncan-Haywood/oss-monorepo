import { test } from "node:test";
import assert from "node:assert/strict";
import { analyze, readStudy, parseCsv, num, mlsInterval, chi2Quantile, layout, report, PAPERS, DEFAULTS, SAMPLE_STUDY } from "./engine.mjs";
import { BENCHMARK_CSV, DESTRUCTIVE_CSV } from "./example-data.mjs";

const comp = (r, key) => r.components.find((c) => c.key === key);

// A tiny crossed study worked by hand: 2 operators x 2 parts x 2 trials.
const tiny = [
  ["A", "p1", 10], ["A", "p1", 12], ["A", "p2", 20], ["A", "p2", 22],
  ["B", "p1", 11], ["B", "p1", 13], ["B", "p2", 23], ["B", "p2", 25],
].map(([operator, part, y]) => ({ operator, part, y }));

test("hand-worked 2x2x2 ANOVA", () => {
  const r = analyze({ obs: tiny, interaction: "keep" });
  const t = Object.fromEntries(r.anova.table.map((x) => [x.source, x]));
  // grand 17; part means 11.5, 22.5; operator means 16, 18; cell means 11, 21, 12, 24
  assert.equal(t.Part.ss, 242);
  assert.equal(t.Operator.ss, 8);
  assert.equal(t["Part × operator"].ss, 2);
  assert.equal(t.Repeatability.ss, 8);
  assert.equal(t.Total.ss, 260);
  assert.equal(t.Repeatability.df, 4);
  // sigma_E^2 = 8/4 = 2; sigma_PO^2 = (2-2)/2 = 0; sigma_O^2 = (8-2)/4 = 1.5; sigma_P^2 = (242-2)/4 = 60
  assert.equal(comp(r, "repeatability").variance, 2);
  assert.equal(comp(r, "interaction").variance, 0);
  assert.equal(comp(r, "operator").variance, 1.5);
  assert.equal(comp(r, "part").variance, 60);
  assert.equal(comp(r, "reproducibility").variance, 1.5);
  assert.equal(comp(r, "grr").variance, 3.5);
  assert.equal(r.ndc, Math.floor(1.41 * Math.sqrt(60 / 3.5)));
  assert.equal(r.ndc, 5);
  const total = comp(r, "total");
  assert.equal(total.variance, 63.5);
  assert.ok(Math.abs(comp(r, "grr").pctContribution - (100 * 3.5) / 63.5) < 1e-12);
  assert.ok(Math.abs(comp(r, "grr").pctStudyVar - 100 * Math.sqrt(3.5 / 63.5)) < 1e-12);
});

test("auto pooling follows the interaction p-value and the threshold", () => {
  const keep = analyze({ obs: tiny, interaction: "keep" });
  const p = keep.interactionP;
  assert.ok(p > 0.05);
  const auto = analyze({ obs: tiny });
  assert.equal(auto.pooled, true);
  assert.ok(auto.anova.pooledTable);
  assert.equal(analyze({ obs: tiny, poolAlpha: 0.99 }).pooled, false);
  // pooled residual: (2 + 8) / (1 + 4)
  assert.ok(Math.abs(auto.anova.pooledTable[2].ms - 2) < 1e-12);
  assert.ok(Math.abs(comp(auto, "repeatability").variance - 2) < 1e-12);
  assert.ok(Math.abs(comp(auto, "reproducibility").variance - 1.5) < 1e-12);
  assert.equal(comp(auto, "operator"), undefined);
});

test("%tolerance, %process and the 5.15 multiplier", () => {
  const r = analyze({ obs: tiny, interaction: "keep", lsl: 0, usl: 60, processSd: 10, k: 5.15 });
  const g = comp(r, "grr");
  assert.ok(Math.abs(g.pctTolerance - (100 * 5.15 * Math.sqrt(3.5)) / 60) < 1e-12);
  assert.ok(Math.abs(g.pctProcess - 10 * Math.sqrt(3.5)) < 1e-12);
  assert.ok(Math.abs(g.studyVar - 5.15 * Math.sqrt(3.5)) < 1e-12);
  assert.equal(r.verdict.basis, "%tolerance");
  assert.throws(() => analyze({ obs: tiny, lsl: 5 }), /both specification limits/);
  assert.throws(() => analyze({ obs: tiny, lsl: 5, usl: 5 }), /must be above/);
  assert.throws(() => analyze({ obs: tiny, processSd: -1 }), /must be positive/);
});

test("verdict bands and ndc wording", () => {
  const r = analyze({ obs: tiny, interaction: "keep" });
  // sqrt(3.5 / 63.5) = 23.5% of study variation
  assert.equal(r.verdict.level, "marginal");
  assert.match(r.verdict.text, /23\.5% of study variation: between 10% and 30%/);
  assert.match(r.verdict.text, /separates 5 distinct categories/);
  const bad = analyze({ obs: tiny, interaction: "keep", lsl: 0, usl: 20 });
  assert.equal(bad.verdict.level, "unacceptable");
  const good = analyze({ obs: tiny, interaction: "keep", lsl: 0, usl: 300 });
  assert.equal(good.verdict.level, "acceptable");
  const flat = analyze({ obs: tiny.map((o) => ({ ...o, y: 1 })) });
  assert.equal(flat.verdict.level, "unknown");
  assert.equal(flat.ndc, null);
});

test("MLS: repeatability is the exact chi-square interval; bounds bracket the estimate", () => {
  const m = mlsInterval([{ c: 1, ms: 2, df: 10 }]);
  assert.ok(Math.abs(m.lower - (20 / chi2Quantile(0.975, 10))) < 1e-12);
  assert.ok(Math.abs(m.upper - (20 / chi2Quantile(0.025, 10))) < 1e-12);
  const d = mlsInterval([{ c: 0.5, ms: 9, df: 9 }, { c: -0.5, ms: 1, df: 18 }]);
  assert.equal(d.estimate, 4);
  assert.ok(d.lower < 4 && d.upper > 4 && d.lower >= 0);
  const z = mlsInterval([{ c: 0.5, ms: 1, df: 9 }, { c: -0.5, ms: 2, df: 18 }]);
  assert.equal(z.lower, 0);
});

test("total gauge interval never starts below repeatability's", () => {
  const r = analyze({ design: "nested", text: DESTRUCTIVE_CSV });
  assert.ok(comp(r, "grr").sdLower >= comp(r, "repeatability").sdLower - 1e-12);
  for (const c of r.components.filter((x) => x.sdLower != null)) assert.ok(c.sdLower <= c.sd + 1e-12 && c.sd <= c.sdUpper + 1e-12, c.key);
});

test("the benchmark study (real timings) gives the README's numbers", () => {
  const r = analyze({ text: BENCHMARK_CSV, interaction: "keep" });
  assert.deepEqual(r.counts, { operators: 3, parts: 10, replicates: 3, readings: 90 });
  assert.deepEqual(r.columns, { part: "part", operator: "operator", measurement: "measurement" });
  assert.equal(comp(r, "grr").pctStudyVar.toFixed(1), "22.5");
  assert.equal(comp(r, "repeatability").pctStudyVar.toFixed(1), "15.7");
  assert.equal(comp(r, "reproducibility").pctStudyVar.toFixed(1), "16.1");
  assert.equal(r.ndc, 6);
  assert.equal(r.interactionP.toFixed(3), "0.143");
  const g = comp(r, "grr");
  assert.deepEqual([g.sd, g.sdLower, g.sdUpper].map((x) => x.toFixed(1)), ["14.7", "11.6", "64.1"]);
  const means = Object.fromEntries(r.summary.operators.map((o) => [o.name, o.mean.toFixed(1)]));
  assert.deepEqual(means, { loop50: "83.4", median15: "85.0", single: "101.5" });
  const auto = analyze({ text: BENCHMARK_CSV });
  assert.equal(auto.pooled, true);
  assert.equal(comp(auto, "grr").pctStudyVar.toFixed(1), "22.3");
  const noSingle = analyze({ text: BENCHMARK_CSV.split("\n").filter((l) => !l.includes(",single,")).join("\n") });
  assert.equal(comp(noSingle, "grr").pctStudyVar.toFixed(1), "14.7");
  assert.equal(noSingle.ndc, 9);
});

test("the nested example finds the operator effect indistinguishable from part variation", () => {
  const r = analyze({ design: "nested", text: DESTRUCTIVE_CSV, lsl: 380, usl: 440 });
  assert.equal(r.counts.parts, 15);
  assert.equal(r.anova.table[0].source, "Operator");
  assert.equal(r.anova.table[0].p.toFixed(3), "0.482");
  assert.equal(comp(r, "reproducibility").variance, 0);
  assert.ok(r.warnings.some((w) => /reproducibility \(operator\) variance estimate came out negative/.test(w)));
  assert.equal(comp(r, "grr").pctTolerance.toFixed(1), "21.2");
  assert.equal(r.ndc, 5);
});

test("design errors say what to do", () => {
  assert.throws(() => analyze({ obs: tiny.slice(1) }), /Unbalanced study/);
  assert.throws(() => analyze({ obs: tiny.filter((o) => !(o.operator === "B" && o.part === "p2")) }), /2 operator × part cells have no readings|choose the nested design/);
  assert.throws(() => analyze({ obs: tiny.filter((_, i) => i % 2 === 0) }), /at least twice/);
  assert.throws(() => analyze({ obs: tiny.filter((o) => o.operator === "A") }), /at least two operators/);
  assert.throws(() => analyze({ obs: tiny, design: "nested" }), /measured by both/);
  assert.throws(() => analyze({ obs: tiny, k: 0 }), /multiplier/);
  assert.throws(() => analyze({ obs: tiny, confidence: 1 }), /Confidence/);
  assert.throws(() => layout([]), /No measurements/);
});

test("CSV reading: header names, aliases, semicolons with decimal commas, quotes, bad cells", () => {
  const s = readStudy("Appraiser;Part;Reading\nA;1;4,5\nA;1;4,7\n");
  assert.deepEqual(s.columns, { part: "Part", operator: "Appraiser", measurement: "Reading" });
  assert.equal(s.obs[0].y, 4.5);
  assert.equal(num("1,5", ","), NaN);
  const q = parseCsv('part,operator,measurement\n"a, b",x,1\n');
  assert.equal(q.rows[0][0], "a, b");
  assert.throws(() => readStudy("part,operator,measurement\n1,A,\n"), /not a number/);
  assert.throws(() => readStudy("part,operator,measurement\n1,A,abc\n"), /not a number/);
  assert.throws(() => readStudy("a,b\n1,2\n"), /three columns/);
  assert.throws(() => readStudy("part,operator,value\n1,A,1\n", { measurement: "nope" }), /No column named "nope"/);
  assert.throws(() => readStudy(""), /No data/);
  const named = readStudy("w,who,mm\n1,A,3\n", { part: "w", operator: "who", measurement: "mm" });
  assert.deepEqual(named.obs, [{ part: "1", operator: "A", y: 3 }]);
});

test("report, papers, defaults and the agent sample", () => {
  const s = analyze(SAMPLE_STUDY);
  assert.equal(s.counts.readings, 20);
  assert.equal(s.tolerance.toFixed(2), "0.40");
  assert.equal(analyze(SAMPLE_STUDY.text).counts.parts, 5);
  const txt = report(analyze({ text: BENCHMARK_CSV }));
  assert.match(txt, /Number of distinct categories: 6/);
  assert.match(txt, /Total gauge R&R,/);
  assert.equal(PAPERS.length, 5);
  assert.equal(DEFAULTS.k, 6);
});
