// Numerical helpers shared by the engine and its sibling tests: median by selection, robust sd, log-gamma family,
// the NB1 cost terms, and the seeded RNG / AR(1) helpers hinge-test, two-hinge, known-date and slope-breaks each used to copy.
// Split out of engine.mjs (quality round 89, 2026-11-19: engine.mjs had grown to 3,004 lines); engine.mjs re-exports
// every name here, so existing imports keep working.


export function median(a) {
  // The same value a numeric sort would put in the middle, found by selection in O(n) rather than an O(n log n) sort:
  // median runs on every robustSd, ar1Rho and trend pass (docs/history/ci-perf-2026-11-11-median-select-pelt-one-pass.md).
  const n = a.length;
  const s = Float64Array.from(a);
  const m = n >> 1;
  for (let i = 0; i < n; i++) if (s[i] !== s[i]) { s.sort(); return n % 2 ? s[m] : (s[m - 1] + s[m]) / 2; } // NaN: keep the sort's order
  select(s, m);
  let hi = s[m];
  let lo = 0;
  if (n % 2 === 0) { lo = s[0]; for (let i = 1; i < m; i++) if (s[i] > lo) lo = s[i]; }
  if (hi === 0 || (n % 2 === 0 && lo === 0)) {
    // the sort orders -0 before +0, and selection does not: sorted position k holds -0 exactly when k < (count of x < 0 or -0)
    let neg = 0;
    for (let i = 0; i < n; i++) if (a[i] < 0 || Object.is(a[i], -0)) neg++;
    if (hi === 0) hi = m < neg ? -0 : 0;
    if (n % 2 === 0 && lo === 0) lo = m - 1 < neg ? -0 : 0;
  }
  return n % 2 ? hi : (lo + hi) / 2;
}

/** Partial sort in place (no NaN): afterwards s[k] holds the k-th smallest value, everything before it is <= s[k]. */
export function select(s, k) {
  let l = 0, r = s.length - 1;
  while (r > l) {
    // median-of-three pivot, Hoare partition
    const mid = (l + r) >> 1;
    let a = s[l], b = s[mid], c = s[r];
    const p = a < b ? (b < c ? b : a < c ? c : a) : (a < c ? a : b < c ? c : b);
    let i = l, j = r;
    while (i <= j) {
      while (s[i] < p) i++;
      while (s[j] > p) j--;
      if (i <= j) { const t = s[i]; s[i] = s[j]; s[j] = t; i++; j--; }
    }
    if (k <= j) r = j;
    else if (k >= i) l = i;
    else return;
  }
}

/** Robust noise sd from successive differences: MAD(diff) / (0.6745 * sqrt 2). Immune to a few level shifts. */
export function robustSd(x) {
  if (x.length < 3) return 1;
  const d = [];
  for (let i = 1; i < x.length; i++) d.push(x[i] - x[i - 1]);
  const md = median(d);
  const mad = median(d.map((v) => Math.abs(v - md)));
  const sd = mad / (0.6744897501960817 * Math.SQRT2);
  if (sd > 0) return sd;
  const mu = x.reduce((s, v) => s + v, 0) / x.length;
  const v = x.reduce((s, y) => s + (y - mu) ** 2, 0) / x.length;
  return Math.sqrt(v) || 1;
}

// Lanczos coefficients (g = 7, n = 9), built once: lgamma runs millions of times inside bocpd, and a literal
// array in its body was rebuilt on every call (docs/history/ci-perf-2026-11-14-changepoint-bocpd-hoists.md).
const LANCZOS_G = 7;
const LANCZOS_C = new Float64Array([0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
  -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7]);
const HALF_LOG_2PI = 0.5 * Math.log(2 * Math.PI);

export function lgamma(z) {
  // Lanczos approximation (g = 7, n = 9), accurate to ~1e-15 for z > 0.
  const g = LANCZOS_G, c = LANCZOS_C;
  if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - lgamma(1 - z);
  z -= 1;
  let a = c[0];
  const t = z + g + 0.5;
  for (let i = 1; i < g + 2; i++) a += c[i] / (z + i);
  return HALF_LOG_2PI + (z + 0.5) * Math.log(t) - t + Math.log(a);
}

// Digamma and trigamma for z > 0: recurrence up to z >= 6, then the asymptotic series (error below 1e-10 there).
export function digamma(z) {
  let r = 0;
  while (z < 6) { r -= 1 / z; z += 1; }
  const f = 1 / (z * z);
  return r + Math.log(z) - 0.5 / z - f * (1 / 12 - f * (1 / 120 - f * (1 / 252 - f * (1 / 240 - f / 132))));
}
export function trigamma(z) {
  let r = 0;
  while (z < 6) { r += 1 / (z * z); z += 1; }
  const f = 1 / (z * z);
  return r + 1 / z + f / 2 + (f / z) * (1 / 6 - f * (1 / 30 - f * (1 / 42 - f / 30)));
}

// For a count x > 0 and c > 0: NBP = [lgamma(x + c) - lgamma(c), digamma(x + c) - digamma(c), trigamma(x + c) - trigamma(c)],
// the three terms of the NB1 cost, from one shift-and-series pass per argument (two logs each) instead of separate calls.
export const NBP = new Float64Array(3);
function lgdt(z, o) {
  let lp = 1, sd = 0, st = 0;
  while (z < 8) { lp *= z; sd += 1 / z; st += 1 / (z * z); z += 1; }
  const iz = 1 / z, f = iz * iz, lz = Math.log(z);
  // Stirling for lgamma, the asymptotic series for digamma and trigamma, at z >= 8 (errors below 1e-11)
  o[0] = (z - 0.5) * lz - z + HALF_LOG_2PI + iz * (1 / 12 - f * (1 / 360 - f * (1 / 1260 - f / 1680))) - (lp !== 1 ? Math.log(lp) : 0);
  o[1] = lz - 0.5 * iz - f * (1 / 12 - f * (1 / 120 - f * (1 / 252 - f / 240))) - sd;
  o[2] = iz + f / 2 + f * iz * (1 / 6 - f * (1 / 30 - f * (1 / 42 - f / 30))) + st;
}
const NBA = new Float64Array(3), NBB = new Float64Array(3);
export function nbPair(x, c) {
  lgdt(x + c, NBA); lgdt(c, NBB);
  NBP[0] = NBA[0] - NBB[0]; NBP[1] = NBA[1] - NBB[1]; NBP[2] = NBA[2] - NBB[2];
}
export function nbPairCheck(x, c) { nbPair(x, c); return [...NBP]; }

// ---------------------------------------------------------------- seeded RNG and AR(1) helpers

/** Mulberry32: a small seeded uniform generator on [0, 1). */
export function mulberry(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
/** One standard normal draw (Box-Muller) from a uniform generator r. */
export function gauss(r) { return Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r()); }

/** Lag-1 autocorrelation of residuals about zero (not re-centred). */
export function lag1(e) {
  let num = 0, den = 0;
  for (let i = 0; i < e.length; i++) { den += e[i] * e[i]; if (i) num += e[i] * e[i - 1]; }
  return den > 0 ? num / den : 0;
}
/** The usual small-sample bias correction of a lag-1 estimate. */
export const corrected = (rho, n) => rho + (1 + 3 * rho) / n;

/** Prais-Winsten transform of a column. */
export function pw(v, rho) {
  const n = v.length, out = new Float64Array(n), f = Math.sqrt(Math.max(0, 1 - rho * rho));
  out[0] = f * v[0];
  for (let t = 1; t < n; t++) out[t] = v[t] - rho * v[t - 1];
  return out;
}

/** Residual of v on the two columns c1, c2 (normal equations), that residual's sum of squares, and the coefficients. */
export function resid2(v, c1, c2) {
  let a11 = 0, a12 = 0, a22 = 0, b1 = 0, b2 = 0;
  for (let t = 0; t < v.length; t++) { a11 += c1[t] * c1[t]; a12 += c1[t] * c2[t]; a22 += c2[t] * c2[t]; b1 += c1[t] * v[t]; b2 += c2[t] * v[t]; }
  const det = a11 * a22 - a12 * a12, g1 = (a22 * b1 - a12 * b2) / det, g2 = (a11 * b2 - a12 * b1) / det;
  const e = new Float64Array(v.length); let ss = 0;
  for (let t = 0; t < v.length; t++) { e[t] = v[t] - g1 * c1[t] - g2 * c2[t]; ss += e[t] * e[t]; }
  return { e, ss, g: [g1, g2] };
}

// ---------------------------------------------------------------- least squares (moved from known-date.mjs)

// Inverse of a symmetric positive definite matrix (Gauss-Jordan with partial pivoting); null when singular.
export function invert(A) {
  const p = A.length, M = A.map((row, i) => [...row, ...Array.from({ length: p }, (_, j) => (i === j ? 1 : 0))]);
  for (let i = 0; i < p; i++) {
    let m = i; for (let q = i + 1; q < p; q++) if (Math.abs(M[q][i]) > Math.abs(M[m][i])) m = q;
    if (!(Math.abs(M[m][i]) > 1e-12)) return null;
    [M[i], M[m]] = [M[m], M[i]];
    const piv = M[i][i]; for (let c = 0; c < 2 * p; c++) M[i][c] /= piv;
    for (let q = 0; q < p; q++) if (q !== i) { const f = M[q][i]; if (f) for (let c = 0; c < 2 * p; c++) M[q][c] -= f * M[i][c]; }
  }
  return M.map((row) => row.slice(p));
}

// Gauss-Jordan elimination with partial pivoting on an augmented p x (p + 1) matrix, in place (rows may be typed arrays).
// Afterwards A is diagonal on its first p columns, so the solution is A[i][p] / A[i][i]. With `tol`, returns false as soon
// as a pivot is not above it (singular); without, it never checks. Shared by engine.mjs's two-knot search and lineRss.
export function gaussJordan(A, p, tol = null) {
  for (let i = 0; i < p; i++) {
    let m = i;
    for (let r = i + 1; r < p; r++) if (Math.abs(A[r][i]) > Math.abs(A[m][i])) m = r;
    if (tol !== null && !(Math.abs(A[m][i]) > tol)) return false;
    if (m !== i) { const tmp = A[i]; A[i] = A[m]; A[m] = tmp; }
    for (let r = 0; r < p; r++) if (r !== i) { const q = A[r][i] / A[i][i]; for (let c = i; c <= p; c++) A[r][c] -= q * A[i][c]; }
  }
  return true;
}

/** Solve H z = b for a small symmetric positive-definite H by Gaussian elimination; null when it is (near) singular. */
export function solveSym(H, b) {
  const m = b.length, A = H.map((row, i) => [...row, b[i]]);
  const scale = Math.max(...H.map((row, i) => row[i]));
  for (let c = 0; c < m; c++) {
    let p = c;
    for (let r = c + 1; r < m; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    if (!(Math.abs(A[p][c]) > 1e-12 * scale)) return null;
    [A[c], A[p]] = [A[p], A[c]];
    for (let r = c + 1; r < m; r++) { const f = A[r][c] / A[c][c]; for (let k = c; k <= m; k++) A[r][k] -= f * A[c][k]; }
  }
  const z = new Array(m).fill(0);
  for (let r = m - 1; r >= 0; r--) { let a = A[r][m]; for (let k = r + 1; k < m; k++) a -= A[r][k] * z[k]; z[r] = a / A[r][r]; }
  return z;
}

// Least squares of y on the columns of X (arrays of length n). Returns coefficients, (X'X)^-1, residuals, rss.
export function ols(y, X) {
  const p = X.length, n = y.length, A = Array.from({ length: p }, () => new Array(p).fill(0)), b = new Array(p).fill(0);
  for (let i = 0; i < p; i++) {
    for (let j = i; j < p; j++) { let s = 0; for (let t = 0; t < n; t++) s += X[i][t] * X[j][t]; A[i][j] = A[j][i] = s; }
    let s = 0; for (let t = 0; t < n; t++) s += X[i][t] * y[t]; b[i] = s;
  }
  const inv = invert(A);
  if (!inv) return null;
  const beta = inv.map((row) => row.reduce((s, v, j) => s + v * b[j], 0));
  const e = new Float64Array(n); let rss = 0;
  for (let t = 0; t < n; t++) { let f = 0; for (let i = 0; i < p; i++) f += beta[i] * X[i][t]; e[t] = y[t] - f; rss += e[t] * e[t]; }
  return { beta, inv, e, rss };
}
