// Wasserstein distance (earth mover's distance) between two samples: how far,
// in the data's own units, must one distribution be moved to become the other,
// and where does the mass go? One column at a time the answer is exact, from
// the quantile functions. Across several columns at once it is optimal
// transport, solved by Sinkhorn's algorithm on an entropy-regularised problem
// (Cuturi 2013) in the log domain, and then bracketed: a rounded feasible plan
// (Altschuler, Weed & Rigollet 2017) gives an upper bound on the exact cost and
// the c-transform of Sinkhorn's dual potentials gives a lower bound, so the
// exact unregularised distance is certified to lie between the two. Whether
// the two samples differ by more than chance is a permutation test, on W1 for
// one column and on the energy distance (Szekely & Rizzo 2013) for several.
// Pure functions, no DOM, no network; randomness only from a seeded
// generator. Implemented from the papers' mathematics; no third-party code
// was ported. POT (Python Optimal Transport) and SciPy were used only to
// produce eval/reference.json, which the tests compare against.

export const PAPERS = [
  {
    authors: "Marco Cuturi",
    title: "Sinkhorn Distances: Lightspeed Computation of Optimal Transport",
    venue: "Advances in Neural Information Processing Systems 26 (NIPS 2013), 2292-2300",
    year: 2013,
    url: "https://arxiv.org/abs/1306.0895",
    implemented:
      "Entropy-regularised optimal transport between two discrete distributions a and b with ground cost C: the plan P = diag(u) K diag(v), K = exp(-C/eps), found by alternately rescaling rows and columns to match a and b (Sinkhorn-Knopp), and the Sinkhorn cost <P, C>.",
    deviations:
      "The iterations run in the log domain on dual potentials (f, g), with P_ij = a_i b_j exp((f_i + g_j - C_ij)/eps), so a small eps cannot underflow; eps is lowered in stages from the largest cost to the target (eps-scaling) with the potentials carried over. The paper's parameter lambda is 1/eps. The cost is not reported alone: the tool reports a certified bracket on the exact (eps = 0) cost, from the two papers below.",
  },
  {
    authors: "Jason Altschuler, Jonathan Weed, Philippe Rigollet",
    title: "Near-linear time approximation algorithms for optimal transport via Sinkhorn iteration",
    venue: "Advances in Neural Information Processing Systems 30 (NIPS 2017), 1964-1974",
    year: 2017,
    url: "https://arxiv.org/abs/1705.09634",
    implemented:
      "Algorithm 2 (ROUND): scale rows down to at most a, then columns down to at most b, then add the outer product of the remaining row and column deficits divided by its total, giving a plan with exactly the marginals a and b. Its cost is an upper bound on the exact optimal transport cost.",
    deviations: "None in ROUND. The paper's greedy (Greenkhorn) variant and its choice of eps from a target accuracy are not used; eps is the user's blur.",
  },
  {
    authors: "Gabriel Peyre, Marco Cuturi",
    title: "Computational Optimal Transport",
    venue: "Foundations and Trends in Machine Learning 11(5-6), 355-607",
    year: 2019,
    url: "https://doi.org/10.1561/2200000073",
    doi: "10.1561/2200000073",
    implemented:
      "The closed form in one dimension (W_p^p is the integral over t in [0,1] of |F^-1(t) - G^-1(t)|^p, the quantile functions, and W1 is also the integral of |F(x) - G(x)| dx); the log-domain (stabilised) Sinkhorn updates; and the c-transform: for any g, f_i = min_j (C_ij - g_j) and then g_j = min_i (C_ij - f_i) is dual feasible, so sum a_i f_i + sum b_j g_j is a lower bound on the exact cost (weak duality).",
    deviations: "None.",
  },
  {
    authors: "Gabor J. Szekely, Maria L. Rizzo",
    title: "Energy statistics: A class of statistics based on distances",
    venue: "Journal of Statistical Planning and Inference 143(8), 1249-1272",
    year: 2013,
    url: "https://doi.org/10.1016/j.jspi.2013.03.018",
    doi: "10.1016/j.jspi.2013.03.018",
    implemented:
      "The two-sample energy distance E = 2 mean|X - Y| - mean|X - X'| - mean|Y - Y'| (Euclidean norms, V-statistic form, all pairs including i = j) and its permutation test of equal distributions: the group labels are shuffled R times and p = (1 + #{E_perm >= E}) / (1 + R).",
    deviations: "The same columns and scaling as the transport problem are used. With one column the tool tests W1 by permutation instead.",
  },
];

export const DEFAULTS = {
  cost: "euclidean", // "euclidean" (W1, earth mover's distance) or "sqeuclidean" (W2, reported as its square root)
  scale: "auto", // "auto" (divide by the pooled SD when there are several columns), "none", "sd"
  blur: 0.01, // eps as a share of the mean pairwise cost
  permutations: 999,
  energyPermutations: 199,
  maxPoints: 1200, // per group, for the several-column problems; one-column results use every row
  seed: 42,
  tol: 1e-4, // L1 marginal error at which Sinkhorn stops; rounding then makes the plan exactly feasible
  maxIter: 5000,
};

export const QUANTILES = [0.05, 0.1, 0.25, 0.5, 0.75, 0.9, 0.95];

/** mulberry32: a small, fast, seedable 32-bit generator. Returns floats in [0, 1). */
export function rng(seed) {
  let a = (Number(seed) >>> 0) || 0x9e3779b9;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(arr, rand) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
  }
  return arr;
}

// ------------------------------------------------------------ one dimension

/** A weighted empirical distribution as sorted values and cumulative weights summing to 1. */
function ecdf(x, w) {
  const n = x.length;
  const idx = Array.from({ length: n }, (_, i) => i).sort((i, j) => x[i] - x[j]);
  const v = new Float64Array(n), c = new Float64Array(n);
  let tot = 0;
  for (let i = 0; i < n; i++) tot += w ? w[i] : 1;
  let s = 0;
  for (let k = 0; k < n; k++) {
    v[k] = x[idx[k]];
    s += (w ? w[idx[k]] : 1) / tot;
    c[k] = s;
  }
  c[n - 1] = 1;
  return { v, c };
}

function checkSample(x, w, name) {
  if (!x || !x.length) throw new Error(`${name} is empty.`);
  for (const t of x) if (!Number.isFinite(t)) throw new Error(`${name} has a value that is not a finite number.`);
  if (w) {
    if (w.length !== x.length) throw new Error(`${name}'s weights do not match its length.`);
    let s = 0;
    for (const t of w) { if (!(t >= 0) || !Number.isFinite(t)) throw new Error(`${name} has a negative or non-finite weight.`); s += t; }
    if (!(s > 0)) throw new Error(`${name}'s weights sum to zero.`);
  }
}

/**
 * Walk the two quantile functions together. Between consecutive breakpoints
 * of the cumulative weights both are constant; visit(du, qa, qb) is called
 * once per piece.
 */
function walkQuantiles(A, B, visit) {
  let i = 0, j = 0, u = 0;
  while (i < A.v.length && j < B.v.length) {
    const next = Math.min(A.c[i], B.c[j]);
    const du = next - u;
    if (du > 0) visit(du, A.v[i], B.v[j]);
    u = next;
    if (A.c[i] <= next + 1e-15) i++;
    if (B.c[j] <= next + 1e-15) j++;
  }
}

/** Exact p-Wasserstein distance between two weighted samples on the line (p >= 1). */
export function wasserstein1d(x, y, opts = {}) {
  const p = opts.p ?? 1;
  checkSample(x, opts.wx, "The first sample");
  checkSample(y, opts.wy, "The second sample");
  const A = ecdf(x, opts.wx), B = ecdf(y, opts.wy);
  let s = 0;
  walkQuantiles(A, B, (du, qa, qb) => { s += du * Math.abs(qa - qb) ** p; });
  return s ** (1 / p);
}

/** Lower quantile F^-1(t) = smallest value whose cumulative weight reaches t. */
export function quantile(x, t, w) {
  const A = ecdf(x, w);
  for (let k = 0; k < A.v.length; k++) if (A.c[k] >= t - 1e-12) return A.v[k];
  return A.v[A.v.length - 1];
}

function moments(x) {
  let m = 0;
  for (const t of x) m += t;
  m /= x.length;
  let v = 0;
  for (const t of x) v += (t - m) ** 2;
  return { mean: m, sd: Math.sqrt(v / x.length) };
}

/**
 * Everything about one column: W1, W2, W2 squared split into location,
 * spread and shape, quantile shifts, and the direction of the shift.
 * W2^2 = (mean_b - mean_a)^2 + (sd_a - sd_b)^2 + 2 sd_a sd_b (1 - rho),
 * where rho is the correlation of the two quantile functions (population
 * moments). The identity is exact for empirical distributions.
 */
export function compareColumn(x, y) {
  const A = ecdf(x), B = ecdf(y);
  const ma = moments(x), mb = moments(y);
  let w1 = 0, w2sq = 0, cross = 0, up = 0, down = 0;
  walkQuantiles(A, B, (du, qa, qb) => {
    w1 += du * Math.abs(qa - qb);
    w2sq += du * (qa - qb) ** 2;
    cross += du * (qa - ma.mean) * (qb - mb.mean);
    if (qb > qa) up += du * (qb - qa);
    else if (qa > qb) down += du * (qa - qb);
  });
  const rho = ma.sd > 0 && mb.sd > 0 ? cross / (ma.sd * mb.sd) : 1;
  const location = (mb.mean - ma.mean) ** 2;
  const spread = (ma.sd - mb.sd) ** 2;
  const shape = Math.max(0, w2sq - location - spread);
  const q = (D, t) => { for (let k = 0; k < D.v.length; k++) if (D.c[k] >= t - 1e-12) return D.v[k]; return D.v[D.v.length - 1]; };
  return {
    n: [x.length, y.length],
    mean: [ma.mean, mb.mean],
    sd: [ma.sd, mb.sd],
    meanShift: mb.mean - ma.mean,
    w1,
    w2: Math.sqrt(w2sq),
    // Mass moved up and down, as parts of W1: up - down = mean shift, up + down = W1.
    movedUp: up,
    movedDown: down,
    direction: down <= 1e-12 * (up + down) && up > 0 ? "up" : up <= 1e-12 * (up + down) && down > 0 ? "down" : up + down === 0 ? "none" : "mixed",
    w2Parts: { location, spread, shape, rho },
    quantiles: QUANTILES.map((t) => ({ p: t, a: q(A, t), b: q(B, t), shift: q(B, t) - q(A, t) })),
  };
}

/**
 * Permutation test of equal distributions on one column, with W1 as the
 * statistic. For equal weights W1 is the integral of |F_A - F_B|, so each
 * shuffle is one O(N) sweep over the pooled sorted values.
 */
export function permutationW1(x, y, { permutations = 999, seed = 42 } = {}) {
  const N = x.length + y.length, na = x.length, nb = y.length;
  const z = new Float64Array(N);
  const order = Array.from({ length: N }, (_, i) => i);
  const pooled = [...x, ...y];
  order.sort((i, j) => pooled[i] - pooled[j]);
  for (let k = 0; k < N; k++) z[k] = pooled[order[k]];
  const lab = new Uint8Array(N); // 1 = group A, in sorted order
  for (let k = 0; k < N; k++) lab[k] = order[k] < na ? 1 : 0;
  const stat = (L) => {
    let ca = 0, cb = 0, s = 0;
    for (let k = 0; k < N - 1; k++) {
      if (L[k]) ca++; else cb++;
      const gap = z[k + 1] - z[k];
      if (gap) s += Math.abs(ca / na - cb / nb) * gap;
    }
    return s;
  };
  const observed = stat(lab);
  const rand = rng(seed);
  const L = Uint8Array.from(lab);
  let ge = 0;
  for (let r = 0; r < permutations; r++) {
    shuffle(L, rand);
    if (stat(L) >= observed - 1e-12 * Math.abs(observed)) ge++;
  }
  return { statistic: observed, pValue: (1 + ge) / (1 + permutations), permutations };
}

// ------------------------------------------------------ several dimensions

/** Dense cost matrix between point sets X (n x d) and Y (m x d), row-major. */
export function costMatrix(X, Y, cost = "euclidean") {
  const n = X.length, m = Y.length, d = X[0].length;
  const C = new Float64Array(n * m);
  for (let i = 0; i < n; i++) {
    const xi = X[i];
    for (let j = 0; j < m; j++) {
      const yj = Y[j];
      let s = 0;
      for (let k = 0; k < d; k++) { const t = xi[k] - yj[k]; s += t * t; }
      C[i * m + j] = cost === "sqeuclidean" ? s : Math.sqrt(s);
    }
  }
  return C;
}

/**
 * Entropic optimal transport by Sinkhorn's algorithm, stabilised as in
 * Peyre & Cuturi (2019): the dual potentials f, g are kept in
 * the log domain and the kernel is rebuilt around them,
 * Kt_ij = a_i b_j exp((f_i + g_j - C_ij)/e), so the plan is
 * P = diag(u) Kt diag(v) with u, v near 1; when u or v drift far from 1
 * they are absorbed into f, g and Kt is rebuilt. Between rebuilds an
 * iteration is two matrix-vector products, with no exponentials. eps is
 * lowered in stages from the largest cost (eps-scaling). a (n) and b (m) sum
 * to 1, C is n*m row-major. Returns f, g, the plan, <P, C>, the iterations
 * and the final L1 error of the column marginal (rows are exact after each
 * u update).
 */
export function sinkhorn(a, b, C, eps, opts = {}) {
  const n = a.length, m = b.length;
  const tol = opts.tol ?? DEFAULTS.tol, maxIter = opts.maxIter ?? DEFAULTS.maxIter;
  if (!(eps > 0)) throw new Error("eps must be positive.");
  let cmax = 0;
  for (const c of C) if (c > cmax) cmax = c;
  const f = new Float64Array(n), g = new Float64Array(m);
  const u = new Float64Array(n), v = new Float64Array(m), Kv = new Float64Array(n), Ku = new Float64Array(m);
  const K = new Float64Array(n * m);
  const build = (e) => {
    for (let i = 0; i < n; i++) {
      const row = i * m, fi = f[i], ai = a[i];
      for (let j = 0; j < m; j++) K[row + j] = ai * b[j] * Math.exp((fi + g[j] - C[row + j]) / e);
    }
    u.fill(1); v.fill(1);
  };
  const absorb = (e) => {
    for (let i = 0; i < n; i++) f[i] += e * Math.log(u[i]);
    for (let j = 0; j < m; j++) g[j] += e * Math.log(v[j]);
  };
  // Log-domain half-steps: used to recentre the potentials when a kernel row
  // or column underflows to zero, so the scaling step cannot divide by zero.
  const tmp = new Float64Array(Math.max(n, m));
  const logG = (e) => {
    for (let j = 0; j < m; j++) {
      let mx = -Infinity;
      for (let i = 0; i < n; i++) { const t = Math.log(a[i]) + (f[i] - C[i * m + j]) / e; tmp[i] = t; if (t > mx) mx = t; }
      let s = 0;
      for (let i = 0; i < n; i++) s += Math.exp(tmp[i] - mx);
      g[j] = -e * (mx + Math.log(s));
    }
  };
  const logF = (e) => {
    for (let i = 0; i < n; i++) {
      let mx = -Infinity;
      for (let j = 0; j < m; j++) { const t = Math.log(b[j]) + (g[j] - C[i * m + j]) / e; tmp[j] = t; if (t > mx) mx = t; }
      let s = 0;
      for (let j = 0; j < m; j++) s += Math.exp(tmp[j] - mx);
      f[i] = -e * (mx + Math.log(s));
    }
  };
  let iterations = 0, err = Infinity;
  // One scaling iteration; false when a kernel row or column has underflowed.
  const step = () => {
    Ku.fill(0);
    for (let i = 0; i < n; i++) { const row = i * m, ui = u[i]; for (let j = 0; j < m; j++) Ku[j] += K[row + j] * ui; }
    for (let j = 0; j < m; j++) { if (!(Ku[j] > 0)) return false; v[j] = b[j] / Ku[j]; }
    for (let i = 0; i < n; i++) { const row = i * m; let s = 0; for (let j = 0; j < m; j++) s += K[row + j] * v[j]; Kv[i] = s; }
    for (let i = 0; i < n; i++) { if (!(Kv[i] > 0)) return false; u[i] = a[i] / Kv[i]; }
    iterations++;
    return true;
  };
  const columnError = () => {
    Ku.fill(0);
    for (let i = 0; i < n; i++) { const row = i * m, ui = u[i]; for (let j = 0; j < m; j++) Ku[j] += K[row + j] * ui; }
    let e2 = 0;
    for (let j = 0; j < m; j++) e2 += Math.abs(Ku[j] * v[j] - b[j]);
    return e2;
  };
  const far = () => {
    for (let i = 0; i < n; i++) if (!(u[i] < 1e30 && u[i] > 1e-30)) return true;
    for (let j = 0; j < m; j++) if (!(v[j] < 1e30 && v[j] > 1e-30)) return true;
    return false;
  };
  const run = (e, budget, stopAt) => {
    logG(e); logF(e);
    build(e);
    let used = 0;
    while (used < budget && iterations < maxIter) {
      if (!step()) { absorb(e); logG(e); logF(e); build(e); if (!step()) throw new Error("Sinkhorn underflowed; use a larger blur."); }
      used++;
      if (far()) { absorb(e); build(e); }
      if (used % 10 === 0 || used >= budget) {
        err = columnError();
        if (err < stopAt) break;
      }
    }
    absorb(e);
    u.fill(1); v.fill(1);
  };
  if (opts.scaling !== false) for (let e = cmax; e > eps * 2; e /= 2) run(e, 50, 1e-3);
  run(eps, maxIter, tol);
  build(eps);
  err = columnError();
  const P = K; // u = v = 1 after the final build
  let cost = 0;
  for (let k = 0; k < P.length; k++) cost += P[k] * C[k];
  return { f, g, P, cost, iterations, marginalError: err, converged: err < tol, eps };
}

/** Altschuler, Weed & Rigollet (2017) Algorithm 2: the nearest-feasible rounding of a plan. */
export function roundPlan(P, a, b) {
  const n = a.length, m = b.length;
  const X = Float64Array.from(P);
  for (let i = 0; i < n; i++) {
    let r = 0;
    for (let j = 0; j < m; j++) r += X[i * m + j];
    const s = r > a[i] ? a[i] / r : 1;
    if (s !== 1) for (let j = 0; j < m; j++) X[i * m + j] *= s;
  }
  const c = new Float64Array(m);
  for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) c[j] += X[i * m + j];
  for (let j = 0; j < m; j++) {
    const s = c[j] > b[j] ? b[j] / c[j] : 1;
    if (s !== 1) for (let i = 0; i < n; i++) X[i * m + j] *= s;
  }
  const er = new Float64Array(n), ec = new Float64Array(m);
  for (let i = 0; i < n; i++) { let r = 0; for (let j = 0; j < m; j++) r += X[i * m + j]; er[i] = a[i] - r; }
  for (let j = 0; j < m; j++) { let s = 0; for (let i = 0; i < n; i++) s += X[i * m + j]; ec[j] = b[j] - s; }
  let tot = 0;
  for (const t of er) tot += t;
  if (tot > 0) for (let i = 0; i < n; i++) if (er[i]) for (let j = 0; j < m; j++) X[i * m + j] += (er[i] * ec[j]) / tot;
  return X;
}

/** Weak-duality lower bound from potential g: two c-transforms make (f, g) feasible. */
export function dualLowerBound(g, a, b, C) {
  const n = a.length, m = b.length;
  const f = new Float64Array(n), h = new Float64Array(m).fill(Infinity);
  for (let i = 0; i < n; i++) {
    let mn = Infinity;
    for (let j = 0; j < m; j++) { const t = C[i * m + j] - g[j]; if (t < mn) mn = t; }
    f[i] = mn;
  }
  for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) { const t = C[i * m + j] - f[i]; if (t < h[j]) h[j] = t; }
  let s = 0;
  for (let i = 0; i < n; i++) s += a[i] * f[i];
  for (let j = 0; j < m; j++) s += b[j] * h[j];
  return s;
}

/**
 * Optimal transport between point clouds X and Y with uniform weights:
 * Sinkhorn at eps = blur x mean cost, then the certified bracket
 * [lower, upper] on the exact cost. For "sqeuclidean" the distance is the
 * square root (W2); for "euclidean" it is the cost itself (W1).
 */
export function transport(X, Y, opts = {}) {
  const cost = opts.cost ?? DEFAULTS.cost;
  const n = X.length, m = Y.length;
  const a = new Float64Array(n).fill(1 / n), b = new Float64Array(m).fill(1 / m);
  const C = costMatrix(X, Y, cost);
  let mean = 0;
  for (const c of C) mean += c;
  mean /= C.length;
  const eps = opts.eps ?? Math.max((opts.blur ?? DEFAULTS.blur) * mean, 1e-12);
  const s = mean > 0 ? sinkhorn(a, b, C, eps, opts) : { f: new Float64Array(n), g: new Float64Array(m), P: Float64Array.from({ length: n * m }, () => 1 / (n * m)), cost: 0, iterations: 0, marginalError: 0, converged: true, eps };
  const R = roundPlan(s.P, a, b);
  let upper = 0;
  for (let k = 0; k < C.length; k++) upper += R[k] * C[k];
  const lower = Math.min(dualLowerBound(s.g, a, b, C), upper);
  const root = cost === "sqeuclidean" ? (v) => Math.sqrt(Math.max(0, v)) : (v) => v;
  return {
    cost,
    eps,
    meanCost: mean,
    sinkhornCost: s.cost,
    lowerCost: lower,
    upperCost: upper,
    distance: root(upper),
    distanceLower: root(lower),
    distanceUpper: root(upper),
    iterations: s.iterations,
    marginalError: s.marginalError,
    converged: s.converged,
    plan: R,
    f: s.f,
    g: s.g,
  };
}

/** Energy distance and its permutation test, from the pooled points. */
export function energyTest(X, Y, { permutations = 199, seed = 42 } = {}) {
  const na = X.length, nb = Y.length, N = na + nb, d = X[0].length;
  const Z = [...X, ...Y];
  const D = new Float64Array((N * (N - 1)) / 2);
  let k = 0;
  for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) {
    let s = 0;
    for (let t = 0; t < d; t++) { const u = Z[i][t] - Z[j][t]; s += u * u; }
    D[k++] = Math.sqrt(s);
  }
  let total = 0;
  for (const v of D) total += v;
  const stat = (lab) => {
    let sa = 0, sb = 0, k2 = 0;
    for (let i = 0; i < N; i++) {
      const li = lab[i];
      for (let j = i + 1; j < N; j++, k2++) {
        const lj = lab[j];
        if (li & lj) sa += D[k2];
        else if (!(li | lj)) sb += D[k2];
      }
    }
    const sab = total - sa - sb;
    return (2 * sab) / (na * nb) - (2 * sa) / (na * na) - (2 * sb) / (nb * nb);
  };
  const lab = new Uint8Array(N);
  for (let i = 0; i < na; i++) lab[i] = 1;
  const observed = stat(lab);
  const rand = rng(seed);
  let ge = 0;
  for (let r = 0; r < permutations; r++) {
    shuffle(lab, rand);
    if (stat(lab) >= observed - 1e-12 * Math.abs(observed)) ge++;
  }
  return { statistic: observed, pValue: (1 + ge) / (1 + permutations), permutations };
}

// --------------------------------------------------------------------- CSV

const isMissing = (s) => /^\s*(|na|n\/a|nan|null|none|\?|-)\s*$/i.test(String(s ?? ""));
const numText = (s) => String(s).trim().replace(/^\((.*)\)$/, "-$1").replace(/[$€£,%\s]/g, "");
const isNum = (s) => {
  const t = numText(s);
  return t !== "" && Number.isFinite(Number(t));
};

function splitLine(line, delim) {
  const out = [];
  let cur = "", quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delim) { out.push(cur.trim()); cur = ""; }
    else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

/** Parse a delimited table with a header row (comma, tab or semicolon). */
export function parseCsv(text) {
  const raw = String(text ?? "").replace(/^﻿/, "");
  const lines = raw.split(/\r\n|\n|\r/).filter((l) => l.trim() !== "");
  if (!lines.length) return { error: "The data is empty. Paste a CSV with a header row, a group column and at least one numeric column." };
  const delim = ["\t", ";", ","].map((dl) => [dl, splitLine(lines[0], dl).length]).sort((a, b) => b[1] - a[1])[0][0];
  const cells = lines.map((l) => splitLine(l, delim));
  const columns = cells[0].map((c, i) => c || `c${i + 1}`);
  const seen = new Set();
  for (const c of columns) {
    if (seen.has(c)) return { error: `Column name "${c}" appears twice in the header. Rename one of them.` };
    seen.add(c);
  }
  const rows = [];
  for (let i = 1; i < cells.length; i++) {
    if (cells[i].length !== columns.length) return { error: `Line ${i + 1} has ${cells[i].length} fields but the header has ${columns.length}. Check the delimiter and quoting.` };
    rows.push(cells[i]);
  }
  if (!rows.length) return { error: "The CSV has a header but no data rows." };
  return { columns, rows, delimiter: delim };
}

/** Describe each column: numeric or not, and its distinct values (a group column has few). */
export function profileColumns(parsed) {
  return parsed.columns.map((name, j) => {
    const cells = parsed.rows.map((r) => r[j]);
    const present = cells.filter((c) => !isMissing(c));
    const numeric = present.length > 0 && present.every(isNum);
    const values = [...new Set(present)];
    const dateLike = present.length > 0 && present.slice(0, 50).every((c) => /^\d{4}-\d{2}-\d{2}/.test(c));
    return { name, numeric, missing: cells.length - present.length, distinct: values.length, values: values.slice(0, 50), dateLike };
  });
}

/** The column most likely to name the groups: few distinct values, preferring text. */
export function guessGroupColumn(parsed) {
  const prof = profileColumns(parsed);
  const ok = prof.filter((c) => c.distinct >= 2 && c.distinct <= 12 && !c.dateLike && c.missing < parsed.rows.length);
  ok.sort((p, q) => (p.numeric - q.numeric) || (p.distinct - q.distinct));
  // A numeric group column only when another numeric column is left to compare.
  const numericCount = prof.filter((c) => c.numeric).length;
  const pick = ok.find((c) => !c.numeric || numericCount > 1);
  return pick ? pick.name : null;
}

const listOf = (v) => (Array.isArray(v) ? v.map(String) : String(v ?? "").split(",").map((s) => s.trim()).filter(Boolean));

export const fmt = (v, digits = 3) => {
  if (v === null || v === undefined || !Number.isFinite(v)) return "n/a";
  const a = Math.abs(v);
  if (a !== 0 && (a >= 1e9 || a < 1e-3)) return v.toExponential(2);
  if (Number.isInteger(v)) return v.toLocaleString("en-US");
  return Number(v.toPrecision(Math.max(digits, Math.ceil(Math.log10(a + 1)) + 1))).toLocaleString("en-US", { maximumFractionDigits: 6 });
};

const fmtP = (p) => (p < 0.001 ? "below 0.001" : p.toFixed(3));

/** One CSV cell, with a spreadsheet formula-injection guard on text that starts with = + - @ tab or CR. */
export function csvCell(c) {
  let s = String(c ?? "");
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?(e[-+]?\d+)?$/i.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// ------------------------------------------------------------------ analyze

function sample(rows, k, rand) {
  if (rows.length <= k) return rows;
  return shuffle(rows.slice(), rand).slice(0, k);
}

/**
 * Compare two groups of rows. Input: { csv | rows (array of objects), group
 * (the column naming the groups), groups? ([first, second]; default the
 * first two values in order of appearance), columns? (numeric columns to
 * compare; default all numeric ones), cost?, scale?, blur?, permutations?,
 * energyPermutations?, maxPoints?, seed? }. Returns per-column exact
 * results, the several-column transport bracket and energy test, and a
 * plain-language summary; { error } when the input cannot be compared.
 */
export function analyze(input = {}) {
  const warnings = [];
  let parsed;
  if (Array.isArray(input.rows)) {
    if (!input.rows.length) return { error: "rows is empty." };
    const columns = Object.keys(input.rows[0]);
    parsed = { columns, rows: input.rows.map((o) => columns.map((c) => (o[c] === null || o[c] === undefined ? "" : String(o[c])))) };
  } else {
    parsed = parseCsv(input.csv);
    if (parsed.error) return { error: parsed.error };
  }
  const prof = profileColumns(parsed);
  const group = input.group ?? input.groupColumn ?? guessGroupColumn(parsed);
  if (!group) return { error: "Name the column that says which group each row belongs to (for example period, site or variant). No column has between 2 and 12 distinct values." };
  const gi = parsed.columns.indexOf(group);
  if (gi < 0) return { error: `There is no column named "${group}". Columns: ${parsed.columns.join(", ")}.` };
  const seenVals = [];
  for (const r of parsed.rows) { const v = r[gi]; if (!isMissing(v) && !seenVals.includes(v)) seenVals.push(v); }
  const groups = input.groups ? listOf(input.groups) : seenVals.slice(0, 2);
  if (groups.length !== 2 || groups[0] === groups[1]) return { error: `Choose two different groups to compare. "${group}" has ${seenVals.length === 1 ? "only one value" : `${seenVals.length} values`}: ${seenVals.slice(0, 12).join(", ")}.` };
  for (const g of groups) if (!seenVals.includes(g)) return { error: `"${group}" has no rows with the value "${g}". Its values: ${seenVals.slice(0, 12).join(", ")}.` };
  if (!input.groups && seenVals.length > 2) warnings.push(`"${group}" has ${seenVals.length} values; comparing the first two, ${groups[0]} and ${groups[1]}. Choose others to compare a different pair.`);

  let features = input.columns ? listOf(input.columns) : prof.filter((c) => c.numeric && c.name !== group && c.distinct > 1).map((c) => c.name);
  for (const c of features) {
    const p = prof.find((q) => q.name === c);
    if (!p) return { error: `There is no column named "${c}".` };
    if (!p.numeric) return { error: `Column "${c}" is not numeric.` };
  }
  features = features.filter((c) => c !== group);
  if (!features.length) return { error: "No numeric column to compare. Add at least one column of numbers." };
  if (features.length > 20) return { error: `${features.length} columns is more than this tool compares at once (20). Choose the columns that matter.` };
  const fi = features.map((c) => parsed.columns.indexOf(c));

  // Rows of each group, complete on the chosen columns.
  const pts = [[], []];
  let dropped = 0;
  for (const r of parsed.rows) {
    const g = groups.indexOf(r[gi]);
    if (g < 0) continue;
    if (fi.some((j) => isMissing(r[j]))) { dropped++; continue; }
    pts[g].push(fi.map((j) => Number(numText(r[j]))));
  }
  if (dropped) warnings.push(`${dropped.toLocaleString("en-US")} row${dropped === 1 ? " has" : "s have"} a missing value in a chosen column and ${dropped === 1 ? "was" : "were"} left out.`);
  for (let g = 0; g < 2; g++) if (pts[g].length < 2) return { error: `Group "${groups[g]}" has ${pts[g].length} complete row${pts[g].length === 1 ? "" : "s"}; at least 2 are needed.` };
  for (let g = 0; g < 2; g++) if (pts[g].length < 20) warnings.push(`Group "${groups[g]}" has only ${pts[g].length} rows, so its distribution is rough and the test has little power.`);

  const seed = Number.isFinite(Number(input.seed)) ? Number(input.seed) : DEFAULTS.seed;
  const permutations = Math.min(Math.max(Math.round(Number(input.permutations ?? DEFAULTS.permutations)) || 0, 0), 20000);
  const columns = features.map((name, k) => {
    const x = pts[0].map((p) => p[k]), y = pts[1].map((p) => p[k]);
    const c = compareColumn(x, y);
    const t = permutations ? permutationW1(x, y, { permutations, seed: seed + k }) : null;
    return { column: name, ...c, pValue: t ? t.pValue : null };
  });

  // Several columns at once.
  let multi = null;
  if (features.length > 1) {
    const cost = input.cost === "sqeuclidean" ? "sqeuclidean" : "euclidean";
    const scaleMode = input.scale ?? DEFAULTS.scale;
    const pooled = features.map((_, k) => moments([...pts[0], ...pts[1]].map((p) => p[k])).sd);
    const doScale = scaleMode === "sd" || scaleMode === "auto";
    const scales = features.map((_, k) => (doScale && pooled[k] > 0 ? pooled[k] : 1));
    const rand = rng(seed);
    const maxPoints = Math.max(50, Math.round(Number(input.maxPoints ?? DEFAULTS.maxPoints)) || DEFAULTS.maxPoints);
    const subA = sample(pts[0], maxPoints, rand), subB = sample(pts[1], maxPoints, rand);
    if (subA.length < pts[0].length || subB.length < pts[1].length) warnings.push(`The several-column distance and test use a seeded random ${subA.length.toLocaleString("en-US")} + ${subB.length.toLocaleString("en-US")} rows (of ${pts[0].length.toLocaleString("en-US")} + ${pts[1].length.toLocaleString("en-US")}) to stay fast in a browser; the one-column results use every row.`);
    const X = subA.map((p) => p.map((v, k) => v / scales[k])), Y = subB.map((p) => p.map((v, k) => v / scales[k]));
    const blur = Number(input.blur ?? DEFAULTS.blur);
    const ot = transport(X, Y, { cost, blur: blur > 0 ? blur : DEFAULTS.blur, tol: input.tol, maxIter: input.maxIter });
    if (!ot.converged) warnings.push(`Sinkhorn stopped after ${ot.iterations} iterations with marginal error ${fmt(ot.marginalError)}; the bracket is still valid but may be wide. A larger blur converges faster.`);
    // Where the movement is: share of the plan's squared displacement in each column (in scaled units).
    const n = X.length, m = Y.length, d = features.length;
    const share = new Float64Array(d);
    const arrows = [];
    for (let i = 0; i < n; i++) {
      const tgt = new Float64Array(d);
      let mass = 0;
      for (let j = 0; j < m; j++) {
        const p = ot.plan[i * m + j];
        if (!p) continue;
        mass += p;
        for (let k = 0; k < d; k++) { share[k] += p * (X[i][k] - Y[j][k]) ** 2; tgt[k] += p * subB[j][k]; }
      }
      arrows.push({ from: subA[i], to: Array.from(tgt, (v) => (mass > 0 ? v / mass : v)) });
    }
    let tot = 0;
    for (const s of share) tot += s;
    const energyPermutations = Math.min(Math.max(Math.round(Number(input.energyPermutations ?? DEFAULTS.energyPermutations)) || 0, 0), 2000);
    const energy = energyPermutations ? energyTest(X, Y, { permutations: energyPermutations, seed }) : null;
    const units = doScale ? "pooled standard deviations" : "the columns' own units";
    multi = {
      cost,
      metric: cost === "sqeuclidean" ? "W2" : "W1",
      scaled: doScale,
      scales,
      units,
      rows: [X.length, Y.length],
      eps: ot.eps,
      blur: blur > 0 ? blur : DEFAULTS.blur,
      distance: ot.distance,
      lower: ot.distanceLower,
      upper: ot.distanceUpper,
      gap: ot.distanceUpper - ot.distanceLower,
      sinkhornCost: ot.sinkhornCost,
      iterations: ot.iterations,
      marginalError: ot.marginalError,
      converged: ot.converged,
      columnShare: features.map((c, k) => ({ column: c, share: tot > 0 ? share[k] / tot : 0 })),
      arrows,
      energy,
    };
  }

  const res = {
    group,
    groups,
    n: [pts[0].length, pts[1].length],
    features,
    columns,
    multi,
    warnings,
    params: { seed, permutations, cost: multi ? multi.cost : "euclidean", scale: input.scale ?? DEFAULTS.scale, blur: multi ? multi.blur : null },
  };
  res.summary = summarize(res);
  // The raw points and per-row arrows feed the page's charts; kept out of JSON so agent and CLI output stays small.
  Object.defineProperty(res, "points", { value: pts, enumerable: false });
  if (multi) Object.defineProperty(multi, "arrows", { value: multi.arrows, enumerable: false });
  return res;
}

function summarize(r) {
  const [A, B] = r.groups;
  const parts = [];
  const moved = (c) => {
    if (c.direction === "up") return `every quantile is higher in ${B}`;
    if (c.direction === "down") return `every quantile is lower in ${B}`;
    if (c.direction === "none") return "the two distributions are identical";
    return `${fmt(c.movedUp)} of it is mass moving up and ${fmt(c.movedDown)} moving down`;
  };
  const sorted = r.columns.slice().sort((p, q) => q.w1 / (q.sd[0] + q.sd[1] || 1) - p.w1 / (p.sd[0] + p.sd[1] || 1));
  for (const c of sorted.slice(0, 3)) {
    const sig = c.pValue === null ? "" : c.pValue < 0.05 ? ` (permutation p ${fmtP(c.pValue)})` : ` (permutation p ${fmtP(c.pValue)}, within chance)`;
    parts.push(`${c.column}: W1 = ${fmt(c.w1)} in its own units, mean shift ${c.meanShift >= 0 ? "+" : ""}${fmt(c.meanShift)}; ${moved(c)}${sig}.`);
  }
  let s = `${B} (${r.n[1].toLocaleString("en-US")} rows) against ${A} (${r.n[0].toLocaleString("en-US")} rows). ` + parts.join(" ");
  if (r.columns.length > 3) s += ` ${r.columns.length - 3} more column${r.columns.length === 4 ? "" : "s"} in the table.`;
  if (r.multi) {
    const m = r.multi;
    const lead = m.columnShare.slice().sort((p, q) => q.share - p.share)[0];
    s += ` All ${r.features.length} columns at once: ${m.metric} = ${fmt(m.distance)} ${m.scaled ? "pooled SDs" : "units"} (exact value certified between ${fmt(m.lower)} and ${fmt(m.upper)}); ${Math.round(lead.share * 100)}% of the movement is in ${lead.column}.`;
    if (m.energy) s += ` Energy test p ${fmtP(m.energy.pValue)} over ${m.energy.permutations} shuffles${m.energy.pValue < 0.05 ? "" : ", so the difference is within what chance gives"}.`;
  }
  return s;
}

/** The per-column table as CSV. */
export function toCsv(r) {
  const head = ["column", `n_${r.groups[0]}`, `n_${r.groups[1]}`, `mean_${r.groups[0]}`, `mean_${r.groups[1]}`, "mean_shift", "w1", "w2", "w2sq_location", "w2sq_spread", "w2sq_shape", "moved_up", "moved_down", "direction", "permutation_p", ...QUANTILES.map((q) => `shift_q${Math.round(q * 100)}`)];
  const lines = [head.map(csvCell).join(",")];
  for (const c of r.columns) {
    lines.push([c.column, c.n[0], c.n[1], c.mean[0], c.mean[1], c.meanShift, c.w1, c.w2, c.w2Parts.location, c.w2Parts.spread, c.w2Parts.shape, c.movedUp, c.movedDown, c.direction, c.pValue ?? "", ...c.quantiles.map((q) => q.shift)].map(csvCell).join(","));
  }
  return lines.join("\n") + "\n";
}
