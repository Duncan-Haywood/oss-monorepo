// Random-effects meta-analysis: pool study results, measure how much they disagree,
// predict the next study, test for small-study effects, and explain heterogeneity
// with a moderator. Pure functions, no DOM, no network, deterministic.
//
// Implemented from the papers' mathematics (PAPERS below); no third-party code was
// ported. statsmodels 0.15 (BSD-3-Clause) and scipy (BSD-3-Clause) were used only to
// produce eval/reference.json, which the tests compare against.

export const PAPERS = [
  { key: "dersimonian1986meta", authors: "DerSimonian, R. and Laird, N.", year: 1986, title: "Meta-analysis in clinical trials", venue: "Controlled Clinical Trials 7(3), 177-188", doi: "10.1016/0197-2456(86)90046-2", url: "https://doi.org/10.1016/0197-2456(86)90046-2", implemented: "Method-of-moments estimate of the between-study variance (DL), and its extension to meta-regression." },
  { key: "viechtbauer2005bias", authors: "Viechtbauer, W.", year: 2005, title: "Bias and efficiency of meta-analytic variance estimators in the random-effects model", venue: "Journal of Educational and Behavioral Statistics 30(3), 261-293", doi: "10.3102/10769986030003261", url: "https://doi.org/10.3102/10769986030003261", implemented: "Restricted maximum likelihood (REML) for tau-squared by Fisher scoring, the default." },
  { key: "paule1982consensus", authors: "Paule, R. C. and Mandel, J.", year: 1982, title: "Consensus values and weighting factors", venue: "Journal of Research of the National Bureau of Standards 87(5), 377-385", doi: "10.6028/jres.087.022", url: "https://doi.org/10.6028/jres.087.022", implemented: "Paule-Mandel estimator: the tau-squared at which the generalised Q equals its degrees of freedom." },
  { key: "knapp2003improved", authors: "Knapp, G. and Hartung, J.", year: 2003, title: "Improved tests for a random effects meta-regression with a single covariate", venue: "Statistics in Medicine 22(17), 2693-2710", doi: "10.1002/sim.1482", url: "https://doi.org/10.1002/sim.1482", implemented: "Knapp-Hartung (Hartung-Knapp-Sidik-Jonkman) interval: variance scaled by the weighted residual mean square, t on k-p df, for the pooled effect and the meta-regression.", deviations: "Not truncated at 1 (the 'ad hoc' variant discussed by Jackson et al. 2017 is not applied), matching statsmodels and metafor's default." },
  { key: "higgins2002quantifying", authors: "Higgins, J. P. T. and Thompson, S. G.", year: 2002, title: "Quantifying heterogeneity in a meta-analysis", venue: "Statistics in Medicine 21(11), 1539-1558", doi: "10.1002/sim.1186", url: "https://doi.org/10.1002/sim.1186", implemented: "I-squared and H-squared from Q, and the typical within-study variance." },
  { key: "riley2011interpretation", authors: "Riley, R. D., Higgins, J. P. T. and Deeks, J. J.", year: 2011, title: "Interpretation of random effects meta-analyses", venue: "BMJ 342, d549", doi: "10.1136/bmj.d549", url: "https://doi.org/10.1136/bmj.d549", implemented: "Prediction interval for the true effect in a new study, t on k-2 df." },
  { key: "viechtbauer2007confidence", authors: "Viechtbauer, W.", year: 2007, title: "Confidence intervals for the amount of heterogeneity in meta-analysis", venue: "Statistics in Medicine 26(1), 37-52", doi: "10.1002/sim.2514", url: "https://doi.org/10.1002/sim.2514", implemented: "Q-profile confidence interval for tau-squared, carried over to I-squared." },
  { key: "egger1997bias", authors: "Egger, M., Davey Smith, G., Schneider, M. and Minder, C.", year: 1997, title: "Bias in meta-analysis detected by a simple, graphical test", venue: "BMJ 315(7109), 629-634", doi: "10.1136/bmj.315.7109.629", url: "https://doi.org/10.1136/bmj.315.7109.629", implemented: "Regression test for funnel-plot asymmetry: standardised effect on precision, intercept tested with t on k-2 df." },
  { key: "hedges1981distribution", authors: "Hedges, L. V.", year: 1981, title: "Distribution theory for Glass's estimator of effect size and related estimators", venue: "Journal of Educational Statistics 6(2), 107-128", doi: "10.3102/10769986006002107", url: "https://doi.org/10.3102/10769986006002107", implemented: "Hedges' g: the standardised mean difference with the small-sample correction J = 1 - 3/(4 df - 1)." },
  { key: "colditz1994efficacy", authors: "Colditz, G. A., Brewer, T. F., Berkey, C. S., Wilson, M. E., Burdick, E., Fineberg, H. V. and Mosteller, F.", year: 1994, title: "Efficacy of BCG vaccine in the prevention of tuberculosis: meta-analysis of the published literature", venue: "JAMA 271(9), 698-702", doi: "10.1001/jama.1994.03510330076038", url: "https://doi.org/10.1001/jama.1994.03510330076038", implemented: "Source of the bundled example: 13 BCG vaccine trials with absolute latitude." },
];

export const DEFAULTS = {
  csv: "",
  layout: "auto",       // auto | cells | totals | continuous | generic-se | generic-var | generic-ci
  columns: {},          // explicit column names per role, e.g. { ai: "tpos", bi: "tneg", ci: "cpos", di: "cneg" }
  measure: "auto",      // binary: RR | OR | RD; continuous: SMD | MD; generic: GEN (auto picks RR / SMD / GEN)
  ratio: "auto",        // generic layouts: are the effects ratios (pooled on the log scale)? auto | yes | no
  study: "",            // label column (default: detected; an author column is joined with a year column)
  method: "REML",       // REML | DL | PM | FE
  confidence: 0.95,
  moderator: "",        // optional numeric column for a meta-regression
  correction: 0.5,      // added to every cell of a 2x2 table with a zero cell (OR and RR)
  leaveOneOut: true,
};

export const METHODS = { REML: "restricted maximum likelihood (REML)", DL: "DerSimonian-Laird", PM: "Paule-Mandel", FE: "common (fixed) effect" };
export const MEASURES = {
  RR: { name: "risk ratio", log: true }, OR: { name: "odds ratio", log: true }, RD: { name: "risk difference", log: false },
  SMD: { name: "standardised mean difference (Hedges' g)", log: false }, MD: { name: "mean difference", log: false },
  GEN: { name: "effect", log: false }, GENLOG: { name: "ratio", log: true },
};

// ---------------------------------------------------------------- numerics

export function lgamma(x) {
  // Lanczos (g = 7, n = 9).
  const c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  if (x < 0.5) return Math.log(Math.PI / Math.abs(Math.sin(Math.PI * x))) - lgamma(1 - x);
  x -= 1;
  let a = c[0];
  const t = x + 7.5;
  for (let i = 1; i < 9; i++) a += c[i] / (x + i);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

/** Regularised upper incomplete gamma Q(a, x), series below a+1, continued fraction above. */
export function gammaQ(a, x) {
  if (x <= 0) return 1;
  if (!Number.isFinite(x)) return 0;
  const lead = -x + a * Math.log(x) - lgamma(a);
  if (x < a + 1) {
    let sum = 1 / a, term = sum, ap = a;
    for (let n = 0; n < 1000; n++) {
      ap += 1; term *= x / ap; sum += term;
      if (Math.abs(term) < Math.abs(sum) * 1e-16) break;
    }
    return 1 - sum * Math.exp(lead);
  }
  let b = x + 1 - a, c = 1e300, d = 1 / b, h = d;
  for (let i = 1; i < 1000; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b; if (Math.abs(d) < 1e-300) d = 1e-300;
    c = b + an / c; if (Math.abs(c) < 1e-300) c = 1e-300;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-16) break;
  }
  return Math.exp(lead) * h;
}

function betaCf(a, b, x) {
  // Modified Lentz continued fraction for the incomplete beta.
  const tiny = 1e-300;
  let c = 1, d = 1 - ((a + b) * x) / (a + 1);
  if (Math.abs(d) < tiny) d = tiny;
  d = 1 / d;
  let h = d;
  for (let m = 1; m < 3000; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((a + m2 - 1) * (a + m2));
    d = 1 + aa * d; if (Math.abs(d) < tiny) d = tiny;
    c = 1 + aa / c; if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d; h *= d * c;
    aa = (-(a + m) * (a + b + m) * x) / ((a + m2) * (a + m2 + 1));
    d = 1 + aa * d; if (Math.abs(d) < tiny) d = tiny;
    c = 1 + aa / c; if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-16) break;
  }
  return h;
}

/** Regularised incomplete beta I_x(a, b). */
export function betaInc(x, a, b) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const lead = Math.exp(lgamma(a + b) - lgamma(a) - lgamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  if (x < (a + 1) / (a + b + 2)) return (lead * betaCf(a, b, x)) / a;
  return 1 - (lead * betaCf(b, a, 1 - x)) / b;
}

/** Standard normal CDF, accurate in both tails. */
export function normCdf(z) {
  if (!Number.isFinite(z)) return z > 0 ? 1 : 0;
  const q = 0.5 * gammaQ(0.5, (z * z) / 2);
  return z < 0 ? q : 1 - q;
}
/** Two-sided normal p-value. */
export const normP2 = (z) => (Number.isFinite(z) ? gammaQ(0.5, (z * z) / 2) : 0);

export function normQuantile(p) {
  if (!(p > 0 && p < 1)) return p === 0 ? -Infinity : p === 1 ? Infinity : NaN;
  // Acklam's rational approximation, then Newton steps on the accurate CDF.
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  let x;
  if (p < 0.02425) {
    const q = Math.sqrt(-2 * Math.log(p));
    x = (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  } else if (p <= 0.97575) {
    const q = p - 0.5, r = q * q;
    x = (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  } else {
    const q = Math.sqrt(-2 * Math.log(1 - p));
    x = -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  for (let i = 0; i < 3; i++) x -= (normCdf(x) - p) / (Math.exp((-x * x) / 2) / Math.sqrt(2 * Math.PI));
  return x;
}

/** Student t CDF. */
export function tCdf(t, df) {
  if (!Number.isFinite(df) || df > 1e7) return normCdf(t);
  if (!Number.isFinite(t)) return t > 0 ? 1 : 0;
  const tail = 0.5 * betaInc(df / (df + t * t), df / 2, 0.5);
  return t > 0 ? 1 - tail : tail;
}
/** Two-sided t p-value. */
export const tP2 = (t, df) => (!Number.isFinite(df) || df > 1e7 ? normP2(t) : Number.isFinite(t) ? betaInc(df / (df + t * t), df / 2, 0.5) : 0);

const quantCache = new Map();
/** Student t quantile, by bisection on the CDF (exact to ~1e-13). */
export function tQuantile(p, df) {
  if (!Number.isFinite(df) || df > 1e7) return normQuantile(p);
  const key = `${p}|${df}`;
  if (quantCache.has(key)) return quantCache.get(key);
  if (p === 0.5) return 0;
  let lo = -1, hi = 1;
  while (tCdf(lo, df) > p) lo *= 2;
  while (tCdf(hi, df) < p) hi *= 2;
  for (let i = 0; i < 200 && hi - lo > 1e-14 * Math.max(1, Math.abs(lo)); i++) {
    const mid = (lo + hi) / 2;
    if (tCdf(mid, df) < p) lo = mid; else hi = mid;
  }
  const q = (lo + hi) / 2;
  if (quantCache.size < 5000) quantCache.set(key, q);
  return q;
}

/** Upper tail of chi-square. */
export const chi2Sf = (x, df) => (x <= 0 ? 1 : gammaQ(df / 2, x / 2));
/** Chi-square quantile (lower-tail probability p). */
export function chi2Quantile(p, df) {
  let lo = 0, hi = Math.max(1, df);
  while (1 - chi2Sf(hi, df) < p) hi *= 2;
  for (let i = 0; i < 200 && hi - lo > 1e-13 * Math.max(1, hi); i++) {
    const mid = (lo + hi) / 2;
    if (1 - chi2Sf(mid, df) < p) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

/** Inverse of a small symmetric positive-definite matrix (Gauss-Jordan). Null if singular. */
export function invert(A) {
  const n = A.length;
  const M = A.map((r, i) => [...r, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))]);
  const scale = Math.max(1e-300, ...A.map((r, i) => Math.abs(r[i])));
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
    if (Math.abs(M[piv][c]) < 1e-13 * scale) return null;
    [M[c], M[piv]] = [M[piv], M[c]];
    const p = M[c][c];
    for (let j = 0; j < 2 * n; j++) M[c][j] /= p;
    for (let r = 0; r < n; r++) {
      if (r === c || M[r][c] === 0) continue;
      const f = M[r][c];
      for (let j = 0; j < 2 * n; j++) M[r][j] -= f * M[c][j];
    }
  }
  return M.map((r) => r.slice(n));
}

// Seeded generator (mulberry32) and a normal draw, for the evals.
export function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function normalDraw(u) {
  let a = u();
  while (a <= 1e-300) a = u();
  return Math.sqrt(-2 * Math.log(a)) * Math.cos(2 * Math.PI * u());
}

// ---------------------------------------------------------------- the model

/** Weighted least squares at a given tau-squared: coefficients, their covariance, residual Q. */
export function wls(y, v, X, tau2) {
  const k = y.length, p = X[0].length;
  const w = v.map((vi) => 1 / (vi + tau2));
  const A = Array.from({ length: p }, () => new Array(p).fill(0));
  const bvec = new Array(p).fill(0);
  for (let i = 0; i < k; i++) for (let a = 0; a < p; a++) {
    bvec[a] += w[i] * X[i][a] * y[i];
    for (let c = 0; c < p; c++) A[a][c] += w[i] * X[i][a] * X[i][c];
  }
  const inv = invert(A);
  if (!inv) throw new Error("the moderator does not vary enough across studies to estimate a slope");
  const beta = inv.map((r) => r.reduce((s, x, j) => s + x * bvec[j], 0));
  const resid = y.map((yi, i) => yi - X[i].reduce((s, x, j) => s + x * beta[j], 0));
  const Q = resid.reduce((s, r, i) => s + w[i] * r * r, 0);
  return { w, inv, beta, resid, Q, XtWX: A };
}

// Traces needed by the estimators: tr(P) and tr(P P), P = W - W X (X'WX)^-1 X' W.
function projTraces(X, w, inv) {
  const k = w.length, p = X[0].length;
  // H = X inv X' (k x k), P_ij = w_i delta_ij - w_i H_ij w_j
  const H = Array.from({ length: k }, (_, i) => Array.from({ length: k }, (_, j) => {
    let s = 0;
    for (let a = 0; a < p; a++) for (let c = 0; c < p; c++) s += X[i][a] * inv[a][c] * X[j][c];
    return s;
  }));
  let trP = 0, trPP = 0;
  for (let i = 0; i < k; i++) {
    trP += w[i] - w[i] * H[i][i] * w[i];
    for (let j = 0; j < k; j++) {
      const pij = (i === j ? w[i] : 0) - w[i] * H[i][j] * w[j];
      trPP += pij * pij;
    }
  }
  return { trP, trPP };
}

/** Generalised Q at tau-squared: sum of w (y - X b(tau2))^2. Decreasing in tau2. */
export const qGen = (y, v, X, tau2) => wls(y, v, X, tau2).Q;

// Root of a decreasing function f on [0, inf), f(0) > 0 assumed.
function rootDecreasing(f, start) {
  let lo = 0, hi = Math.max(start, 1e-8);
  let n = 0;
  while (f(hi) > 0 && n++ < 200) { lo = hi; hi *= 2; }
  for (let i = 0; i < 300 && hi - lo > 1e-14 * Math.max(1e-12, hi); i++) {
    const mid = (lo + hi) / 2;
    if (f(mid) > 0) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

/** Estimate tau-squared by the chosen method. */
export function estimateTau2(y, v, X, method) {
  const k = y.length, p = X[0].length;
  if (method === "FE") return { tau2: 0, iterations: 0, converged: true };
  if (k - p < 1) return { tau2: 0, iterations: 0, converged: true };
  const fe = wls(y, v, X, 0);
  const { trP } = projTraces(X, fe.w, fe.inv);
  const dl = Math.max(0, (fe.Q - (k - p)) / trP);
  if (method === "DL") return { tau2: dl, iterations: 0, converged: true };
  if (method === "PM") {
    if (fe.Q <= k - p) return { tau2: 0, iterations: 0, converged: true };
    const scale = Math.max(...v);
    return { tau2: rootDecreasing((t) => qGen(y, v, X, t) - (k - p), Math.max(dl, scale)), iterations: 0, converged: true };
  }
  if (method === "REML") {
    // Fisher scoring on the restricted likelihood, from the DL estimate, with step halving.
    let tau2 = dl, it = 0, converged = false;
    for (; it < 500; it++) {
      const f = wls(y, v, X, tau2);
      const { trP: tp, trPP } = projTraces(X, f.w, f.inv);
      const score = f.resid.reduce((s, r, i) => s + (f.w[i] * r) ** 2, 0) - tp;
      let step = score / trPP;
      let next = tau2 + step;
      while (next < 0 && Math.abs(step) > 1e-16) { step /= 2; next = tau2 + step; }
      if (next < 0) next = 0;
      if (Math.abs(next - tau2) <= 1e-12 * Math.max(1, tau2)) { tau2 = next; converged = true; break; }
      tau2 = next;
    }
    return { tau2, iterations: it, converged };
  }
  throw new Error(`unknown method "${method}" (use REML, DL, PM or FE)`);
}

/** Restricted log-likelihood (for checks), up to the constant 0.5 log|X'X|. */
export function remlLogLik(y, v, X, tau2) {
  const f = wls(y, v, X, tau2);
  const k = y.length, p = X[0].length;
  const logDet = Math.log(det(f.XtWX));
  return -0.5 * ((k - p) * Math.log(2 * Math.PI) + v.reduce((s, vi) => s + Math.log(vi + tau2), 0) + logDet + f.Q);
}
function det(A) {
  if (A.length === 1) return A[0][0];
  if (A.length === 2) return A[0][0] * A[1][1] - A[0][1] * A[1][0];
  throw new Error("det: up to 2x2");
}

/** Q-profile interval for tau-squared (Viechtbauer 2007). */
export function tau2Profile(y, v, X, confidence) {
  const k = y.length, p = X[0].length, df = k - p;
  if (df < 1) return null;
  const alpha = 1 - confidence;
  const qHi = chi2Quantile(1 - alpha / 2, df), qLo = chi2Quantile(alpha / 2, df);
  const q0 = qGen(y, v, X, 0);
  const start = Math.max(...v);
  const lower = q0 <= qHi ? 0 : rootDecreasing((t) => qGen(y, v, X, t) - qHi, start);
  const upper = q0 <= qLo ? 0 : rootDecreasing((t) => qGen(y, v, X, t) - qLo, start);
  return { lower, upper };
}

/**
 * Fit a (mixed-effects) meta-analytic model: y_i = x_i'b + u_i + e_i, u ~ N(0, tau2), e ~ N(0, v_i).
 * Intercept-only X gives the random-effects (or, with FE, the common-effect) model.
 */
export function fitModel(y, v, X, { method = "REML", confidence = 0.95 } = {}) {
  const k = y.length, p = X[0].length;
  if (k < p + 1) throw new Error(`need at least ${p + 1} studies for this model`);
  const est = estimateTau2(y, v, X, method);
  const tau2 = est.tau2;
  const f = wls(y, v, X, tau2);
  const fe = wls(y, v, X, 0);
  const df = k - p;
  const z = normQuantile(1 - (1 - confidence) / 2);
  const tq = df >= 1 ? tQuantile(1 - (1 - confidence) / 2, df) : NaN;
  // Hartung-Knapp: residual mean square at the fitted tau2 scales the covariance.
  const s2hk = df >= 1 ? f.Q / df : NaN;
  const coefs = f.beta.map((b, j) => {
    const se = Math.sqrt(f.inv[j][j]);
    const seHK = Math.sqrt(f.inv[j][j] * s2hk);
    return {
      estimate: b, se, z: b / se, p: normP2(b / se), lower: b - z * se, upper: b + z * se,
      hk: { se: seHK, t: b / seHK, df, p: tP2(b / seHK, df), lower: b - tq * seHK, upper: b + tq * seHK },
    };
  });
  const { trP: trPfe } = projTraces(X, fe.w, fe.inv);
  const s2typical = df >= 1 ? df / trPfe : NaN;   // Higgins & Thompson's typical within-study variance
  const Qfe = fe.Q;
  const I2fromQ = df >= 1 && Qfe > 0 ? Math.max(0, (Qfe - df) / Qfe) : 0;
  const I2 = method === "FE" ? I2fromQ : tau2 / (tau2 + s2typical);
  const prof = method === "FE" ? null : tau2Profile(y, v, X, confidence);
  return {
    method, k, p, df, tau2, tau: Math.sqrt(tau2), converged: est.converged, iterations: est.iterations,
    coefs, weights: f.w, resid: f.resid,
    heterogeneity: {
      Q: Qfe, df, pQ: df >= 1 ? chi2Sf(Qfe, df) : NaN,
      I2, I2fromQ, H2: df >= 1 ? Qfe / df : NaN, s2typical,
      tau2CI: prof, I2CI: prof ? { lower: prof.lower / (prof.lower + s2typical), upper: prof.upper / (prof.upper + s2typical) } : null,
    },
    QEtau: f.Q, s2hk,
  };
}

/** Egger's regression test: y/se on 1/se by OLS, intercept tested with t on k-2 df. */
export function eggerTest(y, se) {
  const k = y.length;
  if (k < 3) return null;
  const xs = se.map((s) => 1 / s), zs = y.map((yi, i) => yi / se[i]);
  const mx = xs.reduce((a, b) => a + b, 0) / k, mz = zs.reduce((a, b) => a + b, 0) / k;
  let sxx = 0, sxz = 0;
  for (let i = 0; i < k; i++) { sxx += (xs[i] - mx) ** 2; sxz += (xs[i] - mx) * (zs[i] - mz); }
  if (!(sxx > 0)) return null;
  const slope = sxz / sxx, intercept = mz - slope * mx;
  const rss = zs.reduce((s, zi, i) => s + (zi - intercept - slope * xs[i]) ** 2, 0);
  const sigma2 = rss / (k - 2);
  const seInt = Math.sqrt(sigma2 * (1 / k + (mx * mx) / sxx));
  const t = intercept / seInt;
  return { intercept, seIntercept: seInt, slope, t, df: k - 2, p: tP2(t, k - 2) };
}

// ---------------------------------------------------------------- effect sizes

/** Effect size and sampling variance for one 2x2 table (events/non-events in each arm). */
export function binaryEffect(measure, a, b, c, d, correction = 0.5) {
  const n1 = a + b, n2 = c + d;
  if (!(n1 > 0 && n2 > 0)) return { error: "an arm has no participants" };
  if (measure === "RD") {
    const p1 = a / n1, p2 = c / n2;
    const vi = (p1 * (1 - p1)) / n1 + (p2 * (1 - p2)) / n2;
    if (!(vi > 0)) return { error: "risk difference has zero variance (0% or 100% in both arms)" };
    return { yi: p1 - p2, vi, corrected: false };
  }
  if (a === 0 && c === 0) return { error: "no events in either arm (carries no information on a ratio scale)" };
  if (b === 0 && d === 0) return { error: "every participant had the event in both arms" };
  let corrected = false;
  if (a === 0 || b === 0 || c === 0 || d === 0) {
    if (!(correction > 0)) return { error: "a zero cell and no continuity correction" };
    a += correction; b += correction; c += correction; d += correction; corrected = true;
  }
  const m1 = a + b, m2 = c + d;
  if (measure === "OR") return { yi: Math.log((a * d) / (b * c)), vi: 1 / a + 1 / b + 1 / c + 1 / d, corrected };
  if (measure === "RR") return { yi: Math.log(a / m1) - Math.log(c / m2), vi: 1 / a - 1 / m1 + 1 / c - 1 / m2, corrected };
  throw new Error(`unknown binary measure ${measure}`);
}

/** Mean difference or Hedges' g from two groups' means, SDs and sizes (Borenstein et al. 2009, ch. 4). */
export function continuousEffect(measure, m1, sd1, n1, m2, sd2, n2) {
  if (!(n1 > 1 && n2 > 1)) return { error: "each group needs at least two participants" };
  if (!(sd1 > 0 && sd2 > 0)) return { error: "standard deviations must be positive" };
  if (measure === "MD") return { yi: m1 - m2, vi: (sd1 * sd1) / n1 + (sd2 * sd2) / n2 };
  if (measure === "SMD") {
    const df = n1 + n2 - 2;
    const sp = Math.sqrt(((n1 - 1) * sd1 * sd1 + (n2 - 1) * sd2 * sd2) / df);
    const dd = (m1 - m2) / sp;
    const J = 1 - 3 / (4 * df - 1);
    const vd = (n1 + n2) / (n1 * n2) + (dd * dd) / (2 * (n1 + n2));
    return { yi: J * dd, vi: J * J * vd, d: dd, J };
  }
  throw new Error(`unknown continuous measure ${measure}`);
}

// ---------------------------------------------------------------- CSV and columns

export function parseCsv(text) {
  const src = String(text).replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  const first = src.split("\n").find((l) => l.trim() !== "") || "";
  const counts = { ",": 0, "\t": 0, ";": 0 };
  let q = false;
  for (const ch of first) { if (ch === '"') q = !q; else if (!q && ch in counts) counts[ch]++; }
  const delim = counts["\t"] > counts[","] && counts["\t"] >= counts[";"] ? "\t" : counts[";"] > counts[","] ? ";" : ",";
  const rows = [];
  let row = [], cell = "", inQ = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQ) {
      if (ch === '"') { if (src[i + 1] === '"') { cell += '"'; i++; } else inQ = false; }
      else cell += ch;
    } else if (ch === '"' && cell.trim() === "") { inQ = true; cell = ""; }
    else if (ch === delim) { row.push(cell.trim()); cell = ""; }
    else if (ch === "\n") { row.push(cell.trim()); rows.push(row); row = []; cell = ""; }
    else cell += ch;
  }
  if (cell !== "" || row.length) { row.push(cell.trim()); rows.push(row); }
  const nonEmpty = rows.filter((r) => r.some((c) => c !== ""));
  if (nonEmpty.length < 2) throw new Error("the CSV needs a header row and at least one study");
  const header = nonEmpty[0].map((h, i) => h || `column${i + 1}`);
  return { header, rows: nonEmpty.slice(1) };
}

export function toNumber(s) {
  if (s === undefined || s === null) return NaN;
  const t = String(s).trim().replace(/^\((.*)\)$/, "-$1").replace(/[\s ]/g, "");
  if (t === "" || /^(na|nan|null|-|\.)$/i.test(t)) return NaN;
  // 1,234.5 (thousands) or 1234,5 (decimal comma, when nothing else is there)
  const clean = /^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(t) ? t.replace(/,/g, "") : /^-?\d+,\d+$/.test(t) ? t.replace(",", ".") : t;
  return /^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(clean) ? Number(clean) : NaN;
}

const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, "");
const ARM1 = ["t", "treat", "treatment", "trt", "exp", "experimental", "intervention", "int", "vacc", "vaccinated", "active", "drug", "group1", "g1", "arm1"];
const ARM2 = ["c", "ctrl", "control", "placebo", "pbo", "comparator", "comp", "usual", "unvaccinated", "group2", "g2", "arm2"];
const words = {
  events: ["events", "event", "pos", "cases", "deaths", "x", "r", "e", "yes"],
  non: ["neg", "nonevents", "noevents", "no"],
  total: ["n", "total", "size", "num"],
  mean: ["mean", "m", "avg", "mu"],
  sd: ["sd", "s", "stdev", "std"],
};
function aliases(arm, kind) {
  const pre = arm === 1 ? ARM1 : ARM2, num = String(arm), out = new Set();
  for (const w of words[kind]) {
    out.add(w + num); out.add(num + w);
    for (const p of pre) { out.add(p + w); out.add(w + p); }
  }
  return out;
}
const ROLE_ALIASES = {
  ai: new Set(["ai", ...aliases(1, "events")]), bi: new Set(["bi", ...aliases(1, "non")]), n1i: aliases(1, "total"),
  ci: new Set(["ci", ...aliases(2, "events")]), di: new Set(["di", ...aliases(2, "non")]), n2i: aliases(2, "total"),
  m1i: aliases(1, "mean"), sd1i: aliases(1, "sd"), m2i: aliases(2, "mean"), sd2i: aliases(2, "sd"),
  yi: new Set(["yi", "y", "effect", "effectsize", "es", "estimate", "est", "logor", "lnor", "logrr", "lnrr", "loghr", "lnhr", "smd", "g", "hedgesg", "d", "cohensd", "md", "diff", "difference", "or", "rr", "hr", "ratio", "irr"]),
  sei: new Set(["sei", "se", "stderr", "standarderror", "sterr", "seyi"]),
  vi: new Set(["vi", "v", "var", "variance", "vyi"]),
  lower: new Set(["lower", "lo", "low", "lcl", "lci", "cilower", "lowerci", "ll", "lower95", "lb", "cil", "ci95lower"]),
  upper: new Set(["upper", "hi", "high", "ucl", "uci", "ciupper", "upperci", "ul", "upper95", "ub", "ciu", "ci95upper"]),
};
// Columns that carry the arm-1 total when the CSV gives events and totals. "n1" style names are in n1i.
export const LAYOUTS = {
  cells: ["ai", "bi", "ci", "di"],
  totals: ["ai", "n1i", "ci", "n2i"],
  continuous: ["m1i", "sd1i", "n1i", "m2i", "sd2i", "n2i"],
  "generic-se": ["yi", "sei"],
  "generic-var": ["yi", "vi"],
  "generic-ci": ["yi", "lower", "upper"],
};
export const LAYOUT_NAMES = {
  cells: "2x2 counts (events and non-events in each arm)",
  totals: "events and totals in each arm",
  continuous: "means, SDs and sizes of two groups",
  "generic-se": "effect and standard error",
  "generic-var": "effect and variance",
  "generic-ci": "estimate with a confidence interval",
};

function findColumn(header, role, taken) {
  const set = ROLE_ALIASES[role];
  return header.find((h) => !taken.has(h) && set.has(norm(h))) || null;
}

/** Work out which columns play which role. Explicit `columns` win; otherwise names are matched. */
export function detectLayout(header, layout = "auto", columns = {}) {
  const order = layout === "auto" ? ["continuous", "cells", "totals", "generic-ci", "generic-se", "generic-var"] : [layout];
  if (layout !== "auto" && !LAYOUTS[layout]) throw new Error(`unknown layout "${layout}"`);
  for (const lay of order) {
    const taken = new Set(), map = {};
    let ok = true;
    for (const role of LAYOUTS[lay]) {
      let col = columns[role];
      if (col !== undefined && col !== "") {
        if (!header.includes(col)) throw new Error(`no column named "${col}" (columns: ${header.join(", ")})`);
      } else col = findColumn(header, role, taken);
      if (!col) { ok = false; break; }
      map[role] = col; taken.add(col);
    }
    if (ok) return { layout: lay, map };
  }
  const want = layout === "auto" ? Object.entries(LAYOUTS).map(([k, r]) => `${LAYOUT_NAMES[k]} (${r.join(", ")})`).join("; ") : LAYOUTS[layout].join(", ");
  throw new Error(`could not find the columns for ${layout === "auto" ? "any layout" : LAYOUT_NAMES[layout]}. Name them, for example: ${want}`);
}

function detectLabel(header, rows, used, study) {
  if (study) {
    if (!header.includes(study)) throw new Error(`no column named "${study}"`);
    return (r) => r[header.indexOf(study)] || "";
  }
  const named = (names) => header.findIndex((h) => !used.has(h) && names.includes(norm(h)));
  const author = named(["author", "authors", "firstauthor", "study", "studyname", "trialname", "name", "label", "source", "reference", "citation"]);
  const year = named(["year", "yr", "pubyear", "publicationyear"]);
  if (author >= 0 && year >= 0 && !/\d{4}/.test(rows[0][author] || "")) return (r) => `${r[author]} ${r[year]}`.trim();
  if (author >= 0) return (r) => r[author] || "";
  const textCol = header.findIndex((h, i) => !used.has(h) && rows.some((r) => r[i] && Number.isNaN(toNumber(r[i]))));
  if (textCol >= 0) return (r) => r[textCol] || "";
  const id = named(["trial", "id", "studyid"]);
  if (id >= 0) return (r) => `Study ${r[id]}`;
  return null;
}

/** Read the CSV and compute one effect size and variance per study. */
export function readStudies(input = {}) {
  const o = { ...DEFAULTS, ...input };
  const { header, rows } = parseCsv(o.csv);
  const { layout, map } = detectLayout(header, o.layout, o.columns || {});
  const idx = Object.fromEntries(Object.entries(map).map(([role, col]) => [role, header.indexOf(col)]));
  const used = new Set(Object.values(map));
  const labelOf = detectLabel(header, rows, used, o.study);
  let measure = String(o.measure || "auto").toUpperCase();
  const binary = layout === "cells" || layout === "totals";
  const generic = layout.startsWith("generic");
  if (measure === "AUTO") measure = binary ? "RR" : layout === "continuous" ? "SMD" : "GEN";
  if (binary && !["RR", "OR", "RD"].includes(measure)) throw new Error(`for counts the measure is RR, OR or RD, not ${measure}`);
  if (layout === "continuous" && !["SMD", "MD"].includes(measure)) throw new Error(`for means and SDs the measure is SMD or MD, not ${measure}`);
  if (generic && !["GEN", "GENLOG"].includes(measure)) measure = "GEN";
  const warnings = [];
  const studies = [], dropped = [];

  let ratio = false;
  if (generic) {
    const r = String(o.ratio).toLowerCase();
    const yCol = norm(map.yi);
    if (r === "yes" || r === "true") ratio = true;
    else if (r === "no" || r === "false") ratio = false;
    else if (layout === "generic-ci") {
      // Ratios are reported as estimate (lower, upper) on the natural scale: positive and
      // symmetric on the log scale. Read them as ratios when that fits better than symmetry.
      let logAsym = 0, rawAsym = 0, positive = true, nOk = 0;
      for (const row of rows) {
        const e = toNumber(row[idx.yi]), l = toNumber(row[idx.lower]), u = toNumber(row[idx.upper]);
        if (![e, l, u].every(Number.isFinite)) continue;
        nOk++;
        if (!(e > 0 && l > 0 && u > 0)) { positive = false; break; }
        logAsym += Math.abs(Math.log(u / e) - Math.log(e / l)) / Math.max(1e-12, Math.log(u / l));
        rawAsym += Math.abs((u - e) - (e - l)) / Math.max(1e-12, u - l);
      }
      ratio = positive && nOk > 0 && (["or", "rr", "hr", "ratio", "irr"].includes(yCol) || logAsym < rawAsym);
    } else ratio = false;
    if (ratio) measure = "GENLOG";
  }
  const z = normQuantile(0.975);

  rows.forEach((row, n) => {
    const label = (labelOf ? labelOf(row) : "") || `Study ${n + 1}`;
    const num = (role) => toNumber(row[idx[role]]);
    let eff, extra = {};
    if (binary) {
      const a = num("ai"), c = num("ci");
      const b = layout === "cells" ? num("bi") : num("n1i") - a;
      const d = layout === "cells" ? num("di") : num("n2i") - c;
      if (![a, b, c, d].every(Number.isFinite)) { dropped.push({ label, reason: "a count is missing or not a number" }); return; }
      if ([a, b, c, d].some((x) => x < 0)) { dropped.push({ label, reason: "negative count (events above the total?)" }); return; }
      eff = binaryEffect(measure, a, b, c, d, o.correction);
      extra = { events1: a, n1: a + b, events2: c, n2: c + d };
    } else if (layout === "continuous") {
      const vals = ["m1i", "sd1i", "n1i", "m2i", "sd2i", "n2i"].map(num);
      if (!vals.every(Number.isFinite)) { dropped.push({ label, reason: "a mean, SD or size is missing" }); return; }
      eff = continuousEffect(measure, ...vals);
      extra = { n1: vals[2], n2: vals[5] };
    } else if (layout === "generic-se" || layout === "generic-var") {
      let y = num("yi");
      const s = layout === "generic-se" ? num("sei") : Math.sqrt(num("vi"));
      if (!Number.isFinite(y) || !(s > 0)) { dropped.push({ label, reason: "effect missing or standard error not positive" }); return; }
      if (ratio) {
        if (!(y > 0)) { dropped.push({ label, reason: "a ratio must be positive" }); return; }
        // With ratio=yes on effect/SE input, the effect is the ratio and the SE is of its log.
        y = Math.log(y);
      }
      eff = { yi: y, vi: s * s };
    } else {
      const e = num("yi"), l = num("lower"), u = num("upper");
      if (![e, l, u].every(Number.isFinite) || !(u > l)) { dropped.push({ label, reason: "estimate or interval missing, or the upper limit is not above the lower" }); return; }
      if (ratio) {
        if (!(e > 0 && l > 0)) { dropped.push({ label, reason: "a ratio and its limits must be positive" }); return; }
        eff = { yi: Math.log(e), vi: ((Math.log(u) - Math.log(l)) / (2 * z)) ** 2 };
      } else eff = { yi: e, vi: ((u - l) / (2 * z)) ** 2 };
    }
    if (eff.error) { dropped.push({ label, reason: eff.error }); return; }
    studies.push({ label, row: n, yi: eff.yi, vi: eff.vi, corrected: Boolean(eff.corrected), ...extra });
  });
  const nCorrected = studies.filter((s) => s.corrected).length;
  if (nCorrected) warnings.push(`${nCorrected} ${nCorrected === 1 ? "study has" : "studies have"} a zero cell, so ${o.correction} was added to each of its four cells.`);
  if (dropped.length) warnings.push(`Left out: ${dropped.map((d) => `${d.label} (${d.reason})`).join("; ")}.`);
  return { header, rows, layout, map, measure, ratio: MEASURES[measure].log, studies, dropped, warnings };
}

// ---------------------------------------------------------------- formatting

export function fmt(x, digits = 3) {
  if (x === null || x === undefined || Number.isNaN(x)) return "n/a";
  if (!Number.isFinite(x)) return x > 0 ? "inf" : "-inf";
  const a = Math.abs(x);
  if (a !== 0 && (a < 1e-3 || a >= 1e7)) return x.toExponential(2);
  const d = a >= 1000 ? 0 : a >= 100 ? 1 : a >= 10 ? 2 : digits;
  return a >= 1000 ? Math.round(x).toLocaleString("en-US") : x.toFixed(d);
}
export function formatP(p) {
  if (!Number.isFinite(p)) return "n/a";
  if (p < 0.0001) return "< 0.0001";
  if (p < 0.001) return p.toFixed(4);
  return p.toFixed(3);
}
export const pEq = (p) => (Number.isFinite(p) && p < 0.0001 ? "p < 0.0001" : `p = ${formatP(p)}`);
const pct = (x) => `${(100 * x).toFixed(1)}%`;

// ---------------------------------------------------------------- analysis

/**
 * The whole analysis. Input: DEFAULTS. Output: a JSON-serialisable object with per-study
 * effects and weights, the pooled estimate under the chosen and every other estimator,
 * heterogeneity, a prediction interval, Egger's test, leave-one-out, an optional
 * meta-regression and a plain-language summary.
 */
export function analyze(input = {}) {
  const o = { ...DEFAULTS, ...input };
  o.method = String(o.method || "REML").toUpperCase();
  if (!METHODS[o.method]) throw new Error(`unknown method "${o.method}" (use REML, DL, PM or FE)`);
  o.confidence = Number(o.confidence);
  if (!(o.confidence > 0.5 && o.confidence < 1)) throw new Error("confidence must be between 0.5 and 1, e.g. 0.95");
  const data = readStudies(o);
  const { studies, measure } = data;
  const k = studies.length;
  if (k < 2) throw new Error(`need at least two usable studies; found ${k}${data.dropped.length ? ` (${data.dropped.length} left out: ${data.dropped.map((d) => d.reason).join("; ")})` : ""}`);
  const warnings = [...data.warnings];
  const y = studies.map((s) => s.yi), v = studies.map((s) => s.vi);
  const X1 = y.map(() => [1]);
  const cl = o.confidence;
  const zq = normQuantile(1 - (1 - cl) / 2);
  const back = MEASURES[measure].log ? Math.exp : (x) => x;

  const main = fitModel(y, v, X1, { method: o.method, confidence: cl });
  if (!main.converged) warnings.push("REML did not converge in 500 iterations; the estimate shown is the last step. Try DL or PM.");
  const c0 = main.coefs[0];
  const se = c0.se;
  const fe = fitModel(y, v, X1, { method: "FE", confidence: cl });

  // Every estimator side by side.
  const byMethod = Object.keys(METHODS).map((m) => {
    const f = m === o.method ? main : fitModel(y, v, X1, { method: m, confidence: cl });
    const c = f.coefs[0];
    return { method: m, name: METHODS[m], tau2: f.tau2, I2: f.heterogeneity.I2, estimate: c.estimate, se: c.se, lower: c.lower, upper: c.upper, hk: m === "FE" ? null : { lower: c.hk.lower, upper: c.hk.upper, se: c.hk.se } };
  });

  // Prediction interval (Riley, Higgins & Deeks 2011): t on k-2 df.
  let prediction = null;
  if (o.method !== "FE" && k >= 3) {
    const tq = tQuantile(1 - (1 - cl) / 2, k - 2);
    const half = tq * Math.sqrt(main.tau2 + se * se);
    prediction = { lower: c0.estimate - half, upper: c0.estimate + half, df: k - 2 };
  }

  const wSum = main.weights.reduce((a, b) => a + b, 0);
  const wSumFe = fe.weights.reduce((a, b) => a + b, 0);
  const studyRows = studies.map((s, i) => {
    const sei = Math.sqrt(s.vi);
    return {
      label: s.label, yi: s.yi, vi: s.vi, sei, lower: s.yi - zq * sei, upper: s.yi + zq * sei,
      weight: main.weights[i] / wSum, weightFE: fe.weights[i] / wSumFe, corrected: s.corrected,
      ...(s.n1 !== undefined ? { n1: s.n1, n2: s.n2 } : {}), ...(s.events1 !== undefined ? { events1: s.events1, events2: s.events2 } : {}),
    };
  });

  const egger = eggerTest(y, v.map(Math.sqrt));
  if (egger && k < 10) warnings.push(`Egger's test with ${k} studies has little power; the Cochrane Handbook advises against asymmetry tests with fewer than 10.`);

  // Leave-one-out.
  let leaveOneOut = null;
  if (o.leaveOneOut && k >= 3) {
    leaveOneOut = studies.map((s, i) => {
      const yy = y.filter((_, j) => j !== i), vv = v.filter((_, j) => j !== i);
      const f = fitModel(yy, vv, yy.map(() => [1]), { method: o.method, confidence: cl });
      const c = f.coefs[0];
      return { omitted: s.label, estimate: c.estimate, lower: c.lower, upper: c.upper, p: c.p, tau2: f.tau2, I2: f.heterogeneity.I2, Q: f.heterogeneity.Q };
    });
  }

  // Meta-regression on one numeric moderator.
  let regression = null;
  if (o.moderator) {
    const col = data.header.indexOf(o.moderator);
    if (col < 0) throw new Error(`no moderator column named "${o.moderator}"`);
    const xs = studies.map((s) => toNumber(data.rows[s.row][col]));
    const keep = xs.map((x, i) => (Number.isFinite(x) ? i : -1)).filter((i) => i >= 0);
    if (keep.length < k) warnings.push(`${k - keep.length} ${k - keep.length === 1 ? "study has" : "studies have"} no number in "${o.moderator}" and ${k - keep.length === 1 ? "is" : "are"} left out of the meta-regression.`);
    if (keep.length < 4) warnings.push(`A meta-regression needs at least four studies with a value of "${o.moderator}"; skipped.`);
    else {
      const yy = keep.map((i) => y[i]), vv = keep.map((i) => v[i]), xx = keep.map((i) => xs[i]);
      const method = o.method;
      const reg = fitModel(yy, vv, xx.map((x) => [1, x]), { method, confidence: cl });
      const base = fitModel(yy, vv, yy.map(() => [1]), { method, confidence: cl });
      const slope = reg.coefs[1];
      const R2 = method === "FE" || base.tau2 <= 0 ? null : Math.max(0, (base.tau2 - reg.tau2) / base.tau2);
      regression = {
        moderator: o.moderator, k: keep.length, method, intercept: reg.coefs[0], slope,
        tau2: reg.tau2, tau2Without: base.tau2, R2,
        QM: { stat: slope.z ** 2, df: 1, p: chi2Sf(slope.z ** 2, 1) },
        QE: { stat: reg.heterogeneity.Q, df: reg.df, p: reg.heterogeneity.pQ },
        I2residual: reg.heterogeneity.I2,
        points: keep.map((i, j) => ({ label: studies[i].label, x: xx[j], yi: yy[j], vi: vv[j] })),
      };
      if (keep.length < 10) warnings.push(`A meta-regression on ${keep.length} studies is exploratory: with fewer than 10 studies per moderator the Cochrane Handbook advises against it.`);
    }
  }

  if (k === 2 && o.method !== "FE") warnings.push("With two studies the between-study variance is barely estimable; read tau-squared and the interval with caution.");
  if (o.method !== "FE" && k < 5) warnings.push(`With ${k} studies the Wald interval tends to be too narrow; the Hartung-Knapp interval is the safer reading.`);

  const result = {
    input: { layout: data.layout, columns: data.map, measure, measureName: MEASURES[measure].name, ratio: MEASURES[measure].log, method: o.method, methodName: METHODS[o.method], confidence: cl, moderator: o.moderator || null, correction: o.correction },
    k, studies: studyRows, dropped: data.dropped,
    pooled: {
      estimate: c0.estimate, se, z: c0.z, p: c0.p, lower: c0.lower, upper: c0.upper,
      hk: o.method === "FE" ? null : c0.hk,
      back: { estimate: back(c0.estimate), lower: back(c0.lower), upper: back(c0.upper), hkLower: o.method === "FE" ? null : back(c0.hk.lower), hkUpper: o.method === "FE" ? null : back(c0.hk.upper) },
    },
    tau2: main.tau2, tau: main.tau, converged: main.converged,
    heterogeneity: main.heterogeneity,
    prediction: prediction ? { ...prediction, back: { lower: back(prediction.lower), upper: back(prediction.upper) } } : null,
    byMethod, egger, leaveOneOut, regression, warnings,
  };
  result.summary = summarize(result);
  return result;
}

function summarize(r) {
  const out = [];
  const m = r.input, ratio = m.ratio, P = r.pooled, cl = `${Math.round(m.confidence * 100)}%`;
  const name = m.measureName;
  const show = (x) => fmt(x);
  const est = ratio ? P.back.estimate : P.estimate;
  const lo = ratio ? P.back.lower : P.lower, hi = ratio ? P.back.upper : P.upper;
  out.push(`Pooled ${name}: ${show(est)} (${cl} CI ${show(lo)} to ${show(hi)}, ${pEq(P.p)}) from ${r.k} studies, ${m.method === "FE" ? "common-effect model" : `random-effects model with tau-squared by ${m.methodName}`}.`);
  if (ratio && (m.measure === "RR" || m.measure === "OR")) {
    const rel = 1 - est;
    if (Math.abs(rel) >= 0.005) out.push(rel > 0 ? `That is ${Math.round(rel * 100)}% lower ${m.measure === "RR" ? "risk" : "odds"} in the first group than the second.` : `That is ${Math.round(-rel * 100)}% higher ${m.measure === "RR" ? "risk" : "odds"} in the first group than the second.`);
  }
  if (P.hk) {
    const hl = ratio ? P.back.hkLower : P.hk.lower, hh = ratio ? P.back.hkUpper : P.hk.upper;
    out.push(`Hartung-Knapp ${cl} CI (t on ${P.hk.df} df, safer with few studies): ${show(hl)} to ${show(hh)}.`);
  }
  const H = r.heterogeneity;
  if (H.df >= 1) {
    const level = H.I2 < 0.3 ? "little" : H.I2 < 0.6 ? "moderate" : H.I2 < 0.9 ? "substantial" : "considerable";
    const ci = H.I2CI ? ` (${cl} CI ${pct(H.I2CI.lower)} to ${pct(H.I2CI.upper)})` : "";
    out.push(`Heterogeneity is ${level}: I-squared ${pct(H.I2)}${ci}, tau-squared ${fmt(r.tau2, 4)}, Q = ${fmt(H.Q)} on ${H.df} df (${pEq(H.pQ)}).`);
  }
  if (r.prediction) {
    const a = ratio ? r.prediction.back.lower : r.prediction.lower, b = ratio ? r.prediction.back.upper : r.prediction.upper;
    const nul = ratio ? 1 : 0;
    out.push(`${cl} prediction interval for the true effect in a new study: ${show(a)} to ${show(b)}${a < nul && b > nul ? ", which includes no effect" : ""}.`);
  }
  if (r.egger) out.push(`Egger's test for funnel asymmetry: intercept ${fmt(r.egger.intercept)}, ${pEq(r.egger.p)}${r.egger.p < 0.1 ? " (small studies differ from large ones; publication bias is one possible cause)" : ""}.`);
  if (r.leaveOneOut) {
    const flips = r.leaveOneOut.filter((l) => (l.p < 0.05) !== (P.p < 0.05));
    const ests = r.leaveOneOut.map((l) => (ratio ? Math.exp(l.estimate) : l.estimate));
    out.push(`Leaving out one study at a time, the pooled ${name} ranges from ${show(Math.min(...ests))} to ${show(Math.max(...ests))}${flips.length ? `; dropping ${flips.map((f) => f.omitted).join(", ")} changes whether p < 0.05` : "; no single study changes whether p < 0.05"}.`);
  }
  if (r.regression) {
    const g = r.regression, s = g.slope;
    const per = ratio ? `multiplies the ${name} by ${fmt(Math.exp(s.estimate), 4)}` : `changes the ${name} by ${fmt(s.estimate, 4)}`;
    out.push(`Meta-regression on "${g.moderator}" (${g.k} studies): each unit ${per} (${pEq(s.p)})${g.R2 !== null ? `, explaining ${pct(g.R2)} of the between-study variance (tau-squared ${fmt(g.tau2Without, 4)} to ${fmt(g.tau2, 4)})` : ""}. Residual heterogeneity: Q = ${fmt(g.QE.stat)} on ${g.QE.df} df, ${pEq(g.QE.p)}.`);
  }
  return out;
}
