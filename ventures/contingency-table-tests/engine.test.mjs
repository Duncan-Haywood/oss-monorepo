import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  analyze, fisherExact, fisherRxC, fisherRxCMonteCarlo, barnardExact, boschlooExact, chiSquare, mantelHaenszel, mcnemar,
  tablesFromCSV, parseCSV, chi2sf, normsf, normppf, lfact, report, testRows, PAPERS, DEFAULTS, UNCONDITIONAL_LIMIT,
} from "./engine.mjs";
import { BERKELEY_CSV, TWINS_CSV, JOBS_CSV } from "./example-data.mjs";

test("special functions against known values", () => {
  assert.ok(Math.abs(chi2sf(3.841458820694124, 1) - 0.05) < 1e-12);
  assert.ok(Math.abs(chi2sf(18.307038053275146, 10) - 0.05) < 1e-12);
  assert.ok(Math.abs(normsf(1.959963984540054) - 0.025) < 1e-13);
  assert.ok(Math.abs(normppf(0.975) - 1.959963984540054) < 1e-12);
  assert.ok(Math.abs(normppf(1e-6) + 4.753424308822899) < 1e-9);
  assert.ok(Math.abs(lfact(170) - 706.5730622457874) < 1e-9);
  assert.ok(Math.abs(lfact(200000) - 2241221.5510813077) / 2241221 < 1e-13); // python math.lgamma(200001)
});

test("Fisher's exact test: probabilities over the support sum to one and the p-values bracket correctly", () => {
  const f = fisherExact([[7, 8], [12, 3]]);
  const less = fisherExact([[7, 8], [12, 3]], { alternative: "less" }).p;
  const greater = fisherExact([[7, 8], [12, 3]], { alternative: "greater" }).p;
  assert.ok(Math.abs(less + greater - 1 - f.pObserved) < 1e-12, "one-sided tails overlap in exactly the observed table");
  assert.ok(f.p <= 2 * Math.min(less, greater) + 1e-12);
  assert.ok(f.midP < f.p && f.midP > 0);
  assert.ok(f.ci[0] < f.oddsRatio && f.oddsRatio < f.ci[1]);
});

test("conditional odds ratio at the boundary is 0 or infinity with a one-sided interval", () => {
  const z = fisherExact([[0, 10], [5, 5]]);
  assert.equal(z.oddsRatio, 0);
  assert.equal(z.ci[0], 0);
  const inf = fisherExact([[10, 0], [0, 10]]);
  assert.equal(inf.oddsRatio, Infinity);
  assert.equal(inf.ci[1], Infinity);
});

test("every exact test holds its level: the rejection region's probability never exceeds alpha", () => {
  // n = 12 per group: compute each test's p for every outcome and the exact size at many pi.
  const n = 12, alpha = 0.05;
  const lbin = (k, p) => lfact(n) - lfact(k) - lfact(n - k) + k * Math.log(p) + (n - k) * Math.log1p(-p);
  for (const [name, fn] of [["fisher", (x1, x2) => fisherExact([[x1, n - x1], [x2, n - x2]]).p], ["boschloo", (x1, x2) => boschlooExact(x1, n, x2, n).p], ["barnard", (x1, x2) => barnardExact(x1, n, x2, n).p]]) {
    const R = [];
    for (let x1 = 0; x1 <= n; x1++) for (let x2 = 0; x2 <= n; x2++) if (x1 + x2 > 0 && x1 + x2 < 2 * n && fn(x1, x2) <= alpha) R.push([x1, x2]);
    for (let i = 1; i < 100; i++) {
      const pi = i / 100;
      const size = R.reduce((s, [a, b]) => s + Math.exp(lbin(a, pi) + lbin(b, pi)), 0);
      assert.ok(size <= alpha + 1e-9, `${name} size ${size} at pi ${pi}`);
    }
  }
});

test("Boschloo is at least as powerful as Fisher: its p-value is never larger, one-sided", () => {
  for (let a = 0; a <= 9; a++) for (let c = 0; c <= 11; c++) {
    if (a + c === 0 || a + c === 20) continue;
    const f = fisherExact([[a, 9 - a], [c, 11 - c]], { alternative: "greater" }).p;
    const b = boschlooExact(a, 9, c, 11, { alternative: "greater" }).p;
    assert.ok(b <= f + 1e-12, `${a},${c}: ${b} > ${f}`);
  }
});

test("r x c exact equals the 2x2 Fisher test on a 2x2, and Monte Carlo lands near the exact value", () => {
  for (const t of [[[3, 1], [1, 3]], [[7, 8], [12, 3]], [[0, 5], [6, 2]]]) assert.ok(Math.abs(fisherRxC(t).p - fisherExact(t).p) < 1e-10, JSON.stringify(t));
  const t = [[1, 3, 10, 6], [2, 3, 10, 7], [1, 6, 14, 12], [0, 1, 9, 11]];
  const mc = fisherRxCMonteCarlo(t, { samples: 4000, seed: 7 });
  assert.ok(Math.abs(mc.p - 0.7827) < 4 * mc.se + 0.005, `${mc.p}`);
  assert.equal(fisherRxCMonteCarlo(t, { samples: 500, seed: 3 }).p, fisherRxCMonteCarlo(t, { samples: 500, seed: 3 }).p, "seeded");
  // transposing or reordering rows does not change the exact p-value
  const small = [[3, 1, 4, 0], [1, 5, 2, 3], [2, 0, 1, 4]];
  const tt = small[0].map((_, j) => small.map((r) => r[j]));
  assert.ok(Math.abs(fisherRxC(tt).p - fisherRxC(small).p) < 1e-10);
  assert.ok(Math.abs(fisherRxC([small[2], small[0], small[1]]).p - fisherRxC(small).p) < 1e-10);
});

test("a work limit returns null so the caller falls back to Monte Carlo", () => {
  assert.equal(fisherRxC([[1, 3, 10, 6], [2, 3, 10, 7], [1, 6, 14, 12], [0, 1, 9, 11]], { maxWork: 1000 }), null);
  const big = [[20, 25, 30, 22, 18], [24, 19, 28, 30, 21], [18, 30, 22, 25, 27], [25, 21, 24, 19, 30]];
  const r = analyze({ table: big, samples: 2000 });
  assert.equal(r.fisherRxC.exact, false);
  assert.match(r.summary, /Monte Carlo/);
});

test("chi-square: Yates correction never overshoots, residuals and Cramér's V behave", () => {
  const atExpected = chiSquare([[5, 5], [5, 5]], { correct: true });
  assert.equal(atExpected.statistic, 0);
  const x = chiSquare([[30, 10], [10, 30]]);
  assert.ok(x.residuals[0][0] > 1.96 && x.residuals[0][1] < -1.96);
  assert.ok(Math.abs(x.cramerV - 0.5) < 1e-12);
});

test("stratified: one stratum reduces to the 2x2 tests; Berkeley shows Simpson's paradox", () => {
  const t = [[7, 8], [12, 3]];
  const s = mantelHaenszel([t]);
  assert.ok(Math.abs(s.exact.p - fisherExact(t).p) < 1e-12);
  assert.ok(Math.abs(s.commonOR.estimate - (7 * 3) / (8 * 12)) < 1e-12);
  const r = analyze({ csv: BERKELEY_CSV });
  assert.equal(r.mode, "stratified");
  assert.deepEqual(r.stratumLabels, ["A", "B", "C", "D", "E", "F"]);
  assert.deepEqual(r.table, [[1198, 1493], [557, 1278]]);
  assert.ok(r.effects.oddsRatio.estimate > 1.8 && r.stratified.commonOR.estimate < 1);
  assert.match(r.summary, /Simpson's paradox/);
  // R's mantelhaen.test(UCBAdmissions): X-squared = 1.4269, p = 0.2323, common odds ratio 0.9047 (0.7719, 1.0603)
  assert.equal(r.stratified.cmh.statistic.toFixed(4), "1.4269");
  assert.equal(r.stratified.cmh.p.toFixed(4), "0.2323");
  assert.equal(r.stratified.commonOR.estimate.toFixed(4), "0.9047");
  assert.equal(r.stratified.commonOR.ci.map((v) => v.toFixed(4)).join(","), "0.7719,1.0603");
  assert.ok(r.stratified.breslowDay.taroneP < 0.01);
});

test("McNemar: symmetric discordance gives p = 1, and the exact test matches the binomial", () => {
  assert.equal(mcnemar([[10, 4], [4, 10]]).exactP, 1);
  const m = mcnemar([[0, 0], [5, 0]]);
  assert.ok(Math.abs(m.exactP - 2 / 32) < 1e-15);
  assert.ok(m.ci[0] === 0 && m.ci[1] > 0);
});

test("CSV shapes: a grid, long rows with counts, raw rows, and named columns", () => {
  assert.deepEqual(tablesFromCSV(TWINS_CSV).table, [[2, 15], [10, 3]]);
  assert.deepEqual(tablesFromCSV(JOBS_CSV).colLabels.length, 4);
  const raw = "arm,outcome\nA,yes\nA,no\nB,yes\nA,yes\nB,no\nB,no";
  assert.deepEqual(tablesFromCSV(raw).table, [[2, 1], [1, 2]]);
  const named = tablesFromCSV(BERKELEY_CSV, { row: "department", col: "decision", stratum: null });
  assert.equal(named.table.length, 6);
  assert.equal(named.strata, undefined);
  assert.deepEqual(parseCSV('a;b\n"x;y";2\n'), [["a", "b"], ["x;y", "2"]]);
  assert.throws(() => tablesFromCSV("arm,n\nA,1.5\nB,2\nC,x", { row: "arm", col: "arm", count: "n" }), /whole numbers/);
});

test("analyze rejects bad input with a message", () => {
  assert.throws(() => analyze({ table: [[1, 2]] }), /2 rows/);
  assert.throws(() => analyze({ table: [[1, -2], [3, 4]] }), /non-negative/);
  assert.throws(() => analyze({ table: [[0, 0], [0, 0]] }), /empty/);
  assert.throws(() => analyze({ table: [[1, 2], [3, 4]], alternative: "sideways" }), /alternative/);
  assert.throws(() => analyze({ paired: [[1, 2, 3], [3, 4, 5]] }), /McNemar/);
  assert.throws(() => analyze({ table: [[1, 2], [3, 4]], alpha: 2 }), /alpha/);
});

test("large 2x2 tables skip the unconditional tests and say why", () => {
  const r = analyze({ table: [[300, 400], [350, 420]] });
  assert.ok(700 * 770 > UNCONDITIONAL_LIMIT);
  assert.ok(r.boschloo.skipped && Number.isNaN(r.boschloo.p));
  assert.ok(Number.isFinite(r.fisher.p));
  assert.doesNotMatch(r.summary, /Boschloo/);
});

test("reports, rows and the summary cover every mode", () => {
  for (const input of [{ csv: TWINS_CSV }, { csv: JOBS_CSV }, { csv: BERKELEY_CSV }, { paired: [[59, 6], [16, 80]] }, { table: [[9, 3], [4, 9]], alternative: "greater" }]) {
    const r = analyze(input);
    assert.ok(r.summary.length > 40);
    assert.ok(testRows(r).length >= 3);
    const text = report(r);
    assert.match(text, /not legal, tax, financial or medical advice/);
    assert.doesNotMatch(text, /NaN|undefined/);
  }
  assert.equal(DEFAULTS.alpha, 0.05);
});

test("every paper has a DOI link and says what was implemented", () => {
  assert.ok(PAPERS.length >= 15);
  for (const p of PAPERS) {
    assert.match(p.url, /^https:\/\/doi\.org\//, p.title);
    assert.ok(p.implemented.length > 20 && p.deviations.length > 3, p.title);
  }
});

test("the size study file agrees with the engine", () => {
  const s = JSON.parse(readFileSync(new URL("./eval/size.json", import.meta.url), "utf8"));
  const d20 = s.designs.find((d) => d.n1 === 20).tests;
  assert.ok(d20["Fisher exact"].meanSize < 0.02 && d20["Fisher exact"].maxSize < 0.05);
  for (const k of ["Fisher exact", "Fisher mid-p", "Boschloo", "Barnard (pooled Wald)"]) for (const d of s.designs) assert.ok(d.tests[k].maxSize <= 0.05, `${k} n=${d.n1}`);
  assert.ok(s.designs.some((d) => d.tests["Pearson chi-square"].maxSize > 0.06));
});

// Red team 2026-11-17: guards for mutants that escaped and defects found by hand.
test("normppf's upper tail (a 99% interval) is right", () => {
  assert.ok(Math.abs(normppf(0.995) - 2.5758293035489) < 1e-9);
  assert.ok(Math.abs(normppf(0.999) - 3.090232306167813) < 1e-9);
});

test("a table with no events at all: every exact test gives p = 1", () => {
  const r = analyze({ table: [[0, 5], [0, 7]] });
  assert.equal(r.fisher.p, 1);
  assert.equal(r.boschloo.p, 1);
  assert.equal(r.barnard.p, 1);
  for (const alternative of ["less", "greater"]) assert.equal(boschlooExact(0, 5, 0, 7, { alternative }).p, 1, alternative);
});

test("phi is the Pearson correlation of the 2x2 (phi squared = chi-square / n)", () => {
  const r = analyze({ table: [[30, 10], [10, 30]] });
  assert.ok(Math.abs(r.effects.phi - 0.5) < 1e-12);
  assert.ok(Math.abs(r.effects.phi ** 2 - r.chiSquare.statistic / r.n) < 1e-12);
});

test("a 2x2 with an empty group is refused, not reported as NaN%", () => {
  assert.throws(() => analyze({ table: [[0, 0], [3, 4]] }), /no observations/);
  assert.throws(() => analyze({ strata: [[[0, 0], [3, 4]], [[0, 0], [2, 1]]] }), /no observations/);
  // an empty row in a larger table is still fine: the exact test drops it
  assert.ok(Number.isFinite(analyze({ table: [[0, 0, 0], [3, 4, 1], [2, 2, 5]] }).fisherRxC.p));
});

test("paired data with a one-sided alternative says the test is two-sided instead of silently ignoring it", () => {
  const r = analyze({ paired: [[5, 10], [2, 5]], alternative: "greater" });
  assert.equal(r.alternative, "two-sided");
  assert.ok(r.warnings.some((w) => /two-sided/.test(w)));
  assert.match(r.summary, /two-sided/);
});

test("an infinite Mantel-Haenszel odds ratio is not called confounding", () => {
  const r = analyze({ strata: [[[3, 0], [0, 4]], [[2, 0], [0, 1]]] });
  assert.equal(r.stratified.commonOR.estimate, Infinity);
  assert.doesNotMatch(r.summary, /confound/);
});

test("Monte Carlo on a large r x c table is fast and still close to the exact value", () => {
  const t0 = Date.now();
  const big = fisherRxCMonteCarlo([[3000, 2000, 1000], [1000, 2000, 3000], [2000, 2000, 2000]]);
  assert.ok(Date.now() - t0 < 3000, `took ${Date.now() - t0} ms`);
  assert.ok(big.p < 0.001);
  for (const t of [[[3, 1, 4, 0], [1, 5, 2, 3], [2, 0, 1, 4]], [[10, 2, 3], [3, 9, 2], [1, 2, 8]], [[0, 5, 1], [6, 2, 0]]]) {
    const ex = fisherRxC(t).p, mc = fisherRxCMonteCarlo(t, { samples: 20000, seed: 11 });
    assert.ok(Math.abs(mc.p - ex) < 4 * mc.se + 0.002, `${JSON.stringify(t)}: ${mc.p} vs ${ex}`);
  }
});

test("fuzz: no summary or report prints NaN or undefined, on any small table, stratum set or paired table", () => {
  let seed = 12345;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  const cell = () => (rnd() < 0.3 ? 0 : Math.floor(rnd() * 12));
  const grid = (R, C) => Array.from({ length: R }, () => Array.from({ length: C }, cell));
  let ran = 0;
  for (let k = 0; k < 300; k++) {
    const kind = k % 4;
    const alternative = ["two-sided", "less", "greater"][k % 3];
    const input = kind === 0 ? { table: grid(2, 2) } : kind === 1 ? { table: grid(2 + (k % 2), 3) } : kind === 2 ? { strata: [grid(2, 2), grid(2, 2), grid(2, 2)] } : { paired: grid(2, 2) };
    let r;
    try { r = analyze({ ...input, alternative, samples: 200 }); } catch (e) { assert.match(e.message, /no observations|empty|at least 2/, e.message); continue; }
    ran++;
    for (const text of [r.summary, report(r)]) assert.doesNotMatch(text, /NaN|undefined/, `${JSON.stringify(input)} ${alternative}: ${text}`);
  }
  assert.ok(ran > 200, `only ${ran} inputs analysed`);
});
