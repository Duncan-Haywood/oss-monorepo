// Regression discontinuity: local polynomial estimates of the jump at a
// cutoff, with the robust bias-corrected confidence interval of Calonico,
// Cattaneo & Titiunik (2014), an MSE-optimal bandwidth, the fuzzy (ratio)
// design, a bandwidth sensitivity sweep, placebo outcomes and a local
// binomial density check. Pure functions, no DOM, no network.
// Implemented from the papers' definitions; no third-party code was ported.

export const PAPERS = [
  {
    authors: "Sebastian Calonico, Matias D. Cattaneo, Rocio Titiunik",
    title: "Robust Nonparametric Confidence Intervals for Regression-Discontinuity Designs",
    venue: "Econometrica 82(6), 2295-2326",
    year: 2014,
    url: "https://doi.org/10.3982/ECTA11757",
    doi: "10.3982/ECTA11757",
    implemented: "Local polynomial estimates of order p on each side of the cutoff with triangular, Epanechnikov or uniform kernels; the bias estimate from an order q = p + 1 fit with a pilot bandwidth b; the bias-corrected estimate and the robust standard error that accounts for the variability of the bias estimate; the nearest-neighbour (J = 3) residual variance estimator and HC0-HC3; sharp and fuzzy designs (the fuzzy estimate as a ratio of two jumps, its variance by the delta method from the joint residuals).",
    deviations: "No covariate adjustment and no clustered standard errors. Checked against rdrobust 2.1.1 (Python) at fixed bandwidths; see eval/reference.json and README for the agreement.",
  },
  {
    authors: "Sebastian Calonico, Matias D. Cattaneo, Max H. Farrell",
    title: "Optimal Bandwidth Choice for Robust Bias-Corrected Inference in Regression Discontinuity Designs",
    venue: "The Econometrics Journal 23(2), 192-210",
    year: 2020,
    url: "https://doi.org/10.1093/ectj/utz022",
    doi: "10.1093/ectj/utz022",
    implemented: "The MSE-optimal bandwidth h = [V / (2(p+1) n B^2)]^(1/(2p+3)) with a common bandwidth on both sides, its bias constant B and variance constant V estimated from the data with pilot fits, and the matching pilot bandwidth b for the derivative.",
    deviations: "The plug-in steps (pilot rule of thumb, the order of the pilot fits, the regularisation term) are this tool's own reading of the papers, not a port of rdbwselect, so the automatic bandwidth is close to but not identical with rdrobust's; the README reports the gap on the test data. The estimate at any given bandwidth does match.",
  },
  {
    authors: "Justin McCrary",
    title: "Manipulation of the Running Variable in the Regression Discontinuity Design: A Density Test",
    venue: "Journal of Econometrics 142(2), 698-714",
    year: 2008,
    url: "https://doi.org/10.1016/j.jeconom.2007.05.005",
    doi: "10.1016/j.jeconom.2007.05.005",
    implemented: "The question it asks: do units bunch on one side of the cutoff?",
    deviations: "Answered here with the simpler local binomial test of Cattaneo, Titiunik & Vazquez-Bare (2017): in a narrow window around the cutoff, the count on each side should be about even if units cannot sort. McCrary's own log-density estimator is not implemented.",
  },
  {
    authors: "Matias D. Cattaneo, Rocio Titiunik, Gonzalo Vazquez-Bare",
    title: "Comparing Inference Approaches for RD Designs: A Reexamination of the Effect of Head Start on Child Mortality",
    venue: "Journal of Policy Analysis and Management 36(3), 643-681",
    year: 2017,
    url: "https://doi.org/10.1002/pam.21985",
    doi: "10.1002/pam.21985",
    implemented: "The exact binomial test of the share of units just above the cutoff (probability one half) in shrinking windows, used as the density check.",
    deviations: "Windows are fixed fractions of the bandwidth rather than the paper's data-driven window selection.",
  },
  {
    authors: "David S. Lee",
    title: "Randomized Experiments from Non-random Selection in U.S. House Elections",
    venue: "Journal of Econometrics 142(2), 675-697",
    year: 2008,
    url: "https://doi.org/10.1016/j.jeconom.2007.05.004",
    doi: "10.1016/j.jeconom.2007.05.004",
    implemented: "The incumbency design behind the example: vote margin as the running variable, the next election's vote share as the outcome.",
    deviations: "The example data are simulated from the fifth-order polynomial calibration of Lee's data used in Calonico, Cattaneo & Titiunik (2014), with a true jump of 0.04; they are not Lee's data.",
  },
];

export const KERNELS = {
  triangular: (u) => (Math.abs(u) <= 1 ? 1 - Math.abs(u) : 0),
  epanechnikov: (u) => (Math.abs(u) <= 1 ? 0.75 * (1 - u * u) : 0),
  uniform: (u) => (Math.abs(u) <= 1 ? 0.5 : 0),
};

// Own-property lookup, so a name like "constructor" is not a kernel.
const kernelOf = (name) => (Object.hasOwn(KERNELS, name) ? KERNELS[name] : null);

export const DEFAULTS = { cutoff: 0, p: 1, kernel: "triangular", vce: "nn", nnMatch: 3, alpha: 0.05 };

// ---------- CSV ----------

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let f = "";
  let q = false;
  const s = String(text ?? "").replace(/^\uFEFF/, "");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === '"' && s[i + 1] === '"') { f += '"'; i++; }
      else if (c === '"') q = false;
      else f += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(f); f = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(f); f = "";
      if (row.some((x) => x.trim() !== "")) rows.push(row);
      row = [];
    } else f += c;
  }
  row.push(f);
  if (row.some((x) => x.trim() !== "")) rows.push(row);
  if (!rows.length) throw new Error("The CSV is empty.");
  const header = rows[0].map((h) => h.trim());
  return { header, records: rows.slice(1).map((r) => Object.fromEntries(header.map((h, j) => [h, (r[j] ?? "").trim()]))) };
}

export const num = (v) => {
  if (v === null || v === undefined) return NaN;
  if (typeof v === "number") return v;
  const t = String(v).trim();
  if (t === "" || /^(na|nan|null|-)$/i.test(t)) return NaN;
  return Number(t.replace(/,/g, ""));
};

// ---------- numerics ----------

export function normalCdf(x) {
  return 0.5 * erfc(-x / Math.SQRT2);
}

function erfc(x) {
  if (x < 0) return 2 - erfc(-x);
  if (x < 3) {
    let sum = 0, term = x, n = 0;
    while (Math.abs(term) > 1e-17 * Math.abs(sum) || n < 3) {
      sum += term / (2 * n + 1);
      n++;
      term *= (-x * x) / n;
      if (n > 200) break;
    }
    return 1 - (2 / Math.sqrt(Math.PI)) * sum;
  }
  const tiny = 1e-300;
  let f = x, C = x, D = 0;
  for (let i = 1; i < 300; i++) {
    const a = i / 2;
    D = x + a * D; D = Math.abs(D) < tiny ? tiny : D; D = 1 / D;
    C = x + a / C; C = Math.abs(C) < tiny ? tiny : C;
    const delta = C * D;
    f *= delta;
    if (Math.abs(delta - 1) < 1e-16) break;
  }
  return Math.exp(-x * x) / (f * Math.sqrt(Math.PI));
}

export function normalQuantile(p) {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2, -3.066479806614716e1, 2.506628277459239];
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
  const pl = 0.02425;
  let x;
  if (p < pl) { const q = Math.sqrt(-2 * Math.log(p)); x = (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
  else if (p <= 1 - pl) { const q = p - 0.5, r = q * q; x = ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1); }
  else { const q = Math.sqrt(-2 * Math.log(1 - p)); x = -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
  const e = normalCdf(x) - p;
  const u = e * Math.sqrt(2 * Math.PI) * Math.exp((x * x) / 2);
  return x - u / (1 + (x * u) / 2);
}

// Exact two-sided binomial test of k successes in n trials at probability 1/2
// (the sum of the probabilities no larger than that of k).
export function binomialTwoSided(k, n) {
  if (n === 0) return 1;
  const logC = new Array(n + 1);
  logC[0] = 0;
  for (let i = 1; i <= n; i++) logC[i] = logC[i - 1] + Math.log((n - i + 1) / i);
  const lp = (i) => logC[i] - n * Math.LN2;
  const ref = lp(k) + 1e-9;
  let s = 0;
  for (let i = 0; i <= n; i++) if (lp(i) <= ref) s += Math.exp(lp(i));
  return Math.min(1, s);
}

// Inverse of a small symmetric positive definite matrix by Gauss-Jordan with
// partial pivoting. Throws when the matrix is singular (too few distinct
// points inside the bandwidth for the polynomial order).
export function invert(A) {
  const n = A.length;
  const M = A.map((r, i) => [...r, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))]);
  const scale = Math.max(...A.map((r) => Math.max(...r.map(Math.abs)))) || 1;
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
    if (Math.abs(M[piv][c]) < 1e-12 * scale) throw new Error("Too few distinct running-variable values inside the bandwidth for this polynomial order; widen the bandwidth or lower p.");
    [M[c], M[piv]] = [M[piv], M[c]];
    const d = M[c][c];
    for (let j = 0; j < 2 * n; j++) M[c][j] /= d;
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r][c];
      if (f !== 0) for (let j = 0; j < 2 * n; j++) M[r][j] -= f * M[c][j];
    }
  }
  return M.map((r) => r.slice(n));
}

// ---------- local polynomial pieces ----------

// One side's local polynomial fit of order `order` at bandwidth `h`: returns,
// for every observation on the side, the weight it gets in each coefficient
// (row k of Gamma^{-1} R' W), so every estimate is an explicit linear
// combination of the outcomes. Design uses u = (x - c) / h for conditioning;
// coefficient k is then the k-th derivative / k! times h^k.
function sideFit(xs, c, h, order, kern) {
  const n = xs.length;
  const dim = order + 1;
  const G = Array.from({ length: dim }, () => new Array(dim).fill(0));
  const R = new Array(n);
  const w = new Float64Array(n);
  let used = 0;
  for (let i = 0; i < n; i++) {
    const u = (xs[i] - c) / h;
    const wi = kern(u) / h;
    w[i] = wi;
    const r = new Array(dim);
    r[0] = 1;
    for (let k = 1; k < dim; k++) r[k] = r[k - 1] * u;
    R[i] = r;
    if (wi > 0) {
      used++;
      for (let a = 0; a < dim; a++) for (let b = a; b < dim; b++) G[a][b] += wi * r[a] * r[b];
    }
  }
  for (let a = 0; a < dim; a++) for (let b = 0; b < a; b++) G[a][b] = G[b][a];
  const Gi = invert(G);
  // coefficient weights: coef[k][i] = (Gi R_i)_k w_i
  const coef = Array.from({ length: dim }, () => new Float64Array(n));
  for (let i = 0; i < n; i++) {
    if (w[i] === 0) continue;
    for (let k = 0; k < dim; k++) {
      let s = 0;
      for (let j = 0; j < dim; j++) s += Gi[k][j] * R[i][j];
      coef[k][i] = s * w[i];
    }
  }
  return { coef, Gi, R, w, used };
}

const dot = (a, y) => {
  let s = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== 0) s += a[i] * y[i];
  return s;
};

// Weights for the conventional estimate of the side's limit m(c) (order p, h)
// and for the bias-corrected one (minus the estimated leading bias, which
// uses the order-q fit at b), per Calonico, Cattaneo & Titiunik (2014).
function sideWeights(xs, c, h, b, p, q, kern) {
  const fp = sideFit(xs, c, h, p, kern);
  const fq = sideFit(xs, c, b, q, kern);
  const n = xs.length;
  // Lambda = sum_i w_i R_i u_i^{p+1}; bias constant = e0' Gi Lambda
  const dim = p + 1;
  const lam = new Array(dim).fill(0);
  for (let i = 0; i < n; i++) {
    if (fp.w[i] === 0) continue;
    const up1 = fp.R[i][p] * ((xs[i] - c) / h);
    for (let k = 0; k < dim; k++) lam[k] += fp.w[i] * fp.R[i][k] * up1;
  }
  let biasConst = 0;
  for (let k = 0; k < dim; k++) biasConst += fp.Gi[0][k] * lam[k];
  // order-q coefficient p+1 in b-units equals m^{(p+1)}/(p+1)! * b^{p+1}
  const rho = Math.pow(h / b, p + 1);
  const conv = fp.coef[0];
  const bc = new Float64Array(n);
  for (let i = 0; i < n; i++) bc[i] = conv[i] - biasConst * rho * fq.coef[p + 1][i];
  return { conv, bc, nh: fp.used, nb: fq.used, fp, fq };
}

// Residual-variance estimates for one side. "nn": the nearest-neighbour
// estimator of CCT (2014), J matches on the same side (ties at the J-th
// distance all included); "hc0".."hc3": squared residuals from the given fit.
function nnResiduals(xs, ys, J) {
  const n = xs.length;
  const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => xs[a] - xs[b]);
  const sx = order.map((i) => xs[i]);
  const out = ys.map(() => new Float64Array(n));
  for (let pos = 0; pos < n; pos++) {
    // expand left/right pointers to the J nearest, then take ties at the boundary
    let lo = pos - 1, hi = pos + 1, taken = 0, last = 0;
    const idx = [];
    while (taken < J && (lo >= 0 || hi < n)) {
      const dl = lo >= 0 ? sx[pos] - sx[lo] : Infinity;
      const dr = hi < n ? sx[hi] - sx[pos] : Infinity;
      if (dl <= dr) { idx.push(lo); last = dl; lo--; } else { idx.push(hi); last = dr; hi++; }
      taken++;
    }
    while (lo >= 0 && sx[pos] - sx[lo] === last) { idx.push(lo); lo--; }
    while (hi < n && sx[hi] - sx[pos] === last) { idx.push(hi); hi++; }
    const m = idx.length;
    if (m === 0) continue;
    for (let v = 0; v < ys.length; v++) {
      let mean = 0;
      for (const j of idx) mean += ys[v][order[j]];
      mean /= m;
      out[v][order[pos]] = Math.sqrt(m / (m + 1)) * (ys[v][order[pos]] - mean);
    }
  }
  return out; // signed "residuals" whose products estimate (co)variances
}

function hcResiduals(fit, ys, vce) {
  // residuals from the side's local fit, scaled for HC1-HC3 by leverage
  const n = ys[0].length;
  const dim = fit.Gi.length;
  // HC1 scales by the observation count in the max(h, b) window, as rdrobust does
  const N = n;
  const out = ys.map(() => new Float64Array(n));
  const coefs = ys.map((y) => fit.coef.map((cw) => dot(cw, y)));
  for (let i = 0; i < n; i++) {
    if (fit.w[i] === 0) continue;
    let lev = 0;
    for (let a = 0; a < dim; a++) for (let b = 0; b < dim; b++) lev += fit.R[i][a] * fit.Gi[a][b] * fit.R[i][b];
    lev *= fit.w[i];
    let s = 1;
    if (vce === "hc1") s = Math.sqrt(N / (N - dim));
    else if (vce === "hc2") s = 1 / Math.sqrt(1 - lev);
    else if (vce === "hc3") s = 1 / (1 - lev);
    for (let v = 0; v < ys.length; v++) {
      let pred = 0;
      for (let k = 0; k < dim; k++) pred += fit.R[i][k] * coefs[v][k];
      out[v][i] = s * (ys[v][i] - pred);
    }
  }
  return out;
}

// Variance of sum_i a_i Y_i (and covariance with sum_i b_i D_i) from residuals.
const quad = (a, ea, b, eb) => {
  let s = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== 0 && b[i] !== 0) s += a[i] * b[i] * ea[i] * eb[i];
  return s;
};

// ---------- the estimate at given bandwidths ----------

function splitSides(x, ys, c) {
  const L = { x: [], ys: ys.map(() => []) };
  const Rr = { x: [], ys: ys.map(() => []) };
  for (let i = 0; i < x.length; i++) {
    const S = x[i] >= c ? Rr : L;
    S.x.push(x[i]);
    ys.forEach((y, v) => S.ys[v].push(y[i]));
  }
  return { L, R: Rr };
}

/**
 * Local polynomial RD estimate at bandwidths h (estimation) and b (bias).
 * x: running variable, y: outcome, d: optional take-up for a fuzzy design.
 * Returns conventional, bias-corrected and robust estimates and standard errors.
 */
export function rdEstimate({ x, y, d = null, cutoff = 0, h, b = null, p = 1, kernel = "triangular", vce = "nn", nnMatch = 3, alpha = 0.05 }) {
  if (!(h > 0)) throw new Error("The bandwidth h must be positive.");
  const bb = b ?? h;
  const q = p + 1;
  const kern = kernelOf(kernel);
  if (!kern) throw new Error(`Unknown kernel ${kernel}; use triangular, epanechnikov or uniform.`);
  const ys = d ? [y, d] : [y];
  // Only observations within max(h, b) of the cutoff carry weight; the
  // nearest-neighbour residuals are matched within that window too.
  const win = Math.max(h, bb);
  const keep = x.map((_, i) => i).filter((i) => Math.abs(x[i] - cutoff) <= win);
  const { L, R } = splitSides(keep.map((i) => x[i]), ys.map((yy) => keep.map((i) => yy[i])), cutoff);
  const total = splitSides(x, [x], cutoff);
  if (L.x.length < q + 2 || R.x.length < q + 2) throw new Error("Need at least a few observations on each side of the cutoff.");
  const sides = [L, R].map((S) => {
    const sw = sideWeights(S.x, cutoff, h, bb, p, q, kern);
    let resConv, resRob;
    if (vce === "nn") resConv = resRob = nnResiduals(S.x, S.ys, nnMatch);
    else {
      resConv = hcResiduals(sw.fp, S.ys, vce);
      resRob = hcResiduals(sw.fq, S.ys, vce);
    }
    const est = S.ys.map((yy) => ({ conv: dot(sw.conv, yy), bc: dot(sw.bc, yy) }));
    // covariance matrices (k x k for k outcomes) of the conventional and robust estimates
    const k = S.ys.length;
    const Vc = Array.from({ length: k }, (_, a) => Array.from({ length: k }, (_, bI) => quad(sw.conv, resConv[a], sw.conv, resConv[bI])));
    const Vr = Array.from({ length: k }, (_, a) => Array.from({ length: k }, (_, bI) => quad(sw.bc, resRob[a], sw.bc, resRob[bI])));
    return { est, Vc, Vr, nh: sw.nh, nb: sw.nb };
  });
  const [l, r] = sides;
  const jump = (v, kind) => r.est[v][kind] - l.est[v][kind];
  const V = (kind, a, bI) => r[kind][a][bI] + l[kind][a][bI];
  const z = normalQuantile(1 - alpha / 2);
  let conv, bc, seC, seR, firstStage = null;
  if (!d) {
    conv = jump(0, "conv");
    bc = jump(0, "bc");
    seC = Math.sqrt(V("Vc", 0, 0));
    seR = Math.sqrt(V("Vr", 0, 0));
  } else {
    const ty = jump(0, "conv"), td = jump(1, "conv");
    const tyb = jump(0, "bc"), tdb = jump(1, "bc");
    if (Math.abs(td) < 1e-12) throw new Error("Take-up does not jump at the cutoff, so the fuzzy estimate is undefined.");
    conv = ty / td;
    // bias of the ratio by the delta method around the conventional jumps
    bc = conv - ((ty - tyb) / td - (ty * (td - tdb)) / (td * td));
    // delta method: gradient (1/td, -ty/td^2) at the conventional estimates,
    // as in the fuzzy RD variance of CCT (2014)
    const g = (vy, vd) => (kind) => (vy * vy * V(kind, 0, 0) + 2 * vy * vd * V(kind, 0, 1) + vd * vd * V(kind, 1, 1));
    seC = Math.sqrt(g(1 / td, -ty / (td * td))("Vc"));
    seR = Math.sqrt(g(1 / td, -ty / (td * td))("Vr"));
    const fsSe = Math.sqrt(V("Vc", 1, 1));
    const fsSeR = Math.sqrt(V("Vr", 1, 1));
    firstStage = { conventional: td, se: fsSe, biasCorrected: tdb, robustSe: fsSeR, robustCi: [tdb - z * fsSeR, tdb + z * fsSeR] };
  }
  const pv = (t, s) => 2 * (1 - normalCdf(Math.abs(t / s)));
  return {
    h, b: bb, p, q, kernel, vce, cutoff,
    n: { left: total.L.x.length, right: total.R.x.length, leftInH: l.nh, rightInH: r.nh, leftInB: l.nb, rightInB: r.nb },
    conventional: { estimate: conv, se: seC, ci: [conv - z * seC, conv + z * seC], pValue: pv(conv, seC) },
    biasCorrected: { estimate: bc, se: seC, ci: [bc - z * seC, bc + z * seC] },
    robust: { estimate: bc, se: seR, ci: [bc - z * seR, bc + z * seR], pValue: pv(bc, seR) },
    firstStage,
    sides: { left: l.est.map((e) => e.conv), right: r.est.map((e) => e.conv) },
  };
}

// ---------- MSE-optimal bandwidth ----------

const KCONST = { triangular: 2.702, epanechnikov: 2.345, uniform: 1.843 };

function quantileSorted(s, p) {
  const pos = (s.length - 1) * p;
  const lo = Math.floor(pos);
  return s[lo] + (s[Math.min(lo + 1, s.length - 1)] - s[lo]) * (pos - lo);
}

function sd(a) {
  const m = a.reduce((s, v) => s + v, 0) / a.length;
  return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / (a.length - 1));
}

// The coefficient of order k of the side fit (in true units, i.e. m^(k)(c)/k!)
// and its variance from nearest-neighbour residuals.
function derivative(S, c, bw, order, k, kern, J) {
  const f = sideFit(S.x, c, bw, order, kern);
  const scale = Math.pow(bw, k);
  const wts = f.coef[k].map((v) => v / scale);
  const [res] = nnResiduals(S.x, [S.y], J);
  return { value: dot(wts, S.y), variance: quad(wts, res, wts, res), fit: f };
}

// e_nu' Gamma^{-1} Lambda for an order `order` fit at bandwidth bw: the
// leading bias of coefficient nu is this times m^(order+1)/(order+1)! * bw^(order+1-nu).
function biasConstant(S, c, bw, order, nu, kern) {
  const f = sideFit(S.x, c, bw, order, kern);
  const dim = order + 1;
  const lam = new Array(dim).fill(0);
  for (let i = 0; i < S.x.length; i++) {
    if (f.w[i] === 0) continue;
    const un = f.R[i][order] * ((S.x[i] - c) / bw);
    for (let a = 0; a < dim; a++) lam[a] += f.w[i] * f.R[i][a] * un;
  }
  let s = 0;
  for (let a = 0; a < dim; a++) s += f.Gi[nu][a] * lam[a];
  return s;
}

// MSE-optimal bandwidth for coefficient nu of an order-`order` local fit of
// the jump (right minus left), given estimates m[side] = {value, variance} of
// m^(order+1)/(order+1)! on each side:
//   MSE(t) = t^(2(order+1-nu)) (B^2 + 3R) + V / (n t^(2nu+1)),
// B the leading bias, R the variance of its estimate (a regularisation that
// keeps t finite when B is near zero; the factor 3 is the one CCT's software
// documentation describes), V the variance constant at the pilot c0.
function mseBandwidth(sides, cutoff, c0, order, nu, m, kern, J, n) {
  const bc = sides.map((S) => biasConstant(S, cutoff, c0, order, nu, kern));
  const B = bc[1] * m[1].value - bc[0] * m[0].value;
  const R = bc[1] ** 2 * m[1].variance + bc[0] ** 2 * m[0].variance;
  const V = sides.reduce((s, S) => s + derivative(S, cutoff, c0, order, nu, kern, J).variance, 0) * n * Math.pow(c0, 2 * nu + 1);
  const t = Math.pow(((2 * nu + 1) * V) / (2 * (order + 1 - nu) * n * (B * B + 3 * R)), 1 / (2 * order + 3));
  return { bw: t, B, R, V };
}

/**
 * A common MSE-optimal bandwidth h for the jump and a pilot bandwidth b for
 * its bias correction, by plug-in (CCT 2014; Calonico, Cattaneo & Farrell 2020):
 *   1. pilot c = C_K * min(sd, IQR/1.349) * n^(-1/5) for the variance terms;
 *   2. m^(q+2) on each side from a global polynomial of order q+2 (rule of thumb);
 *   3. d, MSE-optimal for m^(q+1) from an order q+1 local fit; estimate m^(q+1) at d;
 *   4. b, MSE-optimal for m^(p+1) from the order-q fit; estimate m^(p+1) at b;
 *   5. h, MSE-optimal for the jump from the order-p fit.
 * Not a port of rdbwselect: on the six test designs in eval/ it lands at
 * 0.75-1.06 times rdbwselect's mserd h (README, "How close").
 */
export function selectBandwidth({ x, y, cutoff = 0, p = 1, kernel = "triangular", nnMatch = 3 }) {
  const kern = kernelOf(kernel);
  if (!kern) throw new Error(`Unknown kernel ${kernel}; use triangular, epanechnikov or uniform.`);
  const q = p + 1;
  const n = x.length;
  const sides = [[], []].map(() => ({ x: [], y: [] }));
  for (let i = 0; i < n; i++) {
    const S = sides[x[i] >= cutoff ? 1 : 0];
    S.x.push(x[i]);
    S.y.push(y[i]);
  }
  if (sides.some((S) => S.x.length < q + 4)) throw new Error("Too few observations on one side of the cutoff to choose a bandwidth; give one with --h.");
  const sorted = [...x].sort((a, b) => a - b);
  const iqr = quantileSorted(sorted, 0.75) - quantileSorted(sorted, 0.25);
  const spread = Math.min(sd(x), iqr > 0 ? iqr / 1.349 : Infinity);
  const range = Math.max(cutoff - sorted[0], sorted[n - 1] - cutoff);
  const cap = (v) => (Number.isFinite(v) ? Math.min(Math.max(v, range * 1e-6), range) : range);
  const c0 = cap((Object.hasOwn(KCONST, kernel) ? KCONST[kernel] : KCONST.triangular) * spread * Math.pow(n, -1 / 5));
  const J = nnMatch;
  const est = (bw, order, k) => sides.map((S) => {
    const reach = Math.max(...S.x.map((v) => Math.abs(v - cutoff)));
    const t = Math.min(bw, reach * (1 + 1e-9));
    const r = derivative(S, cutoff, t, order, k, bw === Infinity ? KERNELS.uniform : kern, J);
    return { value: r.value, variance: r.variance };
  });
  const m3 = est(Infinity, q + 2, q + 2);
  const d = cap(mseBandwidth(sides, cutoff, c0, q + 1, q + 1, m3, kern, J, n).bw);
  const m2 = est(d, q + 1, q + 1);
  const bStep = mseBandwidth(sides, cutoff, c0, q, p + 1, m2, kern, J, n);
  const b = cap(bStep.bw);
  const m1 = est(b, q, p + 1);
  const hStep = mseBandwidth(sides, cutoff, c0, p, 0, m1, kern, J, n);
  const h = cap(hStep.bw);
  return { h, b: Math.max(b, h), pilot: c0, d, bias: hStep.B, regularisation: hStep.R, variance: hStep.V };
}

// ---------- the whole analysis ----------

function sideLines(x, y, c, h, p, kernel) {
  const kern = kernelOf(kernel);
  const out = {};
  for (const [name, test] of [["left", (v) => v < c], ["right", (v) => v >= c]]) {
    const xs = [], ys = [];
    x.forEach((v, i) => { if (test(v)) { xs.push(v); ys.push(y[i]); } });
    try {
      const f = sideFit(xs, c, h, p, kern);
      const beta = f.coef.map((cw) => dot(cw, ys));
      const lo = name === "left" ? Math.max(c - h, Math.min(...xs)) : c;
      const hi = name === "left" ? c : Math.min(c + h, Math.max(...xs));
      out[name] = Array.from({ length: 25 }, (_, k) => {
        const xv = lo + ((hi - lo) * k) / 24;
        const u = (xv - c) / h;
        let yv = 0, pw = 1;
        for (const bk of beta) { yv += bk * pw; pw *= u; }
        return [xv, yv];
      });
    } catch {
      out[name] = [];
    }
  }
  return out;
}

export function binnedMeans(x, y, c, bins = 20) {
  const out = [];
  for (const side of ["left", "right"]) {
    const idx = x.map((_, i) => i).filter((i) => (side === "left" ? x[i] < c : x[i] >= c));
    if (!idx.length) continue;
    const lo = side === "left" ? Math.min(...idx.map((i) => x[i])) : c;
    const hi = side === "left" ? c : Math.max(...idx.map((i) => x[i]));
    const width = (hi - lo) / bins || 1;
    const acc = Array.from({ length: bins }, () => ({ n: 0, sx: 0, sy: 0 }));
    for (const i of idx) {
      const k = Math.min(bins - 1, Math.max(0, Math.floor((x[i] - lo) / width)));
      acc[k].n++; acc[k].sx += x[i]; acc[k].sy += y[i];
    }
    for (const a of acc) if (a.n) out.push({ side, x: a.sx / a.n, y: a.sy / a.n, n: a.n });
  }
  return out;
}

/**
 * McCrary (2008) density test: a histogram with bins of width
 * 2 sd(x) n^(-1/2) that never straddle the cutoff, a local linear regression
 * (triangular kernel, bandwidth `bw`) of the normalised bin heights on each
 * side, and theta = ln f+ - ln f- with McCrary's asymptotic standard error
 * sqrt((1/(n bw)) (24/5) (1/f+ + 1/f-)).
 */
export function mccrary(x, c, bw) {
  const n = x.length;
  const w = 2 * sd(x) * Math.pow(n, -1 / 2);
  const lo = Math.min(...x), hi = Math.max(...x);
  const counts = new Map();
  for (const v of x) {
    const k = Math.floor((v - c) / w);
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  const kmin = Math.floor((lo - c) / w), kmax = Math.floor((hi - c) / w);
  const fit = (keys) => {
    const xs = keys.map((k) => c + (k + 0.5) * w);
    const ys = keys.map((k) => (counts.get(k) || 0) / (n * w));
    const f = sideFit(xs, c, bw, 1, KERNELS.triangular);
    return dot(f.coef[0], ys);
  };
  const left = [], right = [];
  for (let k = kmin; k <= kmax; k++) (k < 0 ? left : right).push(k);
  let fl, fr;
  try {
    fl = fit(left);
    fr = fit(right);
  } catch {
    return null;
  }
  if (!(fl > 0 && fr > 0)) return { binWidth: w, bandwidth: bw, left: fl, right: fr, theta: NaN, se: NaN, pValue: NaN };
  const theta = Math.log(fr) - Math.log(fl);
  const se = Math.sqrt((1 / (n * bw)) * (24 / 5) * (1 / fr + 1 / fl));
  return { binWidth: w, bandwidth: bw, left: fl, right: fr, theta, se, pValue: 2 * (1 - normalCdf(Math.abs(theta / se))) };
}

export function densityCheck(x, c, h) {
  return [0.25, 0.5, 1].map((f) => {
    const w = h * f;
    let below = 0, above = 0;
    for (const v of x) {
      if (v >= c && v <= c + w) above++;
      else if (v < c && v >= c - w) below++;
    }
    return { window: w, below, above, share: above / Math.max(1, below + above), pValue: binomialTwoSided(above, below + above) };
  });
}

const fmt = (v, d = 3) => (Number.isFinite(v) ? Number(v.toFixed(d)).toString() : "n/a");

/**
 * Full analysis from a CSV: bandwidths, the estimate, a sweep over
 * bandwidths, placebo cutoffs, covariate balance, a density check and plot data.
 */
export function analyze(input = {}) {
  const o = { ...DEFAULTS, ...Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined && v !== null && v !== "")) };
  const p = Number(o.p);
  if (![0, 1, 2, 3, 4].includes(p)) throw new Error("The polynomial order p must be 0, 1, 2, 3 or 4.");
  if (!kernelOf(o.kernel)) throw new Error("kernel must be triangular, epanechnikov or uniform.");
  if (!["nn", "hc0", "hc1", "hc2", "hc3"].includes(o.vce)) throw new Error("vce must be nn, hc0, hc1, hc2 or hc3.");
  const alpha = Number(o.alpha);
  if (!(alpha > 0 && alpha < 1)) throw new Error("alpha must be between 0 and 1.");
  const cutoff = num(o.cutoff);
  if (!Number.isFinite(cutoff)) throw new Error("The cutoff must be a number.");
  const { header, records } = parseCsv(o.csv);
  for (const [k, label] of [["running", "running variable"], ["outcome", "outcome"]]) {
    if (!o[k]) throw new Error(`Name the ${label} column.`);
    if (!header.includes(o[k])) throw new Error(`No column named "${o[k]}" (columns: ${header.join(", ")}).`);
  }
  if (o.treatment && !header.includes(o.treatment)) throw new Error(`No column named "${o.treatment}".`);
  const covariates = (Array.isArray(o.covariates) ? o.covariates : String(o.covariates || "").split(/\s*,\s*/)).map((s) => s.trim()).filter(Boolean);
  for (const cv of covariates) if (!header.includes(cv)) throw new Error(`No covariate column named "${cv}".`);
  const notes = [];
  const rows = records.map((r) => ({ x: num(r[o.running]), y: num(r[o.outcome]), d: o.treatment ? num(r[o.treatment]) : 0, r }));
  const ok = rows.filter((r) => Number.isFinite(r.x) && Number.isFinite(r.y) && Number.isFinite(r.d));
  if (ok.length < rows.length) notes.push(`${rows.length - ok.length} rows with a missing or non-numeric running variable, outcome${o.treatment ? " or treatment" : ""} were left out.`);
  const x = ok.map((r) => r.x), y = ok.map((r) => r.y);
  const d = o.treatment ? ok.map((r) => r.d) : null;
  const nl = x.filter((v) => v < cutoff).length, nr = x.length - nl;
  if (nl < 10 || nr < 10) throw new Error(`Need at least 10 observations on each side of the cutoff (found ${nl} below and ${nr} at or above ${cutoff}).`);
  const distinct = new Set(x).size;
  if (distinct < x.length * 0.5) notes.push(`The running variable has ${distinct} distinct values for ${x.length} rows (mass points). The nearest-neighbour variance counts ties as neighbours; rdrobust's default instead adjusts for mass points, so its numbers can differ. With very few values near the cutoff, a local-randomisation analysis may suit better.`);
  const common = { cutoff, p, kernel: o.kernel, nnMatch: Number(o.nnMatch) || 3 };
  let bw;
  const hIn = num(o.h), bIn = num(o.b);
  if (Number.isFinite(hIn) && hIn > 0) {
    bw = { h: hIn, b: Number.isFinite(bIn) && bIn > 0 ? bIn : hIn, chosen: "given" };
  } else {
    const s = selectBandwidth({ x, y, ...common });
    bw = { h: s.h, b: Number.isFinite(bIn) && bIn > 0 ? bIn : s.b, chosen: "mse", pilot: s.pilot };
    if (d) notes.push("Fuzzy design: the bandwidth is chosen for the outcome's jump (the reduced form) and shared by the take-up equation.");
  }
  const est = (args) => rdEstimate({ x, y, d, ...common, vce: o.vce, alpha, ...args });
  const main = est({ h: bw.h, b: bw.b });
  const ratio = bw.b / bw.h;
  const sweep = [0.5, 0.625, 0.75, 0.875, 1, 1.25, 1.5, 1.75, 2].map((f) => {
    try {
      const r = est({ h: bw.h * f, b: bw.h * f * ratio });
      return { h: bw.h * f, estimate: r.conventional.estimate, robustEstimate: r.robust.estimate, ci: r.robust.ci, inH: r.n.leftInH + r.n.rightInH };
    } catch (e) {
      return { h: bw.h * f, error: e.message };
    }
  });
  const placebo = [];
  for (const side of ["left", "right"]) {
    const xs = [], ys = [];
    x.forEach((v, i) => { if (side === "left" ? v < cutoff : v >= cutoff) { xs.push(v); ys.push(y[i]); } });
    const sorted = [...xs].sort((a, b) => a - b);
    const pc = quantileSorted(sorted, 0.5);
    try {
      const sb = selectBandwidth({ x: xs, y: ys, ...common, cutoff: pc });
      const r = rdEstimate({ x: xs, y: ys, ...common, cutoff: pc, vce: o.vce, alpha, h: sb.h, b: sb.b });
      placebo.push({ side, cutoff: pc, h: sb.h, estimate: r.robust.estimate, ci: r.robust.ci, pValue: r.robust.pValue });
    } catch (e) {
      placebo.push({ side, cutoff: pc, error: e.message });
    }
  }
  const balance = covariates.map((cv) => {
    const pairs = ok.map((r) => [r.x, num(r.r[cv])]).filter(([, v]) => Number.isFinite(v));
    try {
      const cx = pairs.map((q) => q[0]), cy = pairs.map((q) => q[1]);
      const sb = selectBandwidth({ x: cx, y: cy, ...common });
      const r = rdEstimate({ x: cx, y: cy, ...common, vce: o.vce, alpha, h: sb.h, b: sb.b });
      return { covariate: cv, h: sb.h, estimate: r.robust.estimate, ci: r.robust.ci, pValue: r.robust.pValue };
    } catch (e) {
      return { covariate: cv, error: e.message };
    }
  });
  const density = densityCheck(x, cutoff, bw.h);
  // McCrary's bandwidth: twice the outcome's h, so each side has enough bins
  const mc = mccrary(x, cutoff, 2 * bw.h);
  const plot = { bins: binnedMeans(x, y, cutoff), lines: sideLines(x, y, cutoff, bw.h, p, o.kernel), takeUp: d ? binnedMeans(x, d, cutoff) : null };

  const R = main.robust;
  const lvl = Math.round((1 - alpha) * 100);
  const what = d ? "local average treatment effect for units whose take-up switches at the cutoff" : "jump in the outcome at the cutoff";
  const sig = R.ci[0] > 0 || R.ci[1] < 0;
  const parts = [`Estimated ${what}: ${fmt(main.conventional.estimate, 4)} (bias-corrected ${fmt(R.estimate, 4)}; ${lvl}% robust CI ${fmt(R.ci[0], 4)} to ${fmt(R.ci[1], 4)}, ${R.pValue < 0.0001 ? "p < 0.0001" : `p = ${fmt(R.pValue, 4)}`}).`];
  parts.push(sig ? `The robust interval excludes zero.` : `The robust interval includes zero, so the data are consistent with no ${d ? "effect" : "jump"}.`);
  parts.push(`It uses ${main.n.leftInH} observations below and ${main.n.rightInH} above within h = ${fmt(bw.h, 4)} of ${cutoff} (${bw.chosen === "mse" ? "MSE-optimal" : "given"}), a local ${["constant", "linear", "quadratic", "cubic", "quartic"][p]} fit and a ${o.kernel} kernel.`);
  const sw = sweep.filter((s) => !s.error);
  if (sw.length > 2) {
    const signs = new Set(sw.map((s) => Math.sign(s.estimate)));
    parts.push(signs.size > 1 ? "The estimate changes sign across bandwidths from half to twice h: treat it as fragile." : `Across bandwidths from half to twice h the estimate stays between ${fmt(Math.min(...sw.map((s) => s.estimate)), 4)} and ${fmt(Math.max(...sw.map((s) => s.estimate)), 4)}.`);
  }
  if (mc && mc.pValue < 0.05) parts.push(`The density of the running variable jumps at the cutoff (McCrary log difference ${fmt(mc.theta, 3)}, p = ${fmt(mc.pValue, 4)}); if units can choose their side, the design is in doubt.`);
  else if (mc && Number.isFinite(mc.pValue)) parts.push(`No sign of bunching at the cutoff (McCrary log density difference ${fmt(mc.theta, 3)}, p = ${fmt(mc.pValue, 3)}).`);
  const badPlacebo = placebo.filter((q) => q.pValue < 0.05);
  if (badPlacebo.length) parts.push(`A placebo cutoff (${badPlacebo.map((q) => fmt(q.cutoff, 4)).join(", ")}) also shows a jump, a sign the fit is picking up curvature rather than the cutoff.`);
  const badBal = balance.filter((q) => q.pValue < 0.05);
  if (badBal.length) parts.push(`Covariate ${badBal.map((q) => q.covariate).join(", ")} jumps at the cutoff, which a valid design would not show.`);
  if (main.firstStage) parts.push(`Take-up jumps by ${fmt(main.firstStage.conventional, 4)} at the cutoff${Math.abs(main.firstStage.conventional) < 0.1 ? ", a weak first stage, so the ratio is unstable" : ""}.`);
  return {
    summary: parts.join(" "),
    options: { cutoff, p, q: p + 1, kernel: o.kernel, vce: o.vce, alpha, running: o.running, outcome: o.outcome, treatment: o.treatment || null },
    bandwidth: bw,
    n: main.n,
    conventional: main.conventional,
    biasCorrected: main.biasCorrected,
    robust: main.robust,
    firstStage: main.firstStage,
    limits: main.sides,
    sweep,
    placebo,
    balance,
    density,
    mccrary: mc,
    plot,
    notes,
    papers: PAPERS.map((q) => ({ authors: q.authors, year: q.year, title: q.title, url: q.url })),
  };
}
