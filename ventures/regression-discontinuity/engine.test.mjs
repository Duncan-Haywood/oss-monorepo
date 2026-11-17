import { test } from "node:test";
import assert from "node:assert/strict";
import { analyze, rdEstimate, selectBandwidth, mccrary, binomialTwoSided, invert, normalQuantile, parseCsv } from "./engine.mjs";
import { EXAMPLE_CSV, EXAMPLE_SPEC } from "./example-data.mjs";
import { coverage } from "./eval/coverage.mjs";

function rng(seed) {
  let a = seed;
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

test("a noiseless linear design with a jump of 2 is recovered exactly", () => {
  const x = Array.from({ length: 200 }, (_, i) => -1 + (i + 0.5) / 100);
  const y = x.map((v) => 1 + 0.5 * v + (v >= 0 ? 2 : 0));
  for (const kernel of ["triangular", "epanechnikov", "uniform"]) {
    const r = rdEstimate({ x, y, h: 0.5, b: 0.8, kernel, vce: "hc0" });
    assert.ok(Math.abs(r.conventional.estimate - 2) < 1e-10, kernel);
    assert.ok(Math.abs(r.robust.estimate - 2) < 1e-10, kernel);
  }
});

test("the bias correction removes a quadratic's bias from a local linear fit", () => {
  const x = Array.from({ length: 400 }, (_, i) => -1 + (i + 0.5) / 200);
  const y = x.map((v) => (v >= 0 ? 1 + 3 * v * v : 0));
  const r = rdEstimate({ x, y, h: 0.6, b: 0.6, vce: "hc0" });
  assert.ok(Math.abs(r.conventional.estimate - 1) > 0.01, "conventional is biased");
  assert.ok(Math.abs(r.robust.estimate - 1) < 1e-9, "a quadratic is fit exactly by q = 2");
});

test("the fuzzy estimate is the ratio of the outcome and take-up jumps", () => {
  const { records } = parseCsv(EXAMPLE_CSV);
  const x = records.map((r) => +r.vote_margin), y = records.map((r) => +r.next_vote_share);
  const rnd = rng(3);
  const d = x.map((v) => (rnd() < (v >= 0 ? 0.8 : 0.1) ? 1 : 0));
  const f = rdEstimate({ x, y, d, h: 0.3, b: 0.5 });
  const ry = rdEstimate({ x, y, h: 0.3, b: 0.5 });
  const rd = rdEstimate({ x, y: d, h: 0.3, b: 0.5 });
  assert.ok(Math.abs(f.conventional.estimate - ry.conventional.estimate / rd.conventional.estimate) < 1e-12);
  assert.ok(Math.abs(f.firstStage.conventional - rd.conventional.estimate) < 1e-12);
});

test("the example: estimate, checks and a reading that names the robust interval", () => {
  const r = analyze({ csv: EXAMPLE_CSV, ...EXAMPLE_SPEC });
  assert.equal(r.bandwidth.chosen, "mse");
  assert.ok(r.robust.ci[0] < 0.04 && 0.04 < r.robust.ci[1], "covers the true jump");
  assert.equal(r.sweep.length, 9);
  assert.equal(r.placebo.length, 2);
  for (const q of r.placebo) assert.ok(q.pValue > 0.05);
  assert.ok(r.balance[0].pValue > 0.05);
  assert.ok(r.mccrary.pValue > 0.05, "sloped density is not flagged as bunching");
  assert.match(r.summary, /robust CI/);
  assert.match(r.summary, /No sign of bunching/);
  assert.ok(r.plot.bins.length >= 36 && r.plot.bins.length <= 40);
});

test("units sorting across the cutoff are caught by the density test", () => {
  const lines = EXAMPLE_CSV.trim().split("\n");
  let k = 0;
  const moved = [lines[0], ...lines.slice(1).map((l) => { const a = l.split(","); let v = +a[0]; if (v < 0 && v > -0.1 && k++ % 2 === 0) v = -v; return [v, a[1], a[2]].join(","); })].join("\n");
  const r = analyze({ csv: moved, ...EXAMPLE_SPEC });
  assert.ok(r.mccrary.pValue < 0.001);
  assert.match(r.summary, /density of the running variable jumps/);
});

test("given bandwidths are used; b defaults to h", () => {
  const r = analyze({ csv: EXAMPLE_CSV, ...EXAMPLE_SPEC, h: 0.25 });
  assert.equal(r.bandwidth.h, 0.25);
  assert.equal(r.bandwidth.b, 0.25);
  assert.equal(r.bandwidth.chosen, "given");
});

test("input errors are explained", () => {
  assert.throws(() => analyze({ csv: EXAMPLE_CSV, running: "nope", outcome: "next_vote_share" }), /No column named "nope"/);
  assert.throws(() => analyze({ csv: EXAMPLE_CSV, ...EXAMPLE_SPEC, cutoff: 5 }), /at least 10 observations on each side/);
  assert.throws(() => analyze({ csv: EXAMPLE_CSV, ...EXAMPLE_SPEC, p: 7 }), /polynomial order/);
  assert.throws(() => analyze({ csv: EXAMPLE_CSV, ...EXAMPLE_SPEC, kernel: "gauss" }), /kernel/);
  const withGaps = EXAMPLE_CSV.replace(/\n([^\n]+)\n/, "\n$1\nNA,1,1\n");
  assert.match(analyze({ csv: withGaps, ...EXAMPLE_SPEC }).notes.join(" "), /1 rows with a missing/);
});

test("a discrete running variable gets the mass-points note", () => {
  const rnd = rng(9);
  const rows = ["score,y"];
  for (let i = 0; i < 400; i++) { const s = 20 + Math.floor(rnd() * 61); rows.push(`${s},${(s >= 50 ? 3 : 0) + 0.1 * s + rnd()}`); }
  const r = analyze({ csv: rows.join("\n"), running: "score", outcome: "y", cutoff: 50 });
  assert.match(r.notes.join(" "), /mass points/);
  assert.ok(Math.abs(r.conventional.estimate - 3) < 1);
});

test("numerics: binomial test, inverse, normal quantile, McCrary on a flat density", () => {
  assert.ok(Math.abs(binomialTwoSided(5, 10) - 1) < 1e-12);
  assert.ok(Math.abs(binomialTwoSided(0, 10) - 2 / 1024) < 1e-12);
  const I = invert([[4, 1], [1, 3]]);
  assert.ok(Math.abs(I[0][0] - 3 / 11) < 1e-12 && Math.abs(I[0][1] + 1 / 11) < 1e-12);
  assert.throws(() => invert([[1, 1], [1, 1]]), /Too few distinct/);
  assert.ok(Math.abs(normalQuantile(0.975) - 1.959963984540054) < 1e-12);
  const rnd = rng(5);
  const x = Array.from({ length: 4000 }, () => rnd() * 2 - 1);
  const m = mccrary(x, 0, 0.5);
  assert.ok(Math.abs(m.left - 0.5) < 0.08 && Math.abs(m.right - 0.5) < 0.08);
  assert.ok(m.pValue > 0.01);
});

test("automatic bandwidth is finite and inside the data range", () => {
  const { records } = parseCsv(EXAMPLE_CSV);
  const x = records.map((r) => +r.vote_margin), y = records.map((r) => +r.next_vote_share);
  for (const p of [0, 1, 2]) {
    const s = selectBandwidth({ x, y, p });
    assert.ok(s.h > 0 && s.h <= 1 && s.b >= s.h, `p=${p}: ${s.h} ${s.b}`);
  }
});

test("Monte Carlo: robust intervals cover the true jump about 95% of the time (200 draws)", () => {
  const c = coverage(200, 13);
  assert.equal(c.completed, 200);
  assert.ok(c.robustCoverage >= 0.88, `robust ${c.robustCoverage}`);
  assert.ok(c.robustLength > c.conventionalLength);
});
