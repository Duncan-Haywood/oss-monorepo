// The revised simplex of bnp.mjs as it was before 2026-11-11 (dense row operations, every basic value re-summed each pivot),
// kept as a reference: bnp.test.mjs checks that bnp.mjs's solveLP returns the same pivots, basis, primal and duals bit for bit,
// so a speed change to the solver cannot quietly move the branch-and-price search onto another path.

const EPS = 1e-9;

export function solveLPDense(m, cols, cost, init, { maxPivots = 20000, warm = null, bigM = 1e6 } = {}) {
  const n = cols.length;
  const BIG_M = bigM;
  // Column ids >= n are artificials: id n + r covers row r.
  const basis = warm ? Int32Array.from(warm, (j) => (j >= 0 ? j : n + (-1 - j))) : Int32Array.from(init, (j, r) => (j >= 0 ? j : n + r));
  const colRows = (j) => (j < n ? cols[j] : [j - n]);
  const colCost = (j) => (j < n ? cost[j] : BIG_M);
  const inBasis = new Uint8Array(n + m);
  for (const j of basis) inBasis[j] = 1;
  let Binv = new Float64Array(m * m);
  const refactor = () => {
    // Invert B by Gauss-Jordan with partial pivoting (B is 0/1 and well scaled).
    const A = new Float64Array(m * 2 * m);
    for (let c = 0; c < m; c++) for (const r of colRows(basis[c])) A[r * 2 * m + c] = 1;
    for (let r = 0; r < m; r++) A[r * 2 * m + m + r] = 1;
    for (let c = 0; c < m; c++) {
      let piv = c;
      for (let r = c + 1; r < m; r++) if (Math.abs(A[r * 2 * m + c]) > Math.abs(A[piv * 2 * m + c])) piv = r;
      if (Math.abs(A[piv * 2 * m + c]) < 1e-12) throw new Error("singular basis");
      if (piv !== c) for (let k = 0; k < 2 * m; k++) { const t = A[c * 2 * m + k]; A[c * 2 * m + k] = A[piv * 2 * m + k]; A[piv * 2 * m + k] = t; }
      const d = A[c * 2 * m + c];
      for (let k = 0; k < 2 * m; k++) A[c * 2 * m + k] /= d;
      for (let r = 0; r < m; r++) {
        if (r === c) continue;
        const f = A[r * 2 * m + c];
        if (f !== 0) for (let k = 0; k < 2 * m; k++) A[r * 2 * m + k] -= f * A[c * 2 * m + k];
      }
    }
    // Rows of [I | B^-1] are in basis-position order after the swaps above: B^-1 row c belongs to basis position c.
    Binv = new Float64Array(m * m);
    for (let r = 0; r < m; r++) for (let k = 0; k < m; k++) Binv[r * m + k] = A[r * 2 * m + m + k];
  };
  refactor();
  const xB = new Float64Array(m);
  // Basic values within 1e-9 of zero are set to zero. Without this, rounding left values like 1e-11 on degenerate rows, the
  // ratio test saw a step of 1e-11 as progress, the anti-cycling switch below never stayed on, and a 20-person week (102 rows,
  // 497 columns) cycled at its optimum past 400,000 pivots (eval/cg-scale-bench.mjs, 2026-11-10). With it: 479 pivots.
  const computeX = () => { for (let r = 0; r < m; r++) { let v = 0; for (let k = 0; k < m; k++) v += Binv[r * m + k]; xB[r] = Math.abs(v) < 1e-9 ? 0 : v; } };
  computeX();
  const y = new Float64Array(m);
  const d = new Float64Array(m);
  let pivots = 0, sinceRefactor = 0, degenerate = 0;
  for (;;) {
    // Duals y = c_B B^-1.
    y.fill(0);
    for (let r = 0; r < m; r++) { const cb = colCost(basis[r]); if (cb !== 0) for (let k = 0; k < m; k++) y[k] += cb * Binv[r * m + k]; }
    // Pricing: Dantzig's rule, Bland's (lowest index) after a run of degenerate pivots so the method cannot cycle.
    const bland = degenerate > 50;
    // Entering tolerance relative to the duals: while big-M artificials are basic the duals are near 1e6 and a reduced cost of
    // -1e-9 is rounding, and a 40-person week made 200,000 pivots on such columns without ending (eval/cg-scale-bench.mjs).
    let ymax = 0;
    for (let k = 0; k < m; k++) if (Math.abs(y[k]) > ymax) ymax = Math.abs(y[k]);
    let enter = -1, best = -1e-11 * (1 + ymax);
    for (let j = 0; j < n; j++) {
      if (inBasis[j]) continue;
      let rc = cost[j];
      for (const r of cols[j]) rc -= y[r];
      if (rc < best) { enter = j; best = rc; if (bland) break; }
    }
    if (enter < 0) break;
    d.fill(0);
    for (const r of cols[enter]) for (let k = 0; k < m; k++) d[k] += Binv[k * m + r];
    let leave = -1, ratio = Infinity;
    for (let r = 0; r < m; r++) {
      if (d[r] > EPS) {
        const t = xB[r] / d[r];
        if (t < ratio - 1e-12 || (Math.abs(t - ratio) <= 1e-12 && bland && basis[r] < basis[leave])) { ratio = t; leave = r; }
      }
    }
    if (leave < 0) throw new Error("unbounded LP"); // cannot happen: costs are >= 0
    degenerate = ratio < 1e-9 ? degenerate + 1 : 0;
    // Pivot.
    const dl = d[leave];
    for (let k = 0; k < m; k++) Binv[leave * m + k] /= dl;
    for (let r = 0; r < m; r++) {
      if (r === leave || Math.abs(d[r]) < 1e-15) continue;
      const f = d[r];
      for (let k = 0; k < m; k++) Binv[r * m + k] -= f * Binv[leave * m + k];
    }
    inBasis[basis[leave]] = 0;
    basis[leave] = enter;
    inBasis[enter] = 1;
    if (++sinceRefactor >= 64) { refactor(); sinceRefactor = 0; }
    computeX();
    if (++pivots > maxPivots) throw new Error("simplex pivot limit");
  }
  let obj = 0, infeasible = false;
  const x = new Float64Array(n);
  for (let r = 0; r < m; r++) {
    const j = basis[r];
    if (j >= n) { if (xB[r] > 1e-7) infeasible = true; continue; }
    x[j] = Math.max(0, xB[r]);
    obj += cost[j] * x[j];
  }
  return { obj, x, infeasible, pivots, y, basis: Int32Array.from(basis, (j) => (j < n ? j : -1 - (j - n))) };
}
