// Gaussian-process regression with hyperparameters fitted by maximising the
// log marginal likelihood (Rasmussen & Williams 2006, Algorithm 2.1 and
// section 5.4). Given points (x, y), it fits a smooth curve with an honest
// uncertainty band, says how wiggly, periodic and noisy the data are in the
// data's own units, forecasts a little beyond the last point, and ranks
// several kernels by their evidence. Leave-one-out residuals come in closed
// form (R&W eqs 5.10-5.12), which checks whether the band is calibrated.
// Pure functions, no DOM, no network; random restarts come only from a
// seeded generator. Implemented from the book's equations; no third-party
// code was ported. scikit-learn's GaussianProcessRegressor was used only to
// produce eval/reference.json, which the tests compare against.

export const PAPERS = [
  {
    authors: "Carl Edward Rasmussen, Christopher K. I. Williams",
    title: "Gaussian Processes for Machine Learning",
    venue: "MIT Press, Cambridge, MA (free online edition at gaussianprocess.org/gpml)",
    year: 2006,
    url: "https://gaussianprocess.org/gpml/",
    isbn: "026218253X",
    implemented:
      "Algorithm 2.1 (Cholesky factor of K + noise, alpha = K^-1 y, predictive mean k*'alpha, variance k(x*,x*) - v'v with v = L\\k*, log marginal likelihood -y'alpha/2 - sum log L_ii - n/2 log 2 pi); the gradient of the log marginal likelihood, eq. 5.9, dL/dtheta = tr((alpha alpha' - K^-1) dK/dtheta)/2, used to fit every hyperparameter by type-II maximum likelihood (section 5.4.1); leave-one-out predictive means and variances in closed form, eqs. 5.10-5.12; the squared exponential, Matern 3/2 and 5/2, rational quadratic and periodic covariance functions of chapter 4, and sums and products of them (section 4.2.4), as in the book's Mauna Loa CO2 model (section 5.4.3).",
    deviations:
      "y is centred and scaled to unit variance before fitting and the result scaled back (as scikit-learn's normalize_y does); the mean function is the data mean, so far from the data the forecast reverts to it. The periodic kernel is MacKay's (1998) form, exp(-2 sin^2(pi r / p) / l^2), as in scikit-learn's ExpSineSquared. Hyperparameters are searched in log space inside box bounds with a projected L-BFGS of our own and seeded random restarts; the book uses conjugate gradients. 1e-10 is added to the diagonal for numerical stability, as in scikit-learn. One input column only.",
  },
  {
    authors: "Dong C. Liu, Jorge Nocedal",
    title: "On the limited memory BFGS method for large scale optimization",
    venue: "Mathematical Programming 45, 503-528",
    year: 1989,
    url: "https://doi.org/10.1007/BF01589116",
    doi: "10.1007/BF01589116",
    implemented: "The two-loop L-BFGS direction with the last 10 curvature pairs, used to maximise the log marginal likelihood over log hyperparameters.",
    deviations: "Bounds are handled by projection with an Armijo backtracking search along the projected path, and variables held at a bound are frozen for that step; this is simpler than L-BFGS-B (Byrd, Lu, Nocedal & Zhu 1995), which scikit-learn uses through SciPy.",
  },
  {
    authors: "David J. C. MacKay",
    title: "Introduction to Gaussian processes",
    venue: "In C. M. Bishop (ed.), Neural Networks and Machine Learning, NATO ASI Series F 168, Springer, 133-165",
    year: 1998,
    url: "https://www.inference.org.uk/mackay/gpB.pdf",
    implemented: "The periodic covariance function obtained by mapping x to (sin, cos) of x, in the exp(-2 sin^2(pi r / p) / l^2) form.",
    deviations: "None beyond the parameterisation by period p and length l.",
  },
];

export const KERNELS = {
  rbf: { title: "Squared exponential (RBF)", formula: "s^2 exp(-r^2 / 2l^2)", terms: [["rbf"]], blurb: "very smooth curves" },
  matern52: { title: "Matern 5/2", formula: "s^2 (1 + a + a^2/3) exp(-a), a = sqrt5 r / l", terms: [["matern52"]], blurb: "smooth but less rigid curves" },
  matern32: { title: "Matern 3/2", formula: "s^2 (1 + a) exp(-a), a = sqrt3 r / l", terms: [["matern32"]], blurb: "rougher curves" },
  rq: { title: "Rational quadratic", formula: "s^2 (1 + r^2 / 2 alpha l^2)^-alpha", terms: [["rq"]], blurb: "a mix of short and long length scales" },
  periodic: { title: "Periodic", formula: "s^2 exp(-2 sin^2(pi r / p) / l^2)", terms: [["periodic"]], blurb: "a pattern that repeats exactly" },
  quasiperiodic: { title: "Quasi-periodic (RBF x periodic)", formula: "s^2 exp(-r^2 / 2l_d^2) exp(-2 sin^2(pi r / p) / l_p^2)", terms: [["rbf", "periodic"]], blurb: "a repeating pattern whose shape drifts" },
  "smooth-quasiperiodic": {
    title: "Smooth + quasi-periodic",
    formula: "s1^2 exp(-r^2 / 2l1^2) + s2^2 exp(-r^2 / 2l_d^2) exp(-2 sin^2(pi r / p) / l_p^2)",
    terms: [["rbf"], ["rbf", "periodic"]],
    blurb: "a smooth curve plus a repeating pattern whose shape drifts",
  },
};

export const DEFAULTS = {
  kernel: "auto",
  mean: "linear",
  restarts: 3,
  seed: 42,
  horizon: null, // forecast beyond the last x; null = 15% of the x range
  gridPoints: 240,
  maxRows: 1500,
  jitter: 1e-10,
};

const LOG2PI = Math.log(2 * Math.PI);

/** Seeded generator (mulberry32). */
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

// ---------- kernels ----------

// Each factor returns its value at distance r >= 0 and writes
// d value / d log(param), for each of its params, into d. Params are positive and stored as logs by the caller.
const FACTORS = {
  rbf: {
    params: ["length"],
    eval(r, [l], d) {
      const q = (r * r) / (l * l);
      const f = Math.exp(-0.5 * q);
      d[0] = f * q;
      return f;
    },
  },
  matern32: {
    params: ["length"],
    eval(r, [l], d) {
      const a = (Math.sqrt(3) * r) / l;
      const e = Math.exp(-a);
      d[0] = a * a * e;
      return (1 + a) * e;
    },
  },
  matern52: {
    params: ["length"],
    eval(r, [l], d) {
      const a = (Math.sqrt(5) * r) / l;
      const e = Math.exp(-a);
      d[0] = ((a * a) / 3) * (1 + a) * e;
      return (1 + a + (a * a) / 3) * e;
    },
  },
  rq: {
    // scikit-learn lists RationalQuadratic's hyperparameters alphabetically: alpha, then length.
    params: ["alpha", "length"],
    eval(r, [alpha, l], d) {
      const b = (r * r) / (2 * alpha * l * l);
      const lb = Math.log1p(b);
      const f = Math.exp(-alpha * lb);
      d[0] = f * alpha * (b / (1 + b) - lb);
      d[1] = (2 * alpha * b * f) / (1 + b);
      return f;
    },
  },
  periodic: {
    params: ["periodLength", "period"],
    eval(r, [l, p], d) {
      const arg = (Math.PI * r) / p;
      const s = Math.sin(arg), c = Math.cos(arg);
      const f = Math.exp((-2 * s * s) / (l * l));
      d[0] = (f * 4 * s * s) / (l * l);
      d[1] = (f * 4 * arg * s * c) / (l * l);
      return f;
    },
  },
};

// Own-key lookups only: a kernel named "constructor" must be unknown, not Object.prototype's.
const factorOf = (t) => (Object.hasOwn(FACTORS, t) ? FACTORS[t] : null);
const kernelOf = (k) => (Object.hasOwn(KERNELS, k) ? KERNELS[k] : null);

/**
 * The hyperparameter layout of a kernel: for each term an amplitude
 * ("variance", s^2 on the scaled y) then its factors' params in order, and the
 * noise variance last. This is scikit-learn's theta order for
 * C1*F11*F12 + C2*F21 + ... + WhiteKernel.
 */
export function kernelLayout(name) {
  const k = kernelOf(name);
  if (!k) throw new Error(`unknown kernel "${name}"`);
  const params = [];
  k.terms.forEach((factors, t) => {
    params.push({ term: t, factor: null, kind: "variance" });
    factors.forEach((f, j) => factorOf(f).params.forEach((kind) => params.push({ term: t, factor: j, type: f, kind })));
  });
  params.push({ term: null, factor: null, kind: "noise" });
  return params;
}

function splitTheta(name, theta) {
  // theta: natural (not log) values in layout order -> per term {variance, factors:[[params]]}
  const k = kernelOf(name);
  let i = 0;
  const terms = k.terms.map((factors) => {
    const variance = theta[i++];
    const fs = factors.map((f) => {
      const ps = factorOf(f).params.map(() => theta[i++]);
      return { type: f, ps };
    });
    return { variance, fs };
  });
  return { terms, noise: theta[i] };
}

/**
 * k(r) without noise, and optionally its gradient with respect to each log
 * hyperparameter (noise slot gets 0; the caller adds noise on the diagonal).
 */
export function kernelAt(name, theta, r, withGrad = false) {
  const { terms } = splitTheta(name, theta);
  let value = 0;
  const grad = withGrad ? new Array(theta.length).fill(0) : null;
  let i = 0;
  for (const term of terms) {
    const evals = term.fs.map((f) => {
      const d = [0, 0];
      return [factorOf(f.type).eval(r, f.ps, d), d.slice(0, f.ps.length)];
    });
    const prod = evals.reduce((a, e) => a * e[0], 1);
    const tv = term.variance * prod;
    value += tv;
    if (withGrad) {
      grad[i++] = tv;
      evals.forEach((e, j) => {
        let others = term.variance;
        evals.forEach((o, m) => { if (m !== j) others *= o[0]; });
        for (const d of e[1]) grad[i++] = others * d;
      });
    }
  }
  return withGrad ? { value, grad } : value;
}

// ---------- linear algebra (row-major Float64Array) ----------

/** In-place lower Cholesky factor of a symmetric n x n matrix; returns false if not positive definite. */
export function cholesky(A, n) {
  for (let j = 0; j < n; j++) {
    let s = A[j * n + j];
    for (let k = 0; k < j; k++) s -= A[j * n + k] * A[j * n + k];
    if (!(s > 0) || !Number.isFinite(s)) return false;
    const d = Math.sqrt(s);
    A[j * n + j] = d;
    for (let i = j + 1; i < n; i++) {
      let t = A[i * n + j];
      const ri = i * n, rj = j * n;
      for (let k = 0; k < j; k++) t -= A[ri + k] * A[rj + k];
      A[i * n + j] = t / d;
    }
    for (let k = j + 1; k < n; k++) A[j * n + k] = 0;
  }
  return true;
}

function forward(L, n, b) {
  const x = Float64Array.from(b);
  for (let i = 0; i < n; i++) {
    let s = x[i];
    for (let k = 0; k < i; k++) s -= L[i * n + k] * x[k];
    x[i] = s / L[i * n + i];
  }
  return x;
}

function backward(L, n, b) {
  const x = Float64Array.from(b);
  for (let i = n - 1; i >= 0; i--) {
    let s = x[i];
    for (let k = i + 1; k < n; k++) s -= L[k * n + i] * x[k];
    x[i] = s / L[i * n + i];
  }
  return x;
}

/** K^-1 from its Cholesky factor: (L^-1)' L^-1, with L^-1 stored transposed so every inner loop reads a row. */
function inverseFromCholesky(L, n) {
  const T = new Float64Array(n * n); // T[j][k] = (L^-1)[k][j], nonzero for k >= j
  for (let j = 0; j < n; j++) {
    const rj = j * n;
    T[rj + j] = 1 / L[rj + j];
    for (let i = j + 1; i < n; i++) {
      const ri = i * n;
      let s = 0;
      for (let k = j; k < i; k++) s -= L[ri + k] * T[rj + k];
      T[rj + i] = s / L[ri + i];
    }
  }
  const inv = new Float64Array(n * n);
  for (let i = 0; i < n; i++) {
    const ri = i * n;
    for (let j = 0; j <= i; j++) {
      const rj = j * n;
      let s = 0;
      for (let k = i; k < n; k++) s += T[ri + k] * T[rj + k];
      inv[ri + j] = s;
      inv[rj + i] = s;
    }
  }
  return inv;
}

// ---------- the model ----------

/** |x_i - x_j| for the lower triangle (i >= j), row by row. */
function pairDistances(x) {
  const n = x.length;
  const D = new Float64Array((n * (n + 1)) / 2);
  let q = 0;
  for (let i = 0; i < n; i++) for (let j = 0; j <= i; j++) D[q++] = Math.abs(x[i] - x[j]);
  return D;
}

/**
 * The kernel (without noise) on every pair, and, when asked, its derivative
 * with respect to each log hyperparameter except noise. One pass per factor
 * over a packed lower triangle, so a fit allocates a handful of arrays per
 * evaluation instead of one per pair.
 */
function kernelPairs(name, theta, D, withGrad) {
  const m = D.length;
  const { terms } = splitTheta(name, theta);
  const K = new Float64Array(m);
  const grads = [];
  for (const term of terms) {
    const vals = term.fs.map(() => new Float64Array(m));
    const ders = term.fs.map((f) => factorOf(f.type).params.map(() => (withGrad ? new Float64Array(m) : null)));
    term.fs.forEach((f, j) => {
      const fn = factorOf(f.type).eval;
      const v = vals[j], dj = ders[j], np = dj.length;
      const g = [0, 0];
      for (let q = 0; q < m; q++) {
        v[q] = fn(D[q], f.ps, g);
        if (withGrad) for (let t = 0; t < np; t++) dj[t][q] = g[t];
      }
    });
    const prod = new Float64Array(m).fill(term.variance);
    for (const v of vals) for (let q = 0; q < m; q++) prod[q] *= v[q];
    for (let q = 0; q < m; q++) K[q] += prod[q];
    if (withGrad) {
      grads.push(prod); // d/dlog variance = the term itself
      term.fs.forEach((_, j) => {
        for (const dj of ders[j]) {
          const g = new Float64Array(m);
          // term / factor_j * d factor_j; a factor can be 0 only where its derivative is 0 too
          // for the exponential kernels here, but guard by recomputing the product without it.
          for (let q = 0; q < m; q++) {
            let o = term.variance;
            for (let k = 0; k < vals.length; k++) if (k !== j) o *= vals[k][q];
            g[q] = o * dj[q];
          }
          grads.push(g);
        }
      });
    }
  }
  return { K, grads };
}

/**
 * Log marginal likelihood of scaled y under kernel `name` with natural
 * hyperparameters `theta` (layout order), and optionally its gradient with
 * respect to log theta (R&W eq. 5.9). Returns { lml, grad?, inv?, L, alpha }
 * or { lml: -Infinity } when K is not positive definite.
 */
export function logMarginal(name, theta, x, y, { grad = false, jitter = DEFAULTS.jitter, D = null } = {}) {
  const n = x.length;
  const P = theta.length;
  D = D || pairDistances(x);
  const noise = theta[P - 1];
  const { K: Kp, grads } = kernelPairs(name, theta, D, grad);
  const L = new Float64Array(n * n);
  let q = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) L[i * n + j] = Kp[q++];
    L[i * n + i] += noise + jitter;
  }
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) L[i * n + j] = L[j * n + i];
  if (!cholesky(L, n)) return { lml: -Infinity };
  const alpha = backward(L, n, forward(L, n, y));
  let lml = 0;
  for (let i = 0; i < n; i++) lml -= 0.5 * y[i] * alpha[i] + Math.log(L[i * n + i]);
  lml -= 0.5 * n * LOG2PI;
  const out = { lml, L, alpha };
  if (grad) {
    const inv = inverseFromCholesky(L, n);
    // W = alpha alpha' - K^-1 on the packed lower triangle, off-diagonal counted twice.
    const W = new Float64Array(D.length);
    let traceW = 0;
    q = 0;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j <= i; j++) {
        const w = alpha[i] * alpha[j] - inv[i * n + j];
        W[q++] = i === j ? w : 2 * w;
        if (i === j) traceW += w;
      }
    }
    out.grad = grads.map((G) => {
      let s = 0;
      for (let k = 0; k < G.length; k++) s += W[k] * G[k];
      return 0.5 * s;
    });
    out.grad.push(0.5 * noise * traceW);
    out.inv = inv;
  }
  return out;
}

// ---------- optimiser: projected L-BFGS (minimise f) ----------

/**
 * Minimise f over the box [lo, hi]. fg(x) returns [f, gradient]; f(x), when
 * given, returns f alone and is used for line-search trials, so a rejected
 * step does not pay for a gradient. Stops when the projected gradient is
 * below tol or f improves by less than ftol (relative), SciPy's factr idea.
 */
export function minimizeBox(fg, x0, lo, hi, { f = null, maxIter = 200, memory = 10, tol = 1e-6, ftol = 1e-10 } = {}) {
  const P = x0.length;
  const clamp = (v) => v.map((t, i) => Math.min(hi[i], Math.max(lo[i], t)));
  const fOnly = f || ((x) => fg(x)[0]);
  let x = clamp(x0);
  let [fx, gx] = fg(x);
  let evals = 1;
  if (!Number.isFinite(fx)) return { x, f: fx, iterations: 0, evals, converged: false };
  let S = [], Y = [];
  let iter = 0, converged = false;
  for (; iter < maxIter; iter++) {
    const free = x.map((t, i) => lo[i] < hi[i] && !((t <= lo[i] && gx[i] > 0) || (t >= hi[i] && gx[i] < 0)));
    const pgNorm = Math.sqrt(gx.reduce((s, g, i) => s + (free[i] ? g * g : 0), 0));
    if (pgNorm < tol) { converged = true; break; }
    // two-loop recursion on the free variables
    const q = gx.map((g, i) => (free[i] ? g : 0));
    const a = [];
    for (let k = S.length - 1; k >= 0; k--) {
      const rho = 1 / dot(Y[k], S[k]);
      const ak = rho * dot(S[k], q);
      a[k] = ak;
      for (let i = 0; i < P; i++) q[i] -= ak * Y[k][i];
    }
    const gamma = S.length ? dot(S[S.length - 1], Y[Y.length - 1]) / dot(Y[Y.length - 1], Y[Y.length - 1]) : 1 / Math.max(1, pgNorm);
    for (let i = 0; i < P; i++) q[i] *= gamma;
    for (let k = 0; k < S.length; k++) {
      const rho = 1 / dot(Y[k], S[k]);
      const b = rho * dot(Y[k], q);
      for (let i = 0; i < P; i++) q[i] += S[k][i] * (a[k] - b);
    }
    let d = q.map((v, i) => (free[i] ? -v : 0));
    if (dot(d, gx) >= 0) {
      d = gx.map((g, i) => (free[i] ? -g / Math.max(1, pgNorm) : 0));
      S = []; Y = [];
    }
    let t = 1, accepted = false, xn, fn;
    for (let ls = 0; ls < 40; ls++) {
      xn = clamp(x.map((v, i) => v + t * d[i]));
      fn = fOnly(xn);
      evals++;
      const dec = dot(gx, xn.map((v, i) => v - x[i]));
      if (Number.isFinite(fn) && fn <= fx + 1e-4 * dec) { accepted = true; break; }
      t *= 0.5;
    }
    if (!accepted) {
      if (S.length) { S = []; Y = []; continue; }
      break;
    }
    const [, gn] = fg(xn);
    const s = xn.map((v, i) => v - x[i]);
    const yv = gn.map((g, i) => g - gx[i]);
    const fPrev = fx;
    x = xn; gx = gn; fx = fn;
    if (dot(s, yv) > 1e-12) {
      S.push(s); Y.push(yv);
      if (S.length > memory) { S.shift(); Y.shift(); }
    }
    if ((fPrev - fx) <= ftol * Math.max(1, Math.abs(fPrev), Math.abs(fx))) { converged = true; break; }
  }
  return { x, f: fx, iterations: iter, evals, converged };
}

const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);

/**
 * Starting values and log-space bounds for a kernel on scaled y, from the
 * data's x spacing. `period` (x units) seeds or, with fixPeriod, fixes p.
 */
export function defaultBounds(name, x, { period = null, fixPeriod = false } = {}) {
  const xs = [...x].sort((a, b) => a - b);
  const range = xs[xs.length - 1] - xs[0] || 1;
  let minGap = Infinity;
  for (let i = 1; i < xs.length; i++) if (xs[i] > xs[i - 1]) minGap = Math.min(minGap, xs[i] - xs[i - 1]);
  if (!Number.isFinite(minGap)) minGap = range / 10;
  const p0 = period && period > 0 ? period : guessPeriod(x, null, range, minGap);
  const nTerms = kernelOf(name).terms.length;
  return kernelLayout(name).map((prm) => {
    let init, lo, hi;
    if (prm.kind === "variance") { init = nTerms > 1 && prm.term === 1 ? 0.1 : 1; lo = 1e-5; hi = 1e5; }
    else if (prm.kind === "noise") { init = 0.1; lo = 1e-8; hi = 10; }
    else if (prm.kind === "length") {
      // A periodic term's decay length starts long; a smooth term in a sum starts at a third of the range.
      init = prm.factor === 0 && kernelOf(name).terms[prm.term].includes("periodic") ? range / 2 : nTerms > 1 && prm.term === 0 ? range / 3 : range / 30;
      lo = Math.max(minGap / 10, range * 1e-4); hi = range * 100;
    }
    else if (prm.kind === "alpha") { init = 1; lo = 1e-2; hi = 1e4; }
    else if (prm.kind === "periodLength") { init = 1; lo = 1e-2; hi = 1e2; }
    else if (prm.kind === "period") {
      lo = 2 * minGap; hi = range;
      init = Math.min(hi, Math.max(lo, p0));
      if (fixPeriod && period > 0) { init = period; lo = period; hi = period; }
    }
    // Random restarts draw from a plausible sub-range, not the whole box: a
    // length scale shorter than the closest pair of points or a noise SD above
    // the data's own SD is allowed but rarely worth a start.
    const sub = {
      variance: [1e-2, 10],
      noise: [1e-4, 1],
      length: [Math.max(lo, minGap), Math.min(hi, 2 * range)],
      alpha: [0.1, 10],
      periodLength: [0.3, 3],
      period: [Math.max(lo, init / 2), hi],
    }[prm.kind];
    const [rlo, rhi] = lo === hi ? [lo, hi] : [Math.max(lo, sub[0]), Math.min(hi, sub[1])];
    return { ...prm, init, lo, hi, rlo, rhi };
  });
}

/** Strongest period in (x, y) after removing a straight line: a simple least-squares periodogram over 400 trial periods. */
export function guessPeriod(x, y, range, minGap) {
  if (!y) return range / 4;
  const n = x.length;
  const mx = x.reduce((a, b) => a + b, 0) / n, my = y.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0;
  for (let i = 0; i < n; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; }
  const slope = sxx ? sxy / sxx : 0;
  const r = y.map((v, i) => v - my - slope * (x[i] - mx));
  let best = range / 4, bestP = -1;
  const lo = Math.log(2 * minGap), hi = Math.log(range / 2);
  if (!(hi > lo)) return range / 4;
  for (let k = 0; k <= 400; k++) {
    const p = Math.exp(lo + ((hi - lo) * k) / 400);
    let c = 0, s = 0;
    for (let i = 0; i < n; i++) { const w = (2 * Math.PI * x[i]) / p; c += r[i] * Math.cos(w); s += r[i] * Math.sin(w); }
    const power = c * c + s * s;
    if (power > bestP) { bestP = power; best = p; }
  }
  return best;
}

/**
 * Fit one kernel by maximising the log marginal likelihood from the default
 * start plus `restarts` seeded random starts (log-uniform in a plausible
 * sub-range of the bounds; the optimiser may still go anywhere in the box).
 */
export function fitKernel(name, x, y, { restarts = DEFAULTS.restarts, seed = DEFAULTS.seed, period = null, fixPeriod = false, start = null, bounds = null, jitter = DEFAULTS.jitter } = {}) {
  const spec = bounds || defaultBounds(name, x, { period: period ?? guessPeriod(x, y, rangeOf(x), minGapOf(x)), fixPeriod });
  const D = pairDistances(x);
  const lo = spec.map((s) => Math.log(s.lo)), hi = spec.map((s) => Math.log(s.hi));
  const fg = (logT) => {
    const r = logMarginal(name, logT.map(Math.exp), x, y, { grad: true, D, jitter });
    if (!Number.isFinite(r.lml)) return [Infinity, logT.map(() => 0)];
    return [-r.lml, r.grad.map((g) => -g)];
  };
  const fOnly = (logT) => {
    const r = logMarginal(name, logT.map(Math.exp), x, y, { D, jitter });
    return Number.isFinite(r.lml) ? -r.lml : Infinity;
  };
  const rand = rng(seed);
  const starts = [start ? start.map(Math.log) : spec.map((s) => Math.log(s.init))];
  const rlo = spec.map((s) => Math.log(s.rlo ?? s.lo)), rhi = spec.map((s) => Math.log(s.rhi ?? s.hi));
  for (let k = 0; k < restarts; k++) starts.push(rlo.map((l, i) => l + (rhi[i] - l) * rand()));
  let best = null;
  const runs = [];
  for (const s0 of starts) {
    const res = minimizeBox(fg, s0, lo, hi, { f: fOnly });
    runs.push({ lml: -res.f, iterations: res.iterations, evals: res.evals, converged: res.converged });
    if (Number.isFinite(res.f) && (!best || res.f < best.f)) best = res;
  }
  if (!best) return { error: "The covariance matrix was not positive definite at any starting point." };
  const theta = best.x.map(Math.exp);
  const atBound = spec.map((s, i) => s.lo < s.hi && (best.x[i] - lo[i] < 1e-3 || hi[i] - best.x[i] < 1e-3));
  return { kernel: name, theta, lml: -best.f, spec, atBound, runs };
}

const rangeOf = (x) => Math.max(...x) - Math.min(...x) || 1;
function minGapOf(x) {
  const xs = [...x].sort((a, b) => a - b);
  let g = Infinity;
  for (let i = 1; i < xs.length; i++) if (xs[i] > xs[i - 1]) g = Math.min(g, xs[i] - xs[i - 1]);
  return Number.isFinite(g) ? g : rangeOf(x) / 10;
}

/**
 * Posterior at new inputs (scaled y). Returns mean, latent variance (the
 * curve) and observation variance (a new reading: latent + noise).
 */
export function predict(name, theta, x, y, xNew, { jitter = DEFAULTS.jitter } = {}) {
  const n = x.length;
  const r = logMarginal(name, theta, x, y, { jitter });
  if (!Number.isFinite(r.lml)) return null;
  const noise = theta[theta.length - 1];
  const k0 = kernelAt(name, theta, 0);
  return xNew.map((xs) => {
    const ks = x.map((xi) => kernelAt(name, theta, Math.abs(xs - xi)));
    const mean = dot(ks, r.alpha);
    const v = forward(r.L, n, ks);
    const latent = Math.max(0, k0 - dot(v, v));
    return { mean, latentVar: latent, obsVar: latent + noise };
  });
}

/**
 * Posterior with a linear mean m(x) = b0 + b1 x whose coefficients have a
 * vague Gaussian prior (R&W section 2.7, eqs. 2.41-2.42): b is estimated by
 * generalised least squares under K, and its uncertainty widens the band,
 * most of all far from the data. x is centred and scaled inside.
 */
export function predictLinearMean(name, theta, x, y, xNew, { jitter = DEFAULTS.jitter } = {}) {
  const n = x.length;
  const r = logMarginal(name, theta, x, y, { jitter });
  if (!Number.isFinite(r.lml)) return null;
  const cx = x.reduce((a, b) => a + b, 0) / n;
  const sx = Math.sqrt(x.reduce((a, b) => a + (b - cx) ** 2, 0) / n) || 1;
  const h = (v) => [1, (v - cx) / sx];
  // K^-1 H' and K^-1 y via the Cholesky factor
  const solve = (b) => backward(r.L, n, forward(r.L, n, b));
  const Ki1 = solve(new Float64Array(n).fill(1));
  const Kix = solve(x.map((v) => (v - cx) / sx));
  const hx = x.map((v) => (v - cx) / sx);
  const A = [[dot(Ki1, new Array(n).fill(1)), dot(Ki1, hx)], [dot(Kix, new Array(n).fill(1)), dot(Kix, hx)]];
  const det = A[0][0] * A[1][1] - A[0][1] * A[1][0];
  const Ai = [[A[1][1] / det, -A[0][1] / det], [-A[1][0] / det, A[0][0] / det]];
  const Hy = [dot(Ki1, y), dot(Kix, y)];
  const beta = [Ai[0][0] * Hy[0] + Ai[0][1] * Hy[1], Ai[1][0] * Hy[0] + Ai[1][1] * Hy[1]];
  const resid = y.map((v, i) => v - beta[0] - beta[1] * hx[i]);
  const a2 = solve(resid);
  const noise = theta[theta.length - 1];
  const k0 = kernelAt(name, theta, 0);
  const out = xNew.map((xs) => {
    const ks = x.map((xi) => kernelAt(name, theta, Math.abs(xs - xi)));
    const hs = h(xs);
    const mean = dot(ks, a2) + hs[0] * beta[0] + hs[1] * beta[1];
    const v = forward(r.L, n, ks);
    const latent0 = Math.max(0, k0 - dot(v, v));
    const R = [hs[0] - dot(Ki1, ks), hs[1] - dot(Kix, ks)];
    const extra = R[0] * (Ai[0][0] * R[0] + Ai[0][1] * R[1]) + R[1] * (Ai[1][0] * R[0] + Ai[1][1] * R[1]);
    const latent = latent0 + Math.max(0, extra);
    return { mean, latentVar: latent, obsVar: latent + noise };
  });
  out.beta = { intercept: beta[0] - (beta[1] * cx) / sx, slope: beta[1] / sx };
  return out;
}

/** Ordinary least-squares line through (x, y): { intercept, slope, fitted }. */
export function olsLine(x, y) {
  const n = x.length;
  const mx = x.reduce((a, b) => a + b, 0) / n, my = y.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0;
  for (let i = 0; i < n; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; }
  const slope = sxx ? sxy / sxx : 0;
  const intercept = my - slope * mx;
  return { intercept, slope, fitted: x.map((v) => intercept + slope * v) };
}

/** Leave-one-out predictive mean and variance for every point, in closed form (R&W eqs. 5.10-5.12). */
export function leaveOneOut(name, theta, x, y, { jitter = DEFAULTS.jitter } = {}) {
  const n = x.length;
  const r = logMarginal(name, theta, x, y, { grad: true, jitter });
  if (!Number.isFinite(r.lml)) return null;
  return y.map((yi, i) => {
    const kii = r.inv[i * n + i];
    return { mean: yi - r.alpha[i] / kii, variance: 1 / kii };
  });
}

// ---------- CSV and dates ----------

const isMissing = (s) => /^\s*(|na|n\/a|nan|null|none|\?|-)\s*$/i.test(String(s ?? ""));
const numText = (s) => String(s).trim().replace(/^\((.*)\)$/, "-$1").replace(/[$€£,%\s]/g, "");
const isNum = (s) => {
  const t = numText(s);
  return t !== "" && Number.isFinite(Number(t));
};
const DATE = /^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?$/;

/** "2024-07" -> 2024.5417 (mid-month); "2024-07-01" -> mid-day as a decimal year; anything else -> NaN. */
export function decimalYear(s) {
  const m = DATE.exec(String(s).trim());
  if (!m) return NaN;
  const yr = Number(m[1]), mo = Number(m[2]);
  if (mo < 1 || mo > 12) return NaN;
  if (m[3] === undefined) return yr + (mo - 0.5) / 12;
  const day = Number(m[3]);
  const start = Date.UTC(yr, 0, 1), end = Date.UTC(yr + 1, 0, 1), t = Date.UTC(yr, mo - 1, day);
  if (new Date(t).getUTCDate() !== day) return NaN;
  return yr + (t - start + 43200000) / (end - start);
}

/** A decimal year back to "YYYY-MM" (monthly data) or "YYYY-MM-DD". */
export function formatDate(v, monthly = true) {
  const yr = Math.floor(v);
  if (monthly) {
    let mo = Math.floor((v - yr) * 12) + 1;
    return `${yr}-${String(Math.min(12, mo)).padStart(2, "0")}`;
  }
  const start = Date.UTC(yr, 0, 1), end = Date.UTC(yr + 1, 0, 1);
  return new Date(start + (v - yr) * (end - start)).toISOString().slice(0, 10);
}

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

/** Parse a delimited table with a header row (comma, tab or semicolon). A headerless two-column table gets x, y. */
export function parseCsv(text) {
  const raw = String(text ?? "").replace(/^﻿/, "");
  const lines = raw.split(/\r\n|\n|\r/).filter((l) => l.trim() !== "");
  if (!lines.length) return { error: "The data is empty. Paste a CSV with an x column and a y column." };
  const delim = ["\t", ";", ","].map((dl) => [dl, splitLine(lines[0], dl).length]).sort((a, b) => b[1] - a[1])[0][0];
  const cells = lines.map((l) => splitLine(l, delim));
  let columns, start = 1;
  const valueLike = (c) => isNum(c) || isMissing(c) || DATE.test(c);
  if (cells[0].every(valueLike)) {
    columns = cells[0].length === 2 ? ["x", "y"] : cells[0].map((_, i) => `c${i + 1}`);
    start = 0;
  } else {
    columns = cells[0].map((c, i) => c || `c${i + 1}`);
    if (new Set(columns).size !== columns.length) return { error: "A column name appears twice in the header. Rename one of them." };
  }
  const rows = [];
  for (let i = start; i < cells.length; i++) {
    if (cells[i].length !== columns.length) return { error: `Line ${i + 1} has ${cells[i].length} fields but the header has ${columns.length}. Check the delimiter and quoting.` };
    rows.push({ line: i + 1, cells: cells[i] });
  }
  if (!rows.length) return { error: "The CSV has a header but no data rows." };
  return { columns, rows };
}

export const fmt = (v, digits = 3) => {
  if (v === null || v === undefined || !Number.isFinite(v)) return "n/a";
  const a = Math.abs(v);
  if (a !== 0 && (a >= 1e7 || a < 1e-3)) return v.toExponential(2);
  return Number(v.toPrecision(digits)).toLocaleString("en-US", { maximumFractionDigits: 8 });
};

/** One CSV cell, with a spreadsheet formula-injection guard on text that starts with = + - @ tab or CR. */
export function csvCell(c) {
  let s = String(c ?? "");
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?(e[-+]?\d+)?$/i.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const PARAM_TEXT = {
  variance: "signal SD",
  length: "length scale",
  alpha: "scale mixture (alpha)",
  periodLength: "shape within a period",
  period: "period",
  noise: "noise SD",
};

/** Hyperparameters in the data's units: SDs in y units, lengths and periods in x units. */
export function describeTheta(name, theta, spec, atBound, yScale) {
  const layout = kernelLayout(name);
  const nTerms = kernelOf(name).terms.length;
  return layout.map((p, i) => {
    let label = Object.hasOwn(PARAM_TEXT, p.kind) ? PARAM_TEXT[p.kind] : p.kind;
    // Named by structure, not role: in a fit the periodic term can carry the
    // long-run level too, so "trend" and "seasonal" would overclaim.
    const hasPeriodic = p.term !== null && kernelOf(name).terms[p.term].includes("periodic");
    if (nTerms > 1 && p.kind === "variance") label = hasPeriodic ? "periodic term SD" : "smooth term SD";
    if (p.kind === "length") label = hasPeriodic ? "periodic term decay length" : nTerms > 1 ? "smooth term length scale" : "length scale";
    let value = theta[i], unit = "x";
    if (p.kind === "variance" || p.kind === "noise") { value = Math.sqrt(theta[i]) * yScale; unit = "y"; }
    else if (p.kind === "alpha" || p.kind === "periodLength") unit = "";
    return { name: label, kind: p.kind, value, unit, raw: theta[i], fixed: spec ? spec[i].lo === spec[i].hi : false, atBound: atBound ? atBound[i] : false };
  });
}

const plural = (n, one, many = `${one}s`) => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;

/**
 * Fit a GP to one x column and one y column. Input: { csv | x & y arrays,
 * xColumn?, yColumn?, kernel? ("auto" or a KERNELS key), restarts?, seed?,
 * period? (x units), fixPeriod?, horizon? (x units past the last point),
 * predictAt? (x values or dates), gridPoints? }. Returns the fitted
 * hyperparameters in data units, the kernel comparison, leave-one-out
 * checks, the curve on a grid, predictions and a plain-language summary;
 * { error } when the input cannot be fitted.
 */
export function analyze(input = {}) {
  const warnings = [];
  const opts = { ...DEFAULTS, ...Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined && v !== null && v !== "")) };
  let xs = [], ys = [], lines = [], xName = "x", yName = "y", dateMode = false, monthly = true;
  if (Array.isArray(input.x) && Array.isArray(input.y)) {
    if (input.x.length !== input.y.length) return { error: "x and y must have the same length." };
    const xr = input.x, yr = input.y;
    dateMode = xr.length > 0 && xr.every((v) => typeof v === "string" && DATE.test(v.trim()));
    monthly = dateMode && xr.every((v) => /^\d{4}-\d{1,2}$/.test(v.trim()));
    xr.forEach((v, i) => {
      const xv = dateMode ? decimalYear(v) : Number(v), yv = Number(yr[i]);
      if (Number.isFinite(xv) && Number.isFinite(yv) && yr[i] !== null && yr[i] !== "") { xs.push(xv); ys.push(yv); lines.push(i + 1); }
    });
  } else {
    const parsed = parseCsv(input.csv);
    if (parsed.error) return { error: parsed.error };
    const { columns, rows } = parsed;
    const colIdx = (name, fallback) => {
      if (name === undefined || name === null || name === "") return fallback;
      const i = columns.indexOf(String(name));
      return i;
    };
    const kinds = columns.map((_, j) => {
      const present = rows.map((r) => r.cells[j]).filter((c) => !isMissing(c));
      if (present.length && present.every((c) => DATE.test(c))) return "date";
      if (present.length && present.every(isNum)) return "num";
      return "text";
    });
    const firstUsable = kinds.findIndex((k) => k !== "text");
    let xi = colIdx(input.xColumn, firstUsable);
    if (xi < 0) return { error: input.xColumn ? `No column named "${input.xColumn}". Columns: ${columns.join(", ")}.` : "No numeric or date column to use as x." };
    let yi = colIdx(input.yColumn, kinds.findIndex((k, j) => j !== xi && k === "num"));
    if (yi < 0) return { error: input.yColumn ? `No column named "${input.yColumn}". Columns: ${columns.join(", ")}.` : "Need a second, numeric column for y." };
    if (kinds[xi] === "text") return { error: `Column "${columns[xi]}" is not numeric or a date (YYYY-MM or YYYY-MM-DD).` };
    if (kinds[yi] !== "num") return { error: `Column "${columns[yi]}" is not numeric.` };
    xName = columns[xi]; yName = columns[yi];
    dateMode = kinds[xi] === "date";
    monthly = dateMode && rows.every((r) => isMissing(r.cells[xi]) || /^\d{4}-\d{1,2}$/.test(r.cells[xi]));
    let skipped = 0;
    for (const r of rows) {
      const cx = r.cells[xi], cy = r.cells[yi];
      if (isMissing(cx) || isMissing(cy)) { skipped++; continue; }
      const xv = dateMode ? decimalYear(cx) : Number(numText(cx));
      if (!Number.isFinite(xv)) { skipped++; continue; }
      xs.push(xv); ys.push(Number(numText(cy))); lines.push(r.line);
    }
    if (skipped) warnings.push(`Skipped ${plural(skipped, "row")} with a missing or unreadable x or y.`);
    const others = columns.filter((_, j) => j !== xi && j !== yi && kinds[j] === "num");
    if (others.length) warnings.push(`Used "${xName}" as x and "${yName}" as y; left out ${others.map((c) => `"${c}"`).join(", ")} (choose other columns to model them).`);
  }
  const n = xs.length;
  if (n < 5) return { error: `Need at least 5 points with both x and y; found ${n}.` };
  if (n > opts.maxRows) return { error: `This tool fits up to ${opts.maxRows.toLocaleString("en-US")} points in the browser (the cost grows as n^3); found ${n.toLocaleString("en-US")}. Aggregate or sample the data first.` };
  const xRange = Math.max(...xs) - Math.min(...xs);
  if (!(xRange > 0)) return { error: "Every x value is the same; a curve needs at least two different x values." };
  const meanY = ys.reduce((a, b) => a + b, 0) / n;
  const sdY = Math.sqrt(ys.reduce((a, b) => a + (b - meanY) ** 2, 0) / n);
  if (!(sdY > 0)) return { error: "Every y value is the same; there is nothing to fit." };
  if (n > 600) warnings.push(`${n.toLocaleString("en-US")} points: fitting may take a while, since each step costs n^3.`);
  const yz = ys.map((v) => (v - meanY) / sdY);
  const meanKind = String(opts.mean || "linear");
  if (!["linear", "constant"].includes(meanKind)) return { error: `Unknown mean "${meanKind}". Choose linear or constant.` };
  // With a linear mean the kernels are fitted to what a straight line leaves
  // over, and the line's uncertainty is added back at prediction time.
  const line = meanKind === "linear" ? olsLine(xs, yz) : null;
  const target = line ? yz.map((v, i) => v - line.fitted[i]) : yz;

  let period = Number(opts.period) > 0 ? Number(opts.period) : null;
  if (!period && dateMode) period = 1; // a year, in decimal years
  const fixPeriod = Boolean(opts.fixPeriod) && period > 0;
  const restarts = Math.max(0, Math.min(20, Math.floor(Number(opts.restarts))));
  const seed = Math.floor(Number(opts.seed)) || 0;

  const requested = String(opts.kernel || "auto");
  if (requested !== "auto" && !kernelOf(requested)) return { error: `Unknown kernel "${requested}". Choose auto or one of: ${Object.keys(KERNELS).join(", ")}.` };
  const names = requested === "auto" ? Object.keys(KERNELS) : [requested];
  const fits = [];
  for (const name of names) {
    const f = fitKernel(name, xs, target, { restarts, seed, period: period ?? guessPeriod(xs, target, xRange, minGapOf(xs)), fixPeriod });
    if (!f.error) fits.push(f);
  }
  if (!fits.length) return { error: "No kernel could be fitted: the covariance matrix was never positive definite. Check for repeated x values with very different y." };
  fits.sort((a, b) => b.lml - a.lml);
  const best = fits[0];
  const name = best.kernel;
  const scaleL = n * Math.log(sdY); // lml of the original y = scaled lml - n log sd
  const comparison = fits.map((f) => ({
    kernel: f.kernel,
    title: kernelOf(f.kernel).title,
    lml: f.lml,
    lmlOriginal: f.lml - scaleL,
    delta: f.lml - best.lml,
    hyperparameters: f.theta.length,
    atBound: f.atBound.some(Boolean),
  }));

  const hyper = describeTheta(name, best.theta, best.spec, best.atBound, sdY);
  const xUnit = dateMode ? "years" : `${xName} units`;
  const inX = (v, d = 3) => (dateMode ? `${fmt(v, d)} ${fmt(v, d) === "1" ? "year" : "years"}` : `${fmt(v, d)} ${xUnit}`);
  const signalVar = best.theta.filter((_, i) => kernelLayout(name)[i].kind === "variance").reduce((a, b) => a + b, 0);
  if (signalVar < 0.01 * best.theta[best.theta.length - 1]) warnings.push("The best fit treats almost all of the variation as noise around the mean: no smooth pattern stood out. Try another kernel, more restarts, or check that x is in order of the thing that drives y.");
  for (const h of hyper) if (h.atBound) warnings.push(`The ${h.name} sits at the edge of its search range (${h.unit === "x" ? inX(h.value) : fmt(h.value)}); the data do not pin it down${h.kind === "length" ? ", and a length this long means that part barely changes across the data" : ""}.`);

  // Leave-one-out
  // LOO treats the straight line as known (its 2 coefficients barely move when one of n points is left out).
  const loo = leaveOneOut(name, best.theta, xs, target);
  let sq = 0, inside = 0, lpd = 0;
  const points = xs.map((xv, i) => {
    const m = (loo[i].mean + (line ? line.fitted[i] : 0)) * sdY + meanY, sd = Math.sqrt(loo[i].variance) * sdY;
    const z = (ys[i] - m) / sd;
    sq += (ys[i] - m) ** 2;
    if (Math.abs(z) <= 1.959964) inside++;
    lpd += -0.5 * Math.log(2 * Math.PI * sd * sd) - 0.5 * z * z;
    return { line: lines[i], x: xv, xLabel: dateMode ? formatDate(xv, monthly) : xv, y: ys[i], looMean: m, looSd: sd, z };
  });
  const outliers = points.filter((p) => Math.abs(p.z) > 3).sort((a, b) => Math.abs(b.z) - Math.abs(a.z));
  const looStats = { rmse: Math.sqrt(sq / n), coverage95: inside / n, meanLogPredictive: lpd / n, outliers: outliers.slice(0, 20), outlierCount: outliers.length };

  // Grid and forecast
  const xMin = Math.min(...xs), xMax = Math.max(...xs);
  const horizon = Number.isFinite(Number(opts.horizon)) && opts.horizon !== null && Number(opts.horizon) >= 0 ? Number(opts.horizon) : 0.15 * xRange;
  const G = Math.max(20, Math.min(1000, Math.floor(Number(opts.gridPoints)) || DEFAULTS.gridPoints));
  const gx = Array.from({ length: G }, (_, i) => xMin + ((xMax + horizon - xMin) * i) / (G - 1));
  const unscale = (p, xv) => ({
    x: xv,
    xLabel: dateMode ? formatDate(xv, monthly) : xv,
    mean: p.mean * sdY + meanY,
    sd: Math.sqrt(p.latentVar) * sdY,
    obsSd: Math.sqrt(p.obsVar) * sdY,
    lo: (p.mean - 1.959964 * Math.sqrt(p.latentVar)) * sdY + meanY,
    hi: (p.mean + 1.959964 * Math.sqrt(p.latentVar)) * sdY + meanY,
    obsLo: (p.mean - 1.959964 * Math.sqrt(p.obsVar)) * sdY + meanY,
    obsHi: (p.mean + 1.959964 * Math.sqrt(p.obsVar)) * sdY + meanY,
  });
  const post = (xq) => (line ? predictLinearMean(name, best.theta, xs, yz, xq) : predict(name, best.theta, xs, yz, xq));
  const gridRaw = post(gx);
  const grid = gridRaw.map((p, i) => unscale(p, gx[i]));
  const trend = line ? { slope: gridRaw.beta.slope * sdY, intercept: gridRaw.beta.intercept * sdY + meanY } : null;

  const askList = Array.isArray(opts.predictAt) ? opts.predictAt : String(opts.predictAt ?? "").split(/[,;\s]+/).filter(Boolean);
  const askX = [];
  for (const a of askList) {
    const v = DATE.test(String(a).trim()) ? decimalYear(a) : Number(String(a).trim());
    if (Number.isFinite(v)) askX.push(v);
    else warnings.push(`Could not read "${a}" as an x value to predict at.`);
  }
  const predictions = askX.length ? post(askX).map((p, i) => ({ ...unscale(p, askX[i]), beyondData: askX[i] > xMax || askX[i] < xMin })) : [];
  const end = grid[grid.length - 1];

  const lenH = hyper.filter((h) => h.kind === "length");
  const noiseH = hyper.find((h) => h.kind === "noise");
  const periodH = hyper.find((h) => h.kind === "period");
  const k = kernelOf(name);
  const parts = [];
  parts.push(`Fitted ${plural(n, "point")} of ${yName} against ${xName}. ${requested === "auto" ? `Of ${plural(fits.length, "kernel")} tried, the evidence (log marginal likelihood) favours ${k.title}, ${k.blurb}${comparison[1] ? `, by ${fmt(-comparison[1].delta, 3)} log units over ${comparison[1].title}` : ""}.` : `Kernel: ${k.title}, ${k.blurb}.`}`);
  const bits = [];
  if (lenH.length) bits.push(`it changes over about ${lenH.map((h) => inX(h.value)).join(" and ")}`);
  if (periodH) bits.push(`repeats every ${inX(periodH.value, 4)}${periodH.fixed ? " (fixed)" : ""}`);
  if (noiseH) bits.push(`readings scatter around it with SD ${fmt(noiseH.value)}`);
  if (trend) bits.unshift(`a straight-line trend of ${trend.slope >= 0 ? "+" : ""}${fmt(trend.slope)} ${yName} per ${dateMode ? "year" : `${xName} unit`}`);
  if (bits.length) parts.push(`The curve: ${bits.join("; ")}.`);
  parts.push(`Leave-one-out check: ${(looStats.coverage95 * 100).toFixed(0)}% of points fall inside their 95% prediction interval when left out (about 95% means the band is honest), typical error ${fmt(looStats.rmse)}${looStats.outlierCount ? `; ${plural(looStats.outlierCount, "point")} ${looStats.outlierCount === 1 ? "lies" : "lie"} more than 3 SD from ${looStats.outlierCount === 1 ? "its" : "their"} leave-one-out prediction` : ""}.`);
  if (horizon > 0) parts.push(`At ${dateMode ? formatDate(end.x, monthly) : fmt(end.x, 4)}, ${inX(horizon)} past the last point, the curve is ${fmt(end.mean, 4)} (95% band ${fmt(end.lo, 4)} to ${fmt(end.hi, 4)}; a single new reading ${fmt(end.obsLo, 4)} to ${fmt(end.obsHi, 4)}).`);

  return {
    summary: parts.join(" "),
    n,
    xName,
    yName,
    dateMode,
    kernel: name,
    mean: meanKind,
    trend,
    kernelTitle: k.title,
    kernelFormula: k.formula,
    hyperparameters: hyper,
    logMarginalLikelihood: best.lml - scaleL,
    logMarginalLikelihoodScaled: best.lml,
    comparison,
    loo: looStats,
    points,
    grid,
    predictions,
    yMean: meanY,
    ySd: sdY,
    warnings,
    params: { kernel: requested, mean: meanKind, restarts, seed, period, fixPeriod, horizon, gridPoints: G },
  };
}

/** The curve on the grid as CSV (x, mean, 95% bands for the curve and for a new reading). */
export function toCsv(result) {
  const head = ["x", "mean", "sd", "lo95", "hi95", "new_reading_lo95", "new_reading_hi95"];
  const rows = result.grid.map((g) => [result.dateMode ? g.xLabel : g.x.toFixed(6), g.mean.toFixed(6), g.sd.toFixed(6), g.lo.toFixed(6), g.hi.toFixed(6), g.obsLo.toFixed(6), g.obsHi.toFixed(6)].map(csvCell).join(","));
  return [head.join(","), ...rows].join("\n") + "\n";
}
