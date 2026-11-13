// A small primal-dual interior-point LP solver for problems whose constraint
// rows can be ordered so every column touches a narrow band of rows, plus a
// few "dense" columns that touch many rows. Pure JavaScript, no dependencies.
//
//   minimise  cost . x   subject to  A x = b,  0 <= x <= upper  (upper may be Infinity)
//
// Method: Mehrotra's predictor-corrector (Mehrotra 1992; the bounded-variable
// form in Wright, "Primal-Dual Interior-Point Methods", SIAM 1997, ch. 10 and
// Vanderbei, "Linear Programming", ch. 19). Each iteration solves the normal
// equations (A Θ A^T) dy = r. The sparse columns give a banded matrix, factored
// by banded Cholesky in O(rows x band^2); the dense columns are a low-rank
// update handled by the Sherman-Morrison-Woodbury identity. A battery month of
// 2,976 fifteen-minute intervals is about 17,000 variables and 12,000 rows with
// a band of 4, and solves in tens of milliseconds.

/**
 * cols: [{rows: Int32Array|number[], vals: number[], cost, upper (Infinity ok), dense?: bool}]
 * nRows, b: Float64Array(nRows).
 * Returns {x, y, obj, iterations, ok, relGap, primalRes, dualRes}.
 */
export function solveBandedLP({ nRows, b, cols }, { tol = 1e-8, maxIter = 100 } = {}) {
  const nCols = cols.length;
  const sparse = [], dense = [];
  for (let j = 0; j < nCols; j++) (cols[j].dense ? dense : sparse).push(j);
  // band width of A_s Θ A_s^T
  let bw = 0;
  for (const j of sparse) {
    const r = cols[j].rows;
    let lo = Infinity, hi = -Infinity;
    for (let k = 0; k < r.length; k++) { if (r[k] < lo) lo = r[k]; if (r[k] > hi) hi = r[k]; }
    if (hi - lo > bw) bw = hi - lo;
  }
  const W = bw + 1;
  const c = Float64Array.from(cols, (q) => q.cost);
  const up = Float64Array.from(cols, (q) => q.upper);
  const hasUp = Uint8Array.from(cols, (q) => (Number.isFinite(q.upper) ? 1 : 0));

  const Ax = (x, out) => {
    out.fill(0);
    for (let j = 0; j < nCols; j++) {
      const xj = x[j];
      if (xj === 0) continue;
      const { rows, vals } = cols[j];
      for (let k = 0; k < rows.length; k++) out[rows[k]] += vals[k] * xj;
    }
    return out;
  };
  const ATy = (y, out) => {
    for (let j = 0; j < nCols; j++) {
      const { rows, vals } = cols[j];
      let s = 0;
      for (let k = 0; k < rows.length; k++) s += vals[k] * y[rows[k]];
      out[j] = s;
    }
    return out;
  };

  // scale for the starting point
  let bmax = 1; for (let i = 0; i < nRows; i++) bmax = Math.max(bmax, Math.abs(b[i]));
  let cmax = 1; for (let j = 0; j < nCols; j++) cmax = Math.max(cmax, Math.abs(c[j]));
  const x = new Float64Array(nCols), z = new Float64Array(nCols), w = new Float64Array(nCols), r = new Float64Array(nCols);
  for (let j = 0; j < nCols; j++) {
    x[j] = hasUp[j] ? up[j] / 2 : bmax;
    if (hasUp[j] && up[j] === 0) x[j] = 0; // fixed at zero: handled by tiny box below
    r[j] = hasUp[j] ? up[j] - x[j] : 0;
    z[j] = cmax; w[j] = hasUp[j] ? cmax : 0;
  }
  for (let j = 0; j < nCols; j++) if (hasUp[j] && up[j] <= 0) { up[j] = 1e-12; x[j] = r[j] = 5e-13; }
  const y = new Float64Array(nRows);

  const band = new Float64Array(nRows * W); // band[i*W + k] = M[i][i-k]
  const theta = new Float64Array(nCols);
  const tmpR = new Float64Array(nRows), tmpC = new Float64Array(nCols);
  const nd = dense.length;
  const MinvV = Array.from({ length: nd }, () => new Float64Array(nRows));
  const S = new Float64Array(nd * nd);

  function factor() {
    band.fill(0);
    for (const j of sparse) {
      const { rows, vals } = cols[j];
      const t = theta[j];
      for (let a = 0; a < rows.length; a++) for (let bb = 0; bb < rows.length; bb++) {
        const i = rows[a], k = rows[bb];
        if (k > i) continue;
        band[i * W + (i - k)] += vals[a] * vals[bb] * t;
      }
    }
    let maxDiag = 0;
    for (let i = 0; i < nRows; i++) maxDiag = Math.max(maxDiag, band[i * W]);
    const floor = 1e-14 * (maxDiag || 1);
    // banded Cholesky in place: L[i][i-k]
    for (let i = 0; i < nRows; i++) {
      for (let k = Math.min(bw, i); k >= 1; k--) {
        const jj = i - k;
        let s = band[i * W + k];
        const lim = Math.min(bw - k, jj); // shared columns m < jj with both entries in band
        for (let q = 1; q <= lim; q++) s -= band[i * W + k + q] * band[jj * W + q];
        band[i * W + k] = s / band[jj * W];
      }
      let d = band[i * W];
      for (let k = 1; k <= Math.min(bw, i); k++) d -= band[i * W + k] ** 2;
      band[i * W] = Math.sqrt(d > floor ? d : floor);
    }
    // Woodbury pieces: M^{-1} v_j for dense columns, S = Θ_d^{-1} + V^T M^{-1} V
    for (let a = 0; a < nd; a++) {
      const v = MinvV[a]; v.fill(0);
      const { rows, vals } = cols[dense[a]];
      for (let k = 0; k < rows.length; k++) v[rows[k]] += vals[k];
      bandSolve(v);
    }
    for (let a = 0; a < nd; a++) for (let bb = 0; bb < nd; bb++) {
      const { rows, vals } = cols[dense[a]];
      let s = 0;
      for (let k = 0; k < rows.length; k++) s += vals[k] * MinvV[bb][rows[k]];
      S[a * nd + bb] = s + (a === bb ? 1 / theta[dense[a]] : 0);
    }
  }
  function bandSolve(v) {
    for (let i = 0; i < nRows; i++) {
      let s = v[i];
      for (let k = 1; k <= Math.min(bw, i); k++) s -= band[i * W + k] * v[i - k];
      v[i] = s / band[i * W];
    }
    for (let i = nRows - 1; i >= 0; i--) {
      let s = v[i];
      for (let k = 1; k <= Math.min(bw, nRows - 1 - i); k++) s -= band[(i + k) * W + k] * v[i + k];
      v[i] = s / band[i * W];
    }
  }
  // (A Θ A^T) v, computed from A itself (dense columns included)
  const nv1 = new Float64Array(nCols), nv2 = new Float64Array(nRows), rhs0 = new Float64Array(nRows), corr = new Float64Array(nRows);
  function applyNormal(v, out) {
    ATy(v, nv1);
    for (let j = 0; j < nCols; j++) nv1[j] *= theta[j];
    return Ax(nv1, out);
  }
  function solveNormal(v) { // v <- (A Θ A^T)^{-1} v, with iterative refinement
    rhs0.set(v);
    solveFactored(v);
    for (let k = 0; k < 3; k++) {
      applyNormal(v, nv2);
      let rn = 0, bn = 0;
      for (let i = 0; i < nRows; i++) { corr[i] = rhs0[i] - nv2[i]; rn += corr[i] * corr[i]; bn += rhs0[i] * rhs0[i]; }
      if (rn <= 1e-28 * bn) break;
      solveFactored(corr);
      for (let i = 0; i < nRows; i++) v[i] += corr[i];
    }
  }
  function solveFactored(v) {
    bandSolve(v);
    if (!nd) return;
    const t = new Float64Array(nd);
    for (let a = 0; a < nd; a++) {
      const { rows, vals } = cols[dense[a]];
      let s = 0;
      for (let k = 0; k < rows.length; k++) s += vals[k] * v[rows[k]];
      t[a] = s;
    }
    const u = smallSolve(S, t, nd);
    for (let a = 0; a < nd; a++) { const m = MinvV[a]; for (let i = 0; i < nRows; i++) v[i] -= m[i] * u[a]; }
  }

  const rb = new Float64Array(nRows), rc = new Float64Array(nCols), ru = new Float64Array(nCols);
  const dx = new Float64Array(nCols), dy = new Float64Array(nRows), dz = new Float64Array(nCols), dw = new Float64Array(nCols), dr = new Float64Array(nCols);
  const q = new Float64Array(nCols);
  const nComp = nCols + hasUp.reduce((s, v) => s + v, 0);
  const bnorm = 1 + norm(b), cnorm = 1 + norm(c);
  let it = 0, relGap = Infinity, pres = Infinity, dres = Infinity;
  let best = null; // iterate with the smallest worst-case residual, in case round-off later spoils progress

  function direction(rxz, rrw) {
    // q = rc - rxz/x + (rrw - w ru)/r ; dy = (AΘA^T)^{-1} (rb + A Θ q) ; dx = Θ (A^T dy - q)
    for (let j = 0; j < nCols; j++) {
      let v = rc[j] - rxz[j] / x[j];
      if (hasUp[j]) v += (rrw[j] - w[j] * ru[j]) / r[j];
      q[j] = v; tmpC[j] = theta[j] * v;
    }
    Ax(tmpC, tmpR);
    for (let i = 0; i < nRows; i++) dy[i] = rb[i] + tmpR[i];
    solveNormal(dy);
    ATy(dy, dx);
    for (let j = 0; j < nCols; j++) {
      dx[j] = theta[j] * (dx[j] - q[j]);
      dz[j] = (rxz[j] - z[j] * dx[j]) / x[j];
      if (hasUp[j]) { dr[j] = ru[j] - dx[j]; dw[j] = (rrw[j] - w[j] * dr[j]) / r[j]; } else { dr[j] = 0; dw[j] = 0; }
    }
  }
  function maxStep() {
    let ap = 1, ad = 1;
    for (let j = 0; j < nCols; j++) {
      if (dx[j] < 0) ap = Math.min(ap, -x[j] / dx[j]);
      if (dz[j] < 0) ad = Math.min(ad, -z[j] / dz[j]);
      if (hasUp[j]) {
        if (dr[j] < 0) ap = Math.min(ap, -r[j] / dr[j]);
        if (dw[j] < 0) ad = Math.min(ad, -w[j] / dw[j]);
      }
    }
    return [ap, ad];
  }
  const rxz = new Float64Array(nCols), rrw = new Float64Array(nCols);

  for (it = 0; it < maxIter; it++) {
    Ax(x, tmpR);
    for (let i = 0; i < nRows; i++) rb[i] = b[i] - tmpR[i];
    ATy(y, tmpC);
    let comp = 0;
    for (let j = 0; j < nCols; j++) {
      rc[j] = c[j] - tmpC[j] - z[j] + (hasUp[j] ? w[j] : 0);
      ru[j] = hasUp[j] ? up[j] - x[j] - r[j] : 0;
      comp += x[j] * z[j] + (hasUp[j] ? r[j] * w[j] : 0);
    }
    const mu = comp / nComp;
    let pobj = 0, dobj = 0;
    for (let j = 0; j < nCols; j++) { pobj += c[j] * x[j]; if (hasUp[j]) dobj -= up[j] * w[j]; }
    for (let i = 0; i < nRows; i++) dobj += b[i] * y[i];
    pres = norm(rb) / bnorm + norm(ru) / bnorm;
    dres = norm(rc) / cnorm;
    relGap = Math.abs(pobj - dobj) / (1 + Math.abs(pobj));
    const merit = Math.max(pres, dres, relGap);
    if (!best || merit < best.merit) best = { merit, x: Float64Array.from(x), y: Float64Array.from(y), pres, dres, relGap, it };
    else if (merit > 1e3 * best.merit) break; // diverging: return the best point seen
    if (pres < tol && dres < tol && relGap < tol) break;

    for (let j = 0; j < nCols; j++) theta[j] = 1 / (z[j] / x[j] + (hasUp[j] ? w[j] / r[j] : 0));
    factor();
    // predictor (affine scaling)
    for (let j = 0; j < nCols; j++) { rxz[j] = -x[j] * z[j]; rrw[j] = hasUp[j] ? -r[j] * w[j] : 0; }
    direction(rxz, rrw);
    let [ap, ad] = maxStep();
    let compAff = 0;
    for (let j = 0; j < nCols; j++) {
      compAff += (x[j] + ap * dx[j]) * (z[j] + ad * dz[j]);
      if (hasUp[j]) compAff += (r[j] + ap * dr[j]) * (w[j] + ad * dw[j]);
    }
    const sigma = Math.min(1, (compAff / nComp / mu) ** 3);
    // corrector
    for (let j = 0; j < nCols; j++) {
      rxz[j] = sigma * mu - x[j] * z[j] - dx[j] * dz[j];
      rrw[j] = hasUp[j] ? sigma * mu - r[j] * w[j] - dr[j] * dw[j] : 0;
    }
    direction(rxz, rrw);
    [ap, ad] = maxStep();
    ap = Math.min(1, 0.995 * ap); ad = Math.min(1, 0.995 * ad);
    for (let j = 0; j < nCols; j++) {
      x[j] += ap * dx[j]; z[j] += ad * dz[j];
      if (hasUp[j]) { r[j] += ap * dr[j]; w[j] += ad * dw[j]; }
    }
    for (let i = 0; i < nRows; i++) y[i] += ad * dy[i];
  }
  const B = best;
  let obj = 0; for (let j = 0; j < nCols; j++) obj += c[j] * B.x[j];
  return { x: B.x, y: B.y, obj, iterations: it, ok: B.pres < 1e-6 && B.dres < 1e-6 && B.relGap < 1e-6, relGap: B.relGap, primalRes: B.pres, dualRes: B.dres };
}

function norm(v) { let s = 0; for (let i = 0; i < v.length; i++) s += v[i] * v[i]; return Math.sqrt(s); }

function smallSolve(A, b, n) { // Gaussian elimination with partial pivoting, n tiny
  const M = Array.from({ length: n }, (_, i) => [...Array.from({ length: n }, (_, j) => A[i * n + j]), b[i]]);
  for (let k = 0; k < n; k++) {
    let p = k;
    for (let i = k + 1; i < n; i++) if (Math.abs(M[i][k]) > Math.abs(M[p][k])) p = i;
    [M[k], M[p]] = [M[p], M[k]];
    for (let i = k + 1; i < n; i++) { const f = M[i][k] / M[k][k]; for (let j = k; j <= n; j++) M[i][j] -= f * M[k][j]; }
  }
  const out = new Float64Array(n);
  for (let i = n - 1; i >= 0; i--) { let s = M[i][n]; for (let j = i + 1; j < n; j++) s -= M[i][j] * out[j]; out[i] = s / M[i][i]; }
  return out;
}
