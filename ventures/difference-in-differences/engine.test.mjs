import { test } from "node:test";
import assert from "node:assert/strict";
import { analyze, attGt, buildPanel, baconDecomposition, twfe, chi2Sf, normalCdf, normalQuantile, parseCsv, mulberry32, PAPERS, DEFAULTS } from "./engine.mjs";

// Build a long CSV from a generator y(unit, t) and cohorts.
function panelCsv(cohorts, times, y, extra = {}) {
  const head = ["unit", "t", "y", "g", "d", ...Object.keys(extra)];
  const lines = [head.join(",")];
  cohorts.forEach((g, i) => times.forEach((t) => lines.push([`u${i}`, t, y(i, t, g), g, g && t >= g ? 1 : 0, ...Object.values(extra).map((f) => f(i, t))].join(","))));
  return lines.join("\n");
}
const TIMES = [1, 2, 3, 4, 5, 6, 7, 8];
const COHORTS = [3, 3, 3, 5, 5, 5, 5, 7, 7, 0, 0, 0, 0, 0];
const rng = mulberry32(5);
const unitFx = COHORTS.map(() => rng() * 10);
const timeFx = TIMES.map(() => rng() * 3);

test("PAPERS cite every method with what was implemented", () => {
  assert.ok(PAPERS.length >= 3);
  for (const p of PAPERS) for (const k of ["authors", "title", "venue", "year", "url", "implemented", "deviations"]) assert.ok(p[k], `${p.title} ${k}`);
  assert.equal(DEFAULTS.control, "never");
});

test("the 2x2 case is the difference of mean changes", () => {
  const csv = "unit,t,y,g\nA,0,10,1\nA,1,15,1\nB,0,8,1\nB,1,14,1\nC,0,9,0\nC,1,10,0\nD,0,7,0\nD,1,10,0\n";
  const r = analyze({ csv, unit: "unit", time: "t", outcome: "y", cohort: "g", bootstrap: 0 });
  // treated change (5+6)/2 = 5.5, control change (1+3)/2 = 2, effect 3.5
  assert.equal(r.attgt.length, 1);
  assert.ok(Math.abs(r.overall.att - 3.5) < 1e-12);
  assert.ok(Math.abs(r.twfe.beta - 3.5) < 1e-12);
  // se^2 = var_T/n_T + var_C/n_C with 1/n variances: ((0.5^2*2)/4) + ((1^2*2)/4)
  assert.ok(Math.abs(r.overall.se - Math.sqrt(0.125 + 0.5)) < 1e-12);
});

test("a planted constant effect under exact parallel trends is recovered in every cell", () => {
  const csv = panelCsv(COHORTS, TIMES, (i, t, g) => unitFx[i] + timeFx[t - 1] + (g && t >= g ? 2.5 : 0));
  for (const control of ["never", "notyet"]) for (const base of ["varying", "universal"]) {
    const r = analyze({ csv, unit: "unit", time: "t", outcome: "y", cohort: "g", control, base, bootstrap: 0 });
    for (const c of r.attgt.filter((c) => Number.isFinite(c.att))) assert.ok(Math.abs(c.att - (c.t >= c.g ? 2.5 : 0)) < 1e-9, `${control}/${base} ATT(${c.g},${c.t}) = ${c.att}`);
    assert.ok(Math.abs(r.overall.att - 2.5) < 1e-9);
    assert.ok(Math.abs(r.twfe.beta - 2.5) < 1e-9, "a constant effect leaves TWFE unbiased");
  }
});

test("effects that grow over time bias TWFE but not the group-time estimates", () => {
  const csv = panelCsv(COHORTS, TIMES, (i, t, g) => unitFx[i] + timeFx[t - 1] + (g && t >= g ? 1 + (t - g) : 0));
  const r = analyze({ csv, unit: "unit", time: "t", outcome: "y", cohort: "g", bootstrap: 0 });
  for (const e of r.eventStudy.filter((e) => e.e >= 0)) assert.ok(Math.abs(e.att - (1 + e.e)) < 1e-9);
  const forbidden = r.bacon.byType.find((b) => b.type === "later vs already treated");
  assert.ok(forbidden.weight > 0 && forbidden.estimate < r.overall.att, "already-treated controls pull the TWFE estimate down");
  assert.ok(r.twfe.beta < r.overall.att - 0.3, `TWFE ${r.twfe.beta} vs CS ${r.overall.att}`);
});

test("Goodman-Bacon weights sum to one and rebuild the TWFE coefficient, including always-treated units", () => {
  for (let seed = 1; seed <= 25; seed++) {
    const R = mulberry32(seed);
    const T = 4 + Math.floor(R() * 8);
    const times = Array.from({ length: T }, (_, i) => 2000 + i);
    const n = 6 + Math.floor(R() * 20);
    const cohorts = Array.from({ length: n }, () => (R() < 0.3 ? 0 : times[Math.floor(R() * T)]));
    if (!cohorts.some((g) => g > times[0])) cohorts[0] = times[1];
    const Y = cohorts.map(() => times.map(() => R() * 10));
    const panel = { units: cohorts.map((_, i) => `u${i}`), times, Y, G: cohorts };
    const b = baconDecomposition(panel);
    if (!b) continue;
    assert.ok(Math.abs(b.weightSum - 1) < 1e-9, `seed ${seed}: weights sum to ${b.weightSum}`);
    assert.ok(Math.abs(b.reconstructed - twfe(panel).beta) < 1e-9, `seed ${seed}: ${b.reconstructed} vs ${b.beta}`);
    for (const c of b.components) assert.ok(c.weight >= -1e-12);
  }
});

test("a 0/1 treatment column gives the same answer as a first-treated column", () => {
  const csv = panelCsv(COHORTS, TIMES, (i, t, g) => unitFx[i] + timeFx[t - 1] + (g && t >= g ? t - g : 0) + Math.sin(i * t));
  const a = analyze({ csv, unit: "unit", time: "t", outcome: "y", cohort: "g", bootstrap: 0 });
  const b = analyze({ csv, unit: "unit", time: "t", outcome: "y", treatment: "d", bootstrap: 0 });
  assert.deepEqual(a.attgt, b.attgt);
  assert.equal(a.twfe.beta, b.twfe.beta);
});

test("shuffling rows, renaming units and shifting a unit's level change nothing", () => {
  const y = (i, t, g) => unitFx[i] + timeFx[t - 1] + (g && t >= g ? 1.5 : 0) + Math.cos(3 * i + t);
  const csv = panelCsv(COHORTS, TIMES, y);
  const base = analyze({ csv, unit: "unit", time: "t", outcome: "y", cohort: "g", bootstrap: 0 });
  const [head, ...rows] = csv.split("\n");
  const R = mulberry32(9);
  const shuffled = [head, ...rows.map((r) => [R(), r]).sort((a, b) => a[0] - b[0]).map((x) => x[1])].join("\n").replace(/\bu(\d+),/g, "unit-$1,");
  const s = analyze({ csv: shuffled, unit: "unit", time: "t", outcome: "y", cohort: "g", bootstrap: 0 });
  assert.ok(Math.abs(s.overall.att - base.overall.att) < 1e-12 && Math.abs(s.overall.se - base.overall.se) < 1e-12);
  const shifted = analyze({ csv: panelCsv(COHORTS, TIMES, (i, t, g) => y(i, t, g) + 100 * i), unit: "unit", time: "t", outcome: "y", cohort: "g", bootstrap: 0 });
  assert.ok(Math.abs(shifted.overall.att - base.overall.att) < 1e-9);
  assert.ok(Math.abs(shifted.twfe.beta - base.twfe.beta) < 1e-9);
});

test("anticipation moves the base period back", () => {
  const csv = panelCsv(COHORTS, TIMES, (i, t, g) => unitFx[i] + timeFx[t - 1] + (g && t >= g - 1 ? 2 : 0));
  const naive = analyze({ csv, unit: "unit", time: "t", outcome: "y", cohort: "g", bootstrap: 0 });
  const ant = analyze({ csv, unit: "unit", time: "t", outcome: "y", cohort: "g", anticipation: 1, bootstrap: 0 });
  assert.ok(Math.abs(naive.overall.att) < 1e-9, "with the effect starting a period early, the default base already holds it");
  assert.ok(Math.abs(ant.overall.att - 2) < 1e-9);
});

test("the simultaneous band is wider than the pointwise one and reproducible by seed", () => {
  const R = mulberry32(3);
  const csv = panelCsv(COHORTS, TIMES, (i, t, g) => unitFx[i] + timeFx[t - 1] + (g && t >= g ? 1 : 0) + R());
  const a = analyze({ csv, unit: "unit", time: "t", outcome: "y", cohort: "g", bootstrap: 499, seed: 11 });
  const b = analyze({ csv, unit: "unit", time: "t", outcome: "y", cohort: "g", bootstrap: 499, seed: 11 });
  assert.equal(a.uniformCritical, b.uniformCritical);
  assert.ok(a.uniformCritical > 1.96 && a.uniformCritical < 5, `${a.uniformCritical}`);
  for (const e of a.eventStudy) assert.ok(e.ulo <= e.lo + 1e-12 && e.uhi >= e.hi - 1e-12);
});

test("refusals: treatment switching off, duplicate rows, no never-treated units, no treated units", () => {
  const off = "unit,t,y,d\nA,1,1,0\nA,2,1,1\nA,3,1,0\nB,1,1,0\nB,2,1,0\nB,3,1,0\n";
  assert.throws(() => analyze({ csv: off, unit: "unit", time: "t", outcome: "y", treatment: "d" }), /switches treatment off/);
  const dup = "unit,t,y,g\nA,1,1,2\nA,1,2,2\nB,1,1,0\n";
  assert.throws(() => analyze({ csv: dup, unit: "unit", time: "t", outcome: "y", cohort: "g" }), /more than one row/);
  const allTreated = panelCsv([2, 2, 3, 3], [1, 2, 3, 4], (i, t) => i + t);
  assert.throws(() => analyze({ csv: allTreated, unit: "unit", time: "t", outcome: "y", cohort: "g" }), /not-yet-treated/);
  const r = analyze({ csv: allTreated, unit: "unit", time: "t", outcome: "y", cohort: "g", control: "notyet", bootstrap: 0 });
  assert.ok(r.notes.some((n) => /no comparison units/.test(n)));
  const none = panelCsv([0, 0, 0], [1, 2], (i, t) => i + t);
  assert.throws(() => analyze({ csv: none, unit: "unit", time: "t", outcome: "y", cohort: "g" }), /No unit is treated/);
});

test("unbalanced units are dropped with a note; late and between-period cohorts are mapped", () => {
  const csv = "unit,t,y,g\nA,1,1,2\nA,2,3,2\nA,3,4,2\nB,1,1,0\nB,2,1,0\nB,3,2,0\nC,1,1,0\nC,3,1,0\nD,1,2,9\nD,2,2,9\nD,3,3,9\nE,1,0,1.5\nE,2,2,1.5\nE,3,3,1.5\n";
  const p = buildPanel(parseCsv(csv).records, { unit: "unit", time: "t", outcome: "y", cohort: "g" });
  assert.deepEqual(p.units, ["A", "B", "D", "E"]);
  assert.deepEqual(p.G, [2, 0, 0, 2]);
  assert.ok(p.notes.some((n) => /dropped/.test(n)) && p.notes.some((n) => /after the last period/.test(n)));
});

test("a one-unit cohort suppresses the pre-test and minCohort drops it", () => {
  const C = [3, 5, 5, 5, 5, 0, 0, 0, 0, 0, 0];
  const R = mulberry32(8);
  const csv = panelCsv(C, TIMES, (i, t) => i + t + R());
  const r = analyze({ csv, unit: "unit", time: "t", outcome: "y", cohort: "g", bootstrap: 0 });
  assert.equal(r.pretest, null);
  assert.ok(r.notes.some((n) => /single unit/.test(n)));
  const r2 = analyze({ csv, unit: "unit", time: "t", outcome: "y", cohort: "g", bootstrap: 0, minCohort: 2 });
  assert.deepEqual(r2.cohorts.map((c) => c.g), [5]);
  assert.ok(r2.pretest && Number.isFinite(r2.pretest.pValue));
});

test("attGt influence functions reproduce the reported standard errors", () => {
  const csv = panelCsv(COHORTS, TIMES, (i, t) => unitFx[i] * t + Math.sin(i + t));
  const p = buildPanel(parseCsv(csv).records, { unit: "unit", time: "t", outcome: "y", cohort: "g" });
  for (const c of attGt(p)) {
    const ss = [...c.inf].reduce((s, v) => s + v * v, 0);
    assert.ok(Math.abs(Math.sqrt(ss) / p.Y.length - c.se) < 1e-12);
    assert.ok(Math.abs([...c.inf].reduce((s, v) => s + v, 0)) < 1e-9, "influence functions have mean zero");
  }
});

test("distribution functions against known values", () => {
  assert.ok(Math.abs(normalCdf(1.959963984540054) - 0.975) < 1e-12);
  assert.ok(Math.abs(normalCdf(-3.090232306167813) - 0.001) < 1e-12);
  assert.ok(Math.abs(normalQuantile(0.975) - 1.959963984540054) < 1e-12);
  assert.ok(Math.abs(normalQuantile(0.005) + 2.5758293035489) < 1e-10);
  assert.ok(Math.abs(chi2Sf(3.841458820694124, 1) - 0.05) < 1e-12);
  assert.ok(Math.abs(chi2Sf(18.307038053275146, 10) - 0.05) < 1e-12);
  assert.ok(Math.abs(chi2Sf(124.34211340400407, 100) - 0.05) < 1e-10);
  assert.equal(chi2Sf(0, 3), 1);
});
