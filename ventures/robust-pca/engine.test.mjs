import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { svd, pcp, spectralNorm, analyze, parseCsv, buildMatrix, toCsv, flagThreshold, PAPERS, DEFAULTS, toNumber } from "./engine.mjs";

const file = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");
const REF = JSON.parse(file("eval/reference.json"));
const EXAMPLE = file("data/aep-2017-day-by-hour.csv");

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function gaussian(R) {
  return () => Math.sqrt(-2 * Math.log(R() || 1e-300)) * Math.cos(2 * Math.PI * R());
}
const relErr = (A, B) => {
  let num = 0, den = 0;
  for (let i = 0; i < A.length; i++) {
    num += (A[i] - B[i]) ** 2;
    den += B[i] ** 2;
  }
  return Math.sqrt(num / den);
};

// Candes et al. 2011, Section 4.1: L0 = X Y^T with X, Y n x r standard normal
// entries scaled by 1/n, S0 with support drawn at random and signs +-1.
function corrupted(n, rankShare, sparseShare, seed) {
  const R = rng(seed), g = gaussian(R);
  const r = Math.max(1, Math.round(rankShare * n));
  const X = Float64Array.from({ length: n * r }, g), Y = Float64Array.from({ length: n * r }, g);
  const L0 = new Float64Array(n * n);
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) {
      let a = 0;
      for (let c = 0; c < r; c++) a += X[i * r + c] * Y[j * r + c];
      L0[i * n + j] = a / n;
    }
  const S0 = new Float64Array(n * n);
  for (let i = 0; i < n * n; i++) if (R() < sparseShare) S0[i] = R() < 0.5 ? 1 : -1;
  return { L0, S0, M: L0.map((v, i) => v + S0[i]), r };
}

test("Jacobi SVD reconstructs the matrix, with orthonormal factors, wide or tall", () => {
  for (const [m, n] of [[9, 5], [5, 9], [30, 30], [1, 4]]) {
    const R = rng(m * 31 + n), g = gaussian(R);
    const A = Float64Array.from({ length: m * n }, g);
    const r = svd(A, m, n);
    let err = 0;
    for (let i = 0; i < m; i++)
      for (let j = 0; j < n; j++) {
        let a = 0;
        for (let c = 0; c < r.k; c++) a += r.U[i * r.k + c] * r.s[c] * r.V[j * r.k + c];
        err = Math.max(err, Math.abs(a - A[i * n + j]));
      }
    assert.ok(err < 1e-12, `${m}x${n} reconstruction ${err}`);
    for (let c = 1; c < r.k; c++) assert.ok(r.s[c] <= r.s[c - 1] + 1e-15);
    for (let p = 0; p < Math.min(m, n); p++)
      for (let q = p; q < Math.min(m, n); q++) {
        let d = 0;
        for (let l = 0; l < n; l++) d += r.V[l * r.k + p] * r.V[l * r.k + q];
        assert.ok(Math.abs(d - (p === q ? 1 : 0)) < 1e-12, `V^T V [${p},${q}] = ${d}`);
      }
    assert.ok(Math.abs(spectralNorm(A, m, n) - r.s[0]) < 1e-8 * r.s[0]);
  }
});

test("a warm start gives the same singular values in fewer sweeps", () => {
  const m = 80, n = 12, R = rng(7), g = gaussian(R);
  const A = Float64Array.from({ length: m * n }, g);
  const cold = svd(A, m, n);
  const B = A.map((v) => v + 1e-3 * g());
  const warm = svd(B, m, n, { warmV: cold.V });
  const ref = svd(B, m, n);
  for (let c = 0; c < n; c++) assert.ok(Math.abs(warm.s[c] - ref.s[c]) < 1e-12);
  assert.ok(warm.sweeps < ref.sweeps, `${warm.sweeps} vs ${ref.sweeps}`);
});

test("exact recovery (Candes et al. 2011, Section 4.1): rank 0.05 n, 5% gross errors", () => {
  for (const [n, seed] of [[100, 1], [150, 2]]) {
    const { L0, S0, M, r } = corrupted(n, 0.05, 0.05, seed);
    const out = pcp(M, n, n);
    assert.ok(out.converged);
    assert.equal(out.rank, r);
    assert.ok(relErr(out.L, L0) < 1e-5, `L error ${relErr(out.L, L0)}`);
    assert.ok(relErr(out.S, S0) < 1e-5, `S error ${relErr(out.S, S0)}`);
    // the support of S is recovered
    let wrong = 0;
    for (let i = 0; i < S0.length; i++) if ((Math.abs(out.S[i]) > 1e-3) !== (S0[i] !== 0)) wrong++;
    assert.equal(wrong, 0);
    assert.ok(out.gap < 1e-5, `certified gap ${out.gap}`);
  }
});

test("matches TensorLy's robust_pca on a 60 x 40 case with missing cells", () => {
  const s = REF.synthetic;
  const out = pcp(Float64Array.from(s.M), s.m, s.n, { observed: Uint8Array.from(s.observed), tol: 1e-10, maxIter: 3000 });
  assert.equal(out.rank, s.rank);
  let dl = 0, ds = 0;
  for (let i = 0; i < s.L.length; i++) {
    dl = Math.max(dl, Math.abs(out.L[i] - s.L[i]));
    ds = Math.max(ds, Math.abs(out.S[i] - s.S[i]));
  }
  assert.ok(dl < 1e-6 && ds < 1e-6, `max |dL| ${dl}, |dS| ${ds}`);
  assert.equal(REF.versions.tensorly, "0.10.0");
});

test("on the example, reaches TensorLy's objective or better and agrees cell by cell", () => {
  const t = buildMatrix(parseCsv(EXAMPLE));
  const out = pcp(t.M, t.m, t.n, { observed: t.observed });
  const ref = REF.aep;
  // the reference split's objective, from its S (L = M - S on observed cells)
  const L0 = new Float64Array(t.m * t.n);
  for (let i = 0; i < L0.length; i++) L0[i] = t.observed[i] ? t.M[i] - ref.S[i] : ref.filled;
  let nuclear = 0;
  for (const v of svd(L0, t.m, t.n).s) nuclear += v;
  let l1 = 0;
  for (let i = 0; i < ref.S.length; i++) if (t.observed[i]) l1 += Math.abs(ref.S[i]);
  const refObjective = nuclear + ref.lambda * l1;
  assert.ok(out.objective <= refObjective * (1 + 1e-7), `${out.objective} vs ${refObjective}`);
  assert.ok(out.dualBound <= refObjective, "the dual bound is a lower bound on any feasible split");
  let worst = 0;
  for (let i = 0; i < ref.S.length; i++) worst = Math.max(worst, Math.abs(out.S[i] - ref.S[i]));
  // near-optimal splits of real data differ a little: under 0.2% of a typical 15,000 MW hour
  assert.ok(worst < 30, `largest cell difference ${worst} MW`);
  assert.ok(Math.abs(out.singularValues[0] + 0 - ref.singular_values[0]) / ref.singular_values[0] < 1e-3);
});

test("the duality certificate is valid: dual bound <= objective, and tight at convergence", () => {
  const { M } = corrupted(60, 0.05, 0.1, 9);
  const loose = pcp(M, 60, 60, { tol: 1e-3 });
  const tight = pcp(M, 60, 60, { tol: 1e-9 });
  assert.ok(loose.dualBound <= tight.objective + 1e-9);
  assert.ok(tight.dualBound <= tight.objective + 1e-9);
  assert.ok(tight.gap < loose.gap);
  assert.ok(tight.gap < 1e-5);
});

test("missing cells: PCP fills them from the low-rank part", () => {
  const n = 60, { L0, S0, M } = corrupted(n, 0.05, 0.05, 4);
  const R = rng(99);
  const observed = Uint8Array.from({ length: n * n }, () => (R() < 0.1 ? 0 : 1));
  const out = pcp(M, n, n, { observed });
  let err = 0, scale = 0;
  for (let i = 0; i < M.length; i++)
    if (!observed[i]) {
      err = Math.max(err, Math.abs(out.L[i] - L0[i]));
      scale = Math.max(scale, Math.abs(L0[i]));
      assert.equal(out.S[i], 0);
    }
  assert.ok(err < 1e-3 * scale + 1e-6, `fill error ${err} on scale ${scale}`);
  assert.ok(S0.length === M.length);
});

test("PCP is scale-equivariant and transpose-equivariant", () => {
  const { M } = corrupted(40, 0.05, 0.05, 5);
  const a = pcp(M, 40, 40, { tol: 1e-10 });
  const b = pcp(M.map((v) => v * 1000), 40, 40, { tol: 1e-10 });
  assert.ok(relErr(b.S.map((v) => v / 1000), a.S) < 1e-6);
  const m = 30, n = 20, { M: W } = corrupted(30, 0.1, 0.05, 6);
  const W2 = W.slice(0, m * n);
  const T = new Float64Array(m * n);
  for (let i = 0; i < m; i++) for (let j = 0; j < n; j++) T[j * m + i] = W2[i * n + j];
  const p = pcp(W2, m, n, { tol: 1e-10 }), q = pcp(T, n, m, { tol: 1e-10 });
  let d = 0;
  for (let i = 0; i < m; i++) for (let j = 0; j < n; j++) d = Math.max(d, Math.abs(p.S[i * n + j] - q.S[j * m + i]));
  assert.ok(d < 1e-6, `transpose difference ${d}`);
});

test("analyze on the example: one dominant daily shape, the DST day and a filled gap", () => {
  const r = analyze({ csv: EXAMPLE });
  assert.equal(r.m, 365);
  assert.equal(r.n, 24);
  assert.equal(r.labelColumn, "date");
  assert.equal(r.missing, 1);
  assert.ok(r.converged);
  assert.ok(r.gap < 1e-3, `gap ${r.gap}`);
  assert.equal(r.components99, 1);
  assert.ok(r.energy[0] > 0.99);
  // the cell the extract skips at the spring-forward change is filled near its neighbours
  assert.equal(r.filled.length, 1);
  assert.equal(r.filled[0].row, "2017-03-12");
  assert.equal(r.filled[0].column, "he03");
  assert.ok(r.filled[0].filled > 13500 && r.filled[0].filled < 14400, String(r.filled[0].filled));
  // the spring-forward day, whose clock hours slide against the day's shape, is among the top rows
  const top = r.rows.slice(0, 5).map((x) => x.row);
  assert.ok(top.includes("2017-03-12"), top.join(", "));
  assert.equal(r.rows[0].row, "2017-08-21");
  assert.match(r.summary, /365 rows by 24 columns/);
  assert.match(r.summary, /certified within/);
  assert.equal(r.L.length, 365 * 24);
});

test("observed = low rank + sparse on every observed cell of the example", () => {
  const r = analyze({ csv: EXAMPLE });
  let worst = 0;
  for (let i = 0; i < r.M.length; i++) if (r.observed[i]) worst = Math.max(worst, Math.abs(r.M[i] - r.L[i] - r.S[i]));
  // the solver stops at a residual of 1e-7 of ||M||_F (about 0.14 MW here)
  assert.ok(worst < 0.15, `largest misfit ${worst} MW`);
});

test("sensitivity: a larger lambda flags fewer cells", () => {
  const a = analyze({ csv: EXAMPLE, sensitivity: 1 });
  const b = analyze({ csv: EXAMPLE, sensitivity: 2 });
  assert.ok(b.flaggedCount < a.flaggedCount);
  assert.ok(b.nonzero < a.nonzero);
});

test("an exactly low-rank table with one bad cell flags that cell alone", () => {
  const rows = ["id,a,b,c,d,e"];
  for (let i = 0; i < 30; i++) {
    const base = 10 + i;
    const v = [1, 2, 3, 4, 5].map((k) => base * k);
    if (i === 17) v[2] += 500;
    rows.push(`r${i},${v.join(",")}`);
  }
  const r = analyze({ csv: rows.join("\n") });
  assert.equal(r.cells[0].row, "r17");
  assert.equal(r.cells[0].column, "c");
  assert.ok(Math.abs(r.cells[0].expected - 27 * 3) < 1, String(r.cells[0].expected));
  assert.equal(r.rows[0].row, "r17");
  assert.equal(r.flaggedCount, 1);
});

test("fold turns one long series into rows of the cycle", () => {
  const lines = ["t,load"];
  for (let d = 0; d < 20; d++) for (let h = 0; h < 24; h++) lines.push(`d${d}h${h},${100 + 10 * Math.sin((2 * Math.PI * h) / 24) + d + (d === 7 && h === 5 ? 80 : 0)}`);
  lines.push("extra,1");
  const r = analyze({ csv: lines.join("\n"), fold: 24 });
  assert.equal(r.m, 20);
  assert.equal(r.n, 24);
  assert.equal(r.rowLabels[7], "d7h0");
  assert.equal(r.cells[0].row, "d7h0");
  assert.equal(r.cells[0].column, "6");
  assert.match(r.warnings.join(" "), /last 1 values/);
});

test("robust scaling puts columns in different units on an equal footing and reports in their units", () => {
  const rows = ["id,metres,grams"];
  for (let i = 0; i < 40; i++) rows.push(`r${i},${(1 + i / 40).toFixed(4)},${(1000 * (1 + i / 40) + (i === 9 ? 900 : 0)).toFixed(1)}`);
  const r = analyze({ csv: rows.join("\n"), scale: "robust" });
  assert.equal(r.cells[0].row, "r9");
  assert.equal(r.cells[0].column, "grams");
  assert.ok(r.cells[0].sparse > 300, String(r.cells[0].sparse));
});

test("input errors are explained, not thrown", () => {
  assert.match(analyze({ csv: "" }).error, /empty/);
  assert.match(analyze({ csv: "a\n1\n2" }).error, /at least two numeric columns/);
  assert.match(analyze({ csv: "a,b\nx,1\n2,3" }).error, /text in it|at least two/);
  assert.match(analyze({ csv: "a,b\n1,2\n3,4", columns: ["a", "zz"] }).error, /no column called "zz"/);
  assert.match(analyze({ csv: "a,b\n1,2\n3,4", fold: 1 }).error, /fold length/);
  assert.match(analyze({ csv: "a,b\n1,2\n3,4", fold: 2 }).error, /one numeric column/);
  assert.match(analyze({ csv: "a,b\n,\n," }).error, /Every cell|No numeric/);
  assert.match(analyze({ csv: "a,b\n1,2\n3,4", sensitivity: 0 }).error, /sensitivity/);
  assert.match(analyze({ csv: "a,b\n1,2\n3,4", scale: "zz" }).error, /scale/);
});

test("number parsing: thousands separators, currency and missing markers", () => {
  assert.equal(toNumber("1,234.5"), 1234.5);
  assert.equal(toNumber("$12"), 12);
  assert.equal(toNumber("NA"), null);
  assert.equal(toNumber(""), null);
  assert.ok(Number.isNaN(toNumber("abc")));
});

test("flag threshold is zero for an exactly sparse S, so every nonzero cell counts", () => {
  const S = new Float64Array(100);
  S[3] = 5;
  assert.equal(flagThreshold(S, null), 0);
});

test("toCsv writes one line per cell with low-rank, sparse and flag", () => {
  const r = analyze({ csv: "id,a,b,c\nx,1,2,3\ny,2,4,6\nz,3,6,90\nw,4,8,12" });
  const lines = toCsv(r).trim().split("\n");
  assert.equal(lines[0], "row,column,observed,low_rank,sparse,flagged");
  assert.equal(lines.length, 1 + 12);
  assert.ok(lines.some((l) => l.startsWith("z,c,90,") && l.endsWith(",1")));
});

test("PAPERS and DEFAULTS are complete", () => {
  assert.ok(PAPERS.length >= 3);
  for (const p of PAPERS) for (const k of ["authors", "title", "venue", "year", "url", "implemented", "deviations"]) assert.ok(p[k], `${p.title} ${k}`);
  assert.equal(DEFAULTS.sensitivity, 1);
  assert.match(PAPERS[0].title, /Robust Principal Component Analysis/);
});
