import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  wasserstein1d, compareColumn, permutationW1, sinkhorn, costMatrix, roundPlan, dualLowerBound,
  transport, energyTest, analyze, parseCsv, guessGroupColumn, toCsv, rng, PAPERS, quantile,
} from "./engine.mjs";

const REF = JSON.parse(readFileSync(new URL("./eval/reference.json", import.meta.url), "utf8"));
const EXAMPLE = readFileSync(new URL("./data/central-park-july.csv", import.meta.url), "utf8");
const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ""} ${a} vs ${b} (tol ${tol})`);

// -------------------------------------------------------------- one dimension

test("W1 and W2 on the line match SciPy and POT, with and without weights", () => {
  for (const [k, c] of REF.oneD.entries()) {
    close(wasserstein1d(c.x, c.y, { wx: c.wx, wy: c.wy }), c.w1, 1e-12, `case ${k} W1`);
    close(wasserstein1d(c.x, c.y, { p: 2, wx: c.wx, wy: c.wy }), c.w2, 1e-12, `case ${k} W2`);
  }
});

test("compareColumn's W1 and W2 match the reference on the example's columns", () => {
  const rows = EXAMPLE.trim().split("\n").slice(1).map((l) => l.split(","));
  for (const [j, col] of [[2, "tmax_c"], [3, "tmin_c"]]) {
    const x = rows.filter((r) => r[1] === "1951-1980").map((r) => +r[j]);
    const y = rows.filter((r) => r[1] === "1991-2020").map((r) => +r[j]);
    const c = compareColumn(x, y);
    close(c.w1, REF.example.columns[col].w1, 1e-12, col);
    close(c.w2, REF.example.columns[col].w2, 1e-12, col);
  }
});

test("the W2 split into location, spread and shape adds up, and up minus down is the mean shift", () => {
  const rand = rng(7);
  for (let t = 0; t < 20; t++) {
    const x = Array.from({ length: 5 + Math.floor(rand() * 50) }, () => rand() * 10);
    const y = Array.from({ length: 5 + Math.floor(rand() * 50) }, () => rand() ** 2 * 14 - 2);
    const c = compareColumn(x, y);
    const p = c.w2Parts;
    close(p.location + p.spread + 2 * c.sd[0] * c.sd[1] * (1 - p.rho), c.w2 ** 2, 1e-9, "identity");
    close(c.movedUp - c.movedDown, c.meanShift, 1e-9, "up - down");
    close(c.movedUp + c.movedDown, c.w1, 1e-9, "up + down");
    assert.ok(c.w1 <= c.w2 + 1e-12, "W1 <= W2");
    assert.ok(Math.abs(c.meanShift) <= c.w1 + 1e-12, "|mean shift| <= W1");
  }
});

test("a pure shift gives W1 = W2 = the shift, direction up, and every quantile shift equal to it", () => {
  const x = [1, 4, 4, 9, 12.5, 3];
  const c = compareColumn(x, x.map((v) => v + 2.5));
  close(c.w1, 2.5, 1e-12);
  close(c.w2, 2.5, 1e-12);
  assert.equal(c.direction, "up");
  for (const q of c.quantiles) close(q.shift, 2.5, 1e-12);
  const same = compareColumn(x, x.slice().reverse());
  assert.equal(same.w1, 0);
  assert.equal(same.direction, "none");
});

test("the lower quantile is the smallest value whose cumulative share reaches t", () => {
  assert.equal(quantile([3, 1, 2, 4], 0.5), 2);
  assert.equal(quantile([3, 1, 2, 4], 0.51), 3);
  assert.equal(quantile([3, 1, 2, 4], 1), 4);
});

test("the permutation W1 sweep equals the quantile formula, and p-values behave", () => {
  const rand = rng(3);
  const x = Array.from({ length: 40 }, () => Math.round(rand() * 20));
  const y = Array.from({ length: 55 }, () => Math.round(rand() * 20) + 3);
  const t = permutationW1(x, y, { permutations: 499, seed: 1 });
  close(t.statistic, wasserstein1d(x, y), 1e-12);
  assert.ok(t.pValue < 0.01, `shifted: p ${t.pValue}`);
  const z = Array.from({ length: 60 }, () => rand());
  const same = permutationW1(z.slice(0, 30), z.slice(30), { permutations: 499, seed: 1 });
  assert.ok(same.pValue > 0.05, `same distribution: p ${same.pValue}`);
  assert.deepEqual(permutationW1(x, y, { permutations: 99, seed: 5 }), permutationW1(x, y, { permutations: 99, seed: 5 }));
});

test("the energy statistic matches SciPy's energy distance (squared) in one dimension", () => {
  for (const c of REF.oneD.filter((c) => c.energy !== undefined)) {
    const e = energyTest(c.x.map((v) => [v]), c.y.map((v) => [v]), { permutations: 0 });
    close(e.statistic, c.energy, 1e-10);
  }
});

// ------------------------------------------------------ several dimensions

test("the Sinkhorn plan matches POT's ot.sinkhorn entry by entry", () => {
  for (const c of REF.clouds) {
    const n = c.X.length, m = c.Y.length;
    const a = new Float64Array(n).fill(1 / n), b = new Float64Array(m).fill(1 / m);
    const C = costMatrix(c.X, c.Y, c.cost);
    const s = sinkhorn(a, b, C, c.eps, { tol: 1e-13, maxIter: 200000 });
    let worst = 0;
    for (let k = 0; k < s.P.length; k++) worst = Math.max(worst, Math.abs(s.P[k] - c.plan[k]));
    assert.ok(worst < 1e-10, `${c.cost} eps ${c.eps}: largest plan difference ${worst}`);
    close(s.cost, c.sinkhornCost, 1e-9, `${c.cost} eps ${c.eps} cost`);
  }
});

test("the certified bracket always contains POT's exact cost (ot.emd2)", () => {
  for (const c of REF.clouds) {
    for (const blur of [0.1, 0.02, 0.005]) {
      const o = transport(c.X, c.Y, { cost: c.cost, blur });
      const exact = c.cost === "sqeuclidean" ? Math.sqrt(c.exact) : c.exact;
      assert.ok(o.distanceLower <= exact + 1e-9 && exact <= o.distanceUpper + 1e-9, `${c.cost} blur ${blur}: ${o.distanceLower} <= ${exact} <= ${o.distanceUpper}`);
    }
  }
});

test("rounding gives exact marginals, and the dual bound is below every feasible plan", () => {
  const rand = rng(11);
  const X = Array.from({ length: 12 }, () => [rand(), rand()]), Y = Array.from({ length: 9 }, () => [rand() * 2, rand()]);
  const a = new Float64Array(12).fill(1 / 12), b = new Float64Array(9).fill(1 / 9);
  const C = costMatrix(X, Y);
  const s = sinkhorn(a, b, C, 0.05, { maxIter: 3 }); // deliberately unconverged
  const R = roundPlan(s.P, a, b);
  for (let i = 0; i < 12; i++) { let r = 0; for (let j = 0; j < 9; j++) { r += R[i * 9 + j]; assert.ok(R[i * 9 + j] >= 0); } close(r, a[i], 1e-14); }
  for (let j = 0; j < 9; j++) { let c = 0; for (let i = 0; i < 12; i++) c += R[i * 9 + j]; close(c, b[j], 1e-14); }
  let up = 0;
  for (let k = 0; k < C.length; k++) up += R[k] * C[k];
  assert.ok(dualLowerBound(s.g, a, b, C) <= up + 1e-12);
});

test("with equal sizes the exact cost is the best assignment, and the bracket holds it (brute force)", () => {
  const rand = rng(21);
  const perms = (n) => (n === 1 ? [[0]] : perms(n - 1).flatMap((p) => Array.from({ length: n }, (_, i) => [...p.slice(0, i), n - 1, ...p.slice(i)])));
  for (let t = 0; t < 5; t++) {
    const X = Array.from({ length: 6 }, () => [rand() * 3, rand()]), Y = Array.from({ length: 6 }, () => [rand() * 3 + 1, rand()]);
    const C = costMatrix(X, Y);
    let best = Infinity;
    for (const p of perms(6)) { let s = 0; for (let i = 0; i < 6; i++) s += C[i * 6 + p[i]]; best = Math.min(best, s / 6); }
    const o = transport(X, Y, { blur: 0.01 });
    assert.ok(o.distanceLower <= best + 1e-9 && best <= o.distanceUpper + 1e-9, `${o.distanceLower} <= ${best} <= ${o.distanceUpper}`);
  }
});

test("transport is symmetric and zero for identical clouds", () => {
  const rand = rng(5);
  const X = Array.from({ length: 15 }, () => [rand(), rand(), rand()]), Y = Array.from({ length: 20 }, () => [rand() + 0.5, rand(), rand()]);
  const ab = transport(X, Y, { blur: 0.01 }), ba = transport(Y, X, { blur: 0.01 });
  assert.ok(ab.distanceLower <= ba.distanceUpper + 1e-9 && ba.distanceLower <= ab.distanceUpper + 1e-9);
  const same = transport(X, X, { blur: 0.005 });
  assert.ok(same.distanceLower <= 1e-9);
});

test("on the example the bracket contains the exact distance for each cost and scaling", () => {
  for (const [scale, cost] of [["none", "euclidean"], ["sd", "sqeuclidean"]]) {
    const r = analyze({ csv: EXAMPLE, group: "period", scale, cost, permutations: 0, energyPermutations: 0 });
    const exact = REF.example.exact[`${scale}-${cost}`];
    assert.ok(r.multi.lower <= exact + 1e-9 && exact <= r.multi.upper + 1e-9, `${scale}-${cost}: ${r.multi.lower} <= ${exact} <= ${r.multi.upper}`);
    assert.ok(r.multi.gap / exact < 0.12, `${scale}-${cost}: bracket ${r.multi.gap} too wide`);
  }
});

// ------------------------------------------------------------------ analyze

test("the example: nights warmed at every quantile, days did not change", () => {
  const r = analyze({ csv: EXAMPLE, scale: "none", energyPermutations: 99 });
  assert.equal(r.group, "period");
  assert.deepEqual(r.groups, ["1951-1980", "1991-2020"]);
  assert.deepEqual(r.n, [930, 930]);
  const tmin = r.columns.find((c) => c.column === "tmin_c"), tmax = r.columns.find((c) => c.column === "tmax_c");
  assert.equal(tmin.direction, "up");
  close(tmin.w1, tmin.meanShift, 1e-12);
  assert.ok(tmin.pValue <= 0.002);
  assert.equal(tmax.direction, "mixed");
  assert.ok(tmax.pValue > 0.05);
  const share = Object.fromEntries(r.multi.columnShare.map((s) => [s.column, s.share]));
  assert.ok(share.tmin_c > 0.7);
  assert.ok(r.multi.energy.pValue < 0.05);
  assert.match(r.summary, /every quantile is higher in 1991-2020/);
  assert.equal(r.multi.arrows.length, 930);
});

test("the energy statistic on the example's scaled columns matches a direct NumPy computation", () => {
  const r = analyze({ csv: EXAMPLE, scale: "sd", permutations: 0, energyPermutations: 0 });
  const sc = (p) => p.map((v, k) => v / r.multi.scales[k]);
  const e = energyTest(r.points[0].map(sc), r.points[1].map(sc), { permutations: 0 });
  close(e.statistic, REF.example.energy, 1e-10);
});

test("analyze is reproducible for a seed and accepts rows as objects", () => {
  const rows = [];
  const rand = rng(9);
  for (let i = 0; i < 60; i++) rows.push({ arm: i % 2 ? "new" : "old", ms: 100 + rand() * 30 + (i % 2) * 8, kb: 20 + rand() * 5 });
  const r1 = analyze({ rows, permutations: 99, energyPermutations: 49, seed: 3 });
  const r2 = analyze({ rows, permutations: 99, energyPermutations: 49, seed: 3 });
  assert.equal(r1.summary, r2.summary);
  assert.equal(r1.group, "arm");
  assert.deepEqual(r1.groups, ["old", "new"]);
  assert.equal(r1.multi.scaled, true);
});

test("errors are plain sentences", () => {
  assert.match(analyze({ csv: "" }).error, /empty/);
  assert.match(analyze({ csv: "g,x\na,1\na,2\na,3" }).error, /2 and 12 distinct|two different groups|only one value/);
  assert.match(analyze({ csv: "g,x\na,1\nb,2\nb,3" }).error, /at least 2/);
  assert.match(analyze({ csv: "g,x\na,1\na,2\nb,2\nb,3", group: "nope" }).error, /no column named/);
  assert.match(analyze({ csv: "g,x\na,1\na,2\nb,2\nb,3", groups: ["a", "c"] }).error, /no rows with the value "c"/);
  assert.match(analyze({ csv: "g,t\na,x\nb,y\na,z\nb,w", group: "g" }).error, /No numeric column/);
});

test("rows with a missing value in a chosen column are dropped with a warning", () => {
  const r = analyze({ csv: "g,x,y\na,1,2\na,2,\na,3,1\nb,2,2\nb,4,3\nb,5,1", permutations: 9, energyPermutations: 9 });
  assert.deepEqual(r.n, [2, 3]);
  assert.ok(r.warnings.some((w) => /missing value/.test(w)));
});

test("the group column is guessed from a short list of text values", () => {
  assert.equal(guessGroupColumn(parseCsv(EXAMPLE)), "period");
});

test("the CSV export has one row per column and guards formulas", () => {
  const r = analyze({ csv: "g,=x\na,1\na,2\nb,3\nb,4", permutations: 9 });
  const lines = toCsv(r).trim().split("\n");
  assert.equal(lines.length, 2);
  assert.match(lines[1], /^'=x,/);
});

test("PAPERS cite the method papers with what was implemented", () => {
  assert.ok(PAPERS.length >= 4);
  for (const p of PAPERS) for (const k of ["authors", "title", "venue", "year", "url", "implemented", "deviations"]) assert.ok(p[k], `${p.title} ${k}`);
  assert.ok(PAPERS.some((p) => /Cuturi/.test(p.authors) && p.year === 2013));
});
