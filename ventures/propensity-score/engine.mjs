// Propensity score analysis of an observational treatment: a logistic model
// of who was treated, inverse probability weighting, regression adjustment,
// the doubly robust AIPW estimator, caliper nearest-neighbour matching, and
// the diagnostics a reader asks for (overlap, covariate balance, effective
// sample size). Standard errors stack the propensity model's and outcome
// models' estimating equations with the effect's, so they count the noise of
// the fitted propensity score (M-estimation sandwich, as in Lunceford &
// Davidian 2004). Pure functions, no DOM, no network.
// Implemented from the papers' definitions; no third-party code was ported.

export const PAPERS = [
  {
    authors: "Paul R. Rosenbaum, Donald B. Rubin",
    title: "The Central Role of the Propensity Score in Observational Studies for Causal Effects",
    venue: "Biometrika 70(1), 41-55",
    year: 1983,
    url: "https://doi.org/10.1093/biomet/70.1.41",
    doi: "10.1093/biomet/70.1.41",
    implemented: "The propensity score e(x) = P(treated | x) as a balancing score, estimated by a logistic regression of the treatment indicator on the covariates (maximum likelihood, Newton-Raphson); the unconfoundedness and overlap conditions the page states.",
    deviations: "The model is a main-effects logistic regression on the columns given; add squares or interactions as columns if you need them. Text columns become 0/1 indicators (first level left out).",
  },
  {
    authors: "Jared K. Lunceford, Marie Davidian",
    title: "Stratification and Weighting via the Propensity Score in Estimation of Causal Treatment Effects: A Comparative Study",
    venue: "Statistics in Medicine 23(19), 2937-2960",
    year: 2004,
    url: "https://doi.org/10.1002/sim.1903",
    doi: "10.1002/sim.1903",
    implemented: "Normalised inverse probability weighting (each arm's weights sum to one) for the potential-outcome means, and standard errors from the stacked estimating equations of the logistic model and the weighted means (the sandwich A^-1 B A^-T / n), which account for estimating the propensity score.",
    deviations: "The sandwich's derivative matrix A is computed by central finite differences of the mean estimating function rather than in closed form; on the test data this agrees with the closed-form GMM standard errors of statsmodels within 1e-6.",
  },
  {
    authors: "James M. Robins, Andrea Rotnitzky, Lue Ping Zhao",
    title: "Estimation of Regression Coefficients When Some Regressors Are Not Always Observed",
    venue: "Journal of the American Statistical Association 89(427), 846-866",
    year: 1994,
    url: "https://doi.org/10.1080/01621459.1994.10476818",
    doi: "10.1080/01621459.1994.10476818",
    implemented: "The augmented inverse probability weighted (doubly robust) estimator of the average treatment effect: each arm's linear outcome regression prediction for everyone, plus the inverse-probability-weighted residuals of the units actually in that arm. It is consistent if either the propensity model or the outcome model is right.",
    deviations: "Outcome models are ordinary least squares on the same covariates as the propensity model, fitted separately in each arm. AIPW is reported for the ATE only.",
  },
  {
    authors: "Peter C. Austin",
    title: "Optimal Caliper Widths for Propensity-Score Matching When Estimating Differences in Means and Differences in Proportions in Observational Studies",
    venue: "Pharmaceutical Statistics 10(2), 150-161",
    year: 2011,
    url: "https://doi.org/10.1002/pst.433",
    doi: "10.1002/pst.433",
    implemented: "1:1 nearest-neighbour matching on the logit of the propensity score with a caliper of 0.2 standard deviations of the logit (changeable). Without replacement (an option) matching is greedy and the standard error is the paired one.",
    deviations: "Without replacement, units are matched in order of decreasing propensity score for the ATT (increasing for the ATC), ties broken by row order. The default is matching with replacement (next entry), because on this tool's simulation study greedy matching without replacement was badly biased.",
  },
  {
    authors: "Alberto Abadie, Guido W. Imbens",
    title: "Large Sample Properties of Matching Estimators for Average Treatment Effects",
    venue: "Econometrica 74(1), 235-267",
    year: 2006,
    url: "https://doi.org/10.1111/j.1468-0262.2006.00655.x",
    doi: "10.1111/j.1468-0262.2006.00655.x",
    implemented: "The variance of the matching estimator with replacement: the spread of the matched differences plus K(K - 1) times the conditional variance for each unit used K times as a match, that conditional variance estimated from the unit's nearest neighbour in its own arm.",
    deviations: "Matching is on the estimated propensity score, one match per unit, without the bias correction. The variance does not count the estimation of the score, which Abadie & Imbens (2016, Econometrica 84(2)) show can matter; the README's coverage study shows how it does on the example's design.",
  },
  {
    authors: "Peter C. Austin",
    title: "Balance Diagnostics for Comparing the Distribution of Baseline Covariates Between Treatment Groups in Propensity-Score Matched Samples",
    venue: "Statistics in Medicine 28(25), 3083-3107",
    year: 2009,
    url: "https://doi.org/10.1002/sim.3697",
    doi: "10.1002/sim.3697",
    implemented: "Standardised mean differences before and after weighting or matching, with an absolute value above 0.1 flagged, and the ratio of variances between arms.",
    deviations: "The denominator is the unweighted pooled standard deviation sqrt((s1^2 + s0^2)/2) in every column, so a change in the SMD reflects a change in the means only.",
  },
  {
    authors: "Richard K. Crump, V. Joseph Hotz, Guido W. Imbens, Oscar A. Mitnik",
    title: "Dealing with Limited Overlap in Estimation of Average Treatment Effects",
    venue: "Biometrika 96(1), 187-199",
    year: 2009,
    url: "https://doi.org/10.1093/biomet/asn055",
    doi: "10.1093/biomet/asn055",
    implemented: "The rule-of-thumb trimming of units with an estimated propensity score outside [0.1, 0.9], after which every estimator is re-run (propensity model refitted) on the units that remain.",
    deviations: "The optimal data-dependent threshold of the paper is not computed; the fixed 0.1 rule or a threshold you type is used. Trimming changes the population the effect is about, which the page says.",
  },
  {
    authors: "Leslie Kish",
    title: "Survey Sampling",
    venue: "John Wiley & Sons, New York",
    year: 1965,
    url: "https://search.worldcat.org/search?q=kish+survey+sampling+1965",
    doi: null,
    implemented: "The effective sample size (sum of weights)^2 / (sum of squared weights) of each arm under the weights, a reading of how much a few large weights cost.",
    deviations: "None.",
  },
];

export const DEFAULTS = { estimand: "ate", trim: "none", caliper: 0.2, replace: true, alpha: 0.05 };

// ---------- CSV ----------

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let f = "";
  let q = false;
  const s = String(text ?? "").replace(/^﻿/, "");
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

const TRUE_WORDS = /^(1|yes|y|true|t|treated)$/i;
const FALSE_WORDS = /^(0|no|n|false|f|control|untreated)$/i;
export function treatmentValue(v) {
  const t = String(v ?? "").trim();
  if (TRUE_WORDS.test(t)) return 1;
  if (FALSE_WORDS.test(t)) return 0;
  return NaN;
}

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

// Inverse of a square matrix by Gauss-Jordan with partial pivoting.
export function invert(A, what = "matrix") {
  const n = A.length;
  const M = A.map((r, i) => [...r, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))]);
  const scale = Math.max(...A.map((r) => Math.max(...r.map(Math.abs)))) || 1;
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
    if (!(Math.abs(M[piv][c]) > 1e-13 * scale)) throw new Error(`The ${what} is singular: a covariate is constant, duplicated or a combination of others${what === "matrix" ? "" : " within one arm"}. Drop it and run again.`);
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

const dot = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };
const matVec = (M, v) => M.map((r) => dot(r, v));
const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
const variance = (a) => { const m = mean(a); return a.reduce((s, v) => s + (v - m) ** 2, 0) / (a.length - 1); };
const expit = (t) => (t >= 0 ? 1 / (1 + Math.exp(-t)) : Math.exp(t) / (1 + Math.exp(t)));

// ---------- models ----------

/**
 * Logistic regression of d (0/1) on the rows of X (each row starts with 1),
 * by Newton-Raphson with step halving. Returns coefficients, their
 * model-based standard errors, fitted probabilities and the log likelihood.
 */
export function logit(X, d, { maxIter = 100, tol = 1e-12 } = {}) {
  const n = X.length, k = X[0].length;
  let beta = new Array(k).fill(0);
  const ll = (b) => { let s = 0; for (let i = 0; i < n; i++) { const t = dot(X[i], b); s += d[i] * t - (t > 0 ? t + Math.log1p(Math.exp(-t)) : Math.log1p(Math.exp(t))); } return s; };
  let cur = ll(beta), it = 0, converged = false;
  for (; it < maxIter; it++) {
    const g = new Array(k).fill(0);
    const H = Array.from({ length: k }, () => new Array(k).fill(0));
    for (let i = 0; i < n; i++) {
      const p = expit(dot(X[i], beta)), w = p * (1 - p), r = d[i] - p, x = X[i];
      for (let a = 0; a < k; a++) { g[a] += x[a] * r; const wa = w * x[a]; for (let b = 0; b <= a; b++) H[a][b] += wa * x[b]; }
    }
    for (let a = 0; a < k; a++) for (let b = 0; b < a; b++) H[b][a] = H[a][b];
    const step = matVec(invert(H, "propensity model"), g);
    let t = 1, next, nextLl;
    for (let h = 0; h < 40; h++) { next = beta.map((v, j) => v + t * step[j]); nextLl = ll(next); if (nextLl >= cur - 1e-12 * Math.abs(cur)) break; t /= 2; }
    const change = Math.max(...step.map((s, j) => Math.abs(t * s) / Math.max(1, Math.abs(beta[j]))));
    beta = next; cur = nextLl;
    if (change < tol) { converged = true; it++; break; }
  }
  const H = Array.from({ length: k }, () => new Array(k).fill(0));
  const ps = X.map((x) => expit(dot(x, beta)));
  for (let i = 0; i < n; i++) { const w = ps[i] * (1 - ps[i]); for (let a = 0; a < k; a++) for (let b = 0; b < k; b++) H[a][b] += w * X[i][a] * X[i][b]; }
  const cov = invert(H, "propensity model");
  const maxEta = Math.max(...X.map((x) => Math.abs(dot(x, beta))));
  return { beta, se: cov.map((r, j) => Math.sqrt(r[j])), ps, logLik: cur, iterations: it, converged, separation: maxEta > 25 };
}

/** Ordinary least squares of y on the rows of X; returns coefficients. */
export function ols(X, y) {
  const k = X[0].length;
  const XtX = Array.from({ length: k }, () => new Array(k).fill(0)), Xty = new Array(k).fill(0);
  for (let i = 0; i < X.length; i++) for (let a = 0; a < k; a++) { Xty[a] += X[i][a] * y[i]; for (let b = 0; b < k; b++) XtX[a][b] += X[i][a] * X[i][b]; }
  return matVec(invert(XtX, "outcome model"), Xty);
}

// ---------- M-estimation sandwich ----------

/**
 * Sandwich covariance of an exactly identified M-estimator. `moments(theta)`
 * returns one row of estimating functions per unit; theta solves their mean
 * = 0. A is the Jacobian of the mean (central differences), B the mean outer
 * product at theta; cov = A^-1 B A^-T / n.
 */
export function sandwich(moments, theta) {
  const G = moments(theta);
  const n = G.length, m = theta.length;
  const colMeans = (M) => { const s = new Array(m).fill(0); for (const r of M) for (let j = 0; j < m; j++) s[j] += r[j]; return s.map((v) => v / n); };
  const A = Array.from({ length: m }, () => new Array(m).fill(0));
  for (let j = 0; j < m; j++) {
    const h = 1e-6 * Math.max(1, Math.abs(theta[j]));
    const up = theta.slice(), dn = theta.slice();
    up[j] += h; dn[j] -= h;
    const gu = colMeans(moments(up)), gd = colMeans(moments(dn));
    for (let i = 0; i < m; i++) A[i][j] = (gu[i] - gd[i]) / (2 * h);
  }
  const B = Array.from({ length: m }, () => new Array(m).fill(0));
  for (const r of G) for (let a = 0; a < m; a++) for (let b = 0; b < m; b++) B[a][b] += (r[a] * r[b]) / n;
  const Ai = invert(A);
  const AiB = Ai.map((row) => B[0].map((_, j) => row.reduce((s, v, l) => s + v * B[l][j], 0)));
  return AiB.map((row) => Ai.map((arow) => dot(row, arow) / n));
}

function contrast(theta, cov, alpha) {
  const z = normalQuantile(1 - alpha / 2);
  const est = theta[1] - theta[0];
  const se = Math.sqrt(cov[0][0] + cov[1][1] - 2 * cov[0][1]);
  const pValue = 2 * (1 - normalCdf(Math.abs(est / se)));
  return { estimate: est, se, ci: [est - z * se, est + z * se], pValue, pom0: theta[0], pom1: theta[1], pom0Se: Math.sqrt(cov[0][0]), pom1Se: Math.sqrt(cov[1][1]) };
}

const targetWeight = (estimand) => (estimand === "att" ? (_d, e) => e : estimand === "atc" ? (_d, e) => 1 - e : () => 1);
const kOf = (X) => X[0].length;
const linear = (X, b) => X.map((x) => dot(x, b));
const probs = (X, beta) => X.map((x) => expit(dot(x, beta)));

/**
 * Normalised IPW estimate of the ATE, ATT or ATC with the stacked sandwich
 * standard error. theta = (mu0, mu1, beta).
 */
export function ipw({ X, d, y, estimand = "ate", alpha = 0.05, fit = null }) {
  const f = fit || logit(X, d);
  const tw = targetWeight(estimand);
  const weightsAt = (e) => e.map((p, i) => tw(d[i], p) * (d[i] ? 1 / p : 1 / (1 - p)));
  const w = weightsAt(f.ps);
  let s1 = 0, s0 = 0, t1 = 0, t0 = 0;
  for (let i = 0; i < y.length; i++) { if (d[i]) { s1 += w[i]; t1 += w[i] * y[i]; } else { s0 += w[i]; t0 += w[i] * y[i]; } }
  const theta = [t0 / s0, t1 / s1, ...f.beta];
  const moments = (th) => {
    const e = probs(X, th.slice(2)), ww = weightsAt(e);
    return X.map((x, i) => [d[i] ? 0 : ww[i] * (y[i] - th[0]), d[i] ? ww[i] * (y[i] - th[1]) : 0, ...x.map((v) => v * (d[i] - e[i]))]);
  };
  const cov = sandwich(moments, theta);
  return { method: "ipw", estimand, ...contrast(theta, cov, alpha), weights: w };
}

/** Regression adjustment: each arm's OLS prediction averaged over the target group. */
export function regressionAdjustment({ X, d, y, estimand = "ate", alpha = 0.05 }) {
  const k = kOf(X);
  const idx0 = [], idx1 = [];
  d.forEach((v, i) => (v ? idx1 : idx0).push(i));
  const b0 = ols(idx0.map((i) => X[i]), idx0.map((i) => y[i]));
  const b1 = ols(idx1.map((i) => X[i]), idx1.map((i) => y[i]));
  const s = d.map((v) => (estimand === "att" ? v : estimand === "atc" ? 1 - v : 1));
  const f0 = linear(X, b0), f1 = linear(X, b1);
  const S = s.reduce((a, v) => a + v, 0);
  const theta = [f0.reduce((a, v, i) => a + s[i] * v, 0) / S, f1.reduce((a, v, i) => a + s[i] * v, 0) / S, ...b0, ...b1];
  const moments = (th) => {
    const c0 = th.slice(2, 2 + k), c1 = th.slice(2 + k);
    return X.map((x, i) => {
      const g0 = dot(x, c0), g1 = dot(x, c1);
      return [s[i] * (g0 - th[0]), s[i] * (g1 - th[1]), ...x.map((v) => (d[i] ? 0 : v * (y[i] - g0))), ...x.map((v) => (d[i] ? v * (y[i] - g1) : 0))];
    });
  };
  const cov = sandwich(moments, theta);
  return { method: "ra", estimand, ...contrast(theta, cov, alpha) };
}

/** Augmented IPW (doubly robust) estimate of the ATE. theta = (mu0, mu1, b0, b1, beta). */
export function aipw({ X, d, y, alpha = 0.05, fit = null }) {
  const k = kOf(X);
  const f = fit || logit(X, d);
  const idx0 = [], idx1 = [];
  d.forEach((v, i) => (v ? idx1 : idx0).push(i));
  const b0 = ols(idx0.map((i) => X[i]), idx0.map((i) => y[i]));
  const b1 = ols(idx1.map((i) => X[i]), idx1.map((i) => y[i]));
  const terms = (c0, c1, e) => X.map((x, i) => {
    const g0 = dot(x, c0), g1 = dot(x, c1);
    return [g0 + ((1 - d[i]) * (y[i] - g0)) / (1 - e[i]), g1 + (d[i] * (y[i] - g1)) / e[i], g0, g1];
  });
  const t = terms(b0, b1, f.ps);
  const theta = [mean(t.map((r) => r[0])), mean(t.map((r) => r[1])), ...b0, ...b1, ...f.beta];
  const moments = (th) => {
    const c0 = th.slice(2, 2 + k), c1 = th.slice(2 + k, 2 + 2 * k), beta = th.slice(2 + 2 * k);
    const e = probs(X, beta);
    const tt = terms(c0, c1, e);
    return X.map((x, i) => [tt[i][0] - th[0], tt[i][1] - th[1], ...x.map((v) => (d[i] ? 0 : v * (y[i] - tt[i][2]))), ...x.map((v) => (d[i] ? v * (y[i] - tt[i][3]) : 0)), ...x.map((v) => v * (d[i] - e[i]))]);
  };
  const cov = sandwich(moments, theta);
  return { method: "aipw", estimand: "ate", ...contrast(theta, cov, alpha) };
}

/**
 * 1:1 nearest-neighbour matching on the logit of the propensity score, within
 * a caliper of `caliper` standard deviations of the logit (0: no caliper).
 * For the ATT each treated unit gets a control; for the ATC each control gets
 * a treated unit. With replacement (default) a unit can serve as a match more
 * than once and the variance is Abadie & Imbens's (2006); without
 * replacement matching is greedy and the standard error is the paired one.
 */
export function matchNearest({ ps, d, y, estimand = "att", caliper = 0.2, alpha = 0.05, replace = true }) {
  const L = ps.map((p) => Math.log(p / (1 - p)));
  const sd = Math.sqrt(variance(L));
  const width = caliper > 0 ? caliper * sd : Infinity;
  const focal = estimand === "atc" ? 0 : 1;
  const F = [], P = [];
  d.forEach((v, i) => (v === focal ? F : P).push(i));
  // without replacement, the focal units hardest to match go first:
  // highest score for the ATT, lowest for the ATC
  F.sort((a, b) => (focal ? L[b] - L[a] : L[a] - L[b]) || a - b);
  const sorted = (ids) => { const s = ids.slice().sort((a, b) => L[a] - L[b] || a - b); return { ids: s, v: s.map((i) => L[i]) }; };
  // nearest unit of `pool` to value t (excluding `skip`), ties to the lower row
  const nearest = (pool, t, used, skip = -1, limit = Infinity) => {
    let lo = 0, hi = pool.v.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (pool.v[mid] < t) lo = mid + 1; else hi = mid; }
    let best = -1, bestDist = Infinity;
    const consider = (j, dd) => { if ((used && used[j]) || pool.ids[j] === skip) return; if (dd < bestDist || (dd === bestDist && pool.ids[j] < pool.ids[best])) { best = j; bestDist = dd; } };
    for (let j = lo - 1; j >= 0; j--) { const dd = t - pool.v[j]; if (dd > bestDist || dd > limit) break; consider(j, dd); }
    for (let j = lo; j < pool.v.length; j++) { const dd = pool.v[j] - t; if (dd > bestDist || dd > limit) break; consider(j, dd); }
    return best;
  };
  const pool = sorted(P);
  const used = replace ? null : new Uint8Array(pool.ids.length);
  const pairs = [];
  for (const i of F) {
    const j = nearest(pool, L[i], used, -1, width);
    if (j >= 0) { if (used) used[j] = 1; pairs.push(focal ? [i, pool.ids[j]] : [pool.ids[j], i]); }
  }
  const z = normalQuantile(1 - alpha / 2);
  const diffs = pairs.map(([t, c]) => y[t] - y[c]);
  const est = diffs.length ? mean(diffs) : NaN;
  let se = NaN;
  const N = diffs.length;
  if (N > 1 && !replace) se = Math.sqrt(variance(diffs) / N);
  else if (N > 1) {
    // Abadie & Imbens (2006): V = (1/N^2) sum over focal units of (diff - tau)^2
    // + (1/N^2) sum over matched units of K(K - 1) sigma^2, sigma^2 from each
    // unit's nearest neighbour in its own arm on the logit score.
    const K = new Map();
    for (const pr of pairs) { const m = focal ? pr[1] : pr[0]; K.set(m, (K.get(m) || 0) + 1); }
    const own = sorted(P);
    let v = diffs.reduce((s, x) => s + (x - est) ** 2, 0);
    for (const [m, k] of K) {
      if (k < 2) continue;
      const j = nearest(own, L[m], null, m);
      if (j >= 0) v += k * (k - 1) * 0.5 * (y[m] - y[own.ids[j]]) ** 2;
    }
    se = Math.sqrt(v) / N;
  }
  const reuse = replace ? Math.max(0, ...[...pairs.reduce((m, pr) => { const k = focal ? pr[1] : pr[0]; m.set(k, (m.get(k) || 0) + 1); return m; }, new Map()).values()]) : 1;
  return {
    method: "match", estimand, replace, estimate: est, se, ci: [est - z * se, est + z * se], pValue: 2 * (1 - normalCdf(Math.abs(est / se))),
    pairs, matched: pairs.length, unmatched: F.length - pairs.length, focalCount: F.length, distinctMatches: new Set(pairs.map((pr) => (focal ? pr[1] : pr[0]))).size, maxReuse: reuse, caliperWidth: width, logitSd: sd,
  };
}

// ---------- diagnostics ----------

function weightedMoments(v, w) {
  let sw = 0, sm = 0;
  for (let i = 0; i < v.length; i++) { sw += w[i]; sm += w[i] * v[i]; }
  const m = sm / sw;
  let ss = 0;
  for (let i = 0; i < v.length; i++) ss += w[i] * (v[i] - m) ** 2;
  return { mean: m, variance: ss / sw };
}

/**
 * Standardised mean differences and variance ratios of each column before and
 * after weights (w: one weight per unit, 0 to leave a unit out).
 */
export function balanceTable(cols, d, w) {
  return cols.map(({ name, values }) => {
    const v1 = values.filter((_, i) => d[i]), v0 = values.filter((_, i) => !d[i]);
    const pooled = Math.sqrt((variance(v1) + variance(v0)) / 2);
    const smd = (a, b) => (pooled > 0 ? (a - b) / pooled : 0);
    const w1 = w.filter((_, i) => d[i]), w0 = w.filter((_, i) => !d[i]);
    const a1 = weightedMoments(v1, w1), a0 = weightedMoments(v0, w0);
    const m1 = mean(v1), m0 = mean(v0);
    return {
      name,
      treatedMean: m1, controlMean: m0, smdBefore: smd(m1, m0), varianceRatioBefore: variance(v0) > 0 ? variance(v1) / variance(v0) : null,
      treatedMeanAfter: a1.mean, controlMeanAfter: a0.mean, smdAfter: smd(a1.mean, a0.mean), varianceRatioAfter: a0.variance > 0 ? a1.variance / a0.variance : null,
    };
  });
}

export function effectiveSampleSize(w) {
  let s = 0, s2 = 0;
  for (const v of w) { s += v; s2 += v * v; }
  return s2 > 0 ? (s * s) / s2 : 0;
}

export function overlap(ps, d, bins = 20) {
  const h1 = new Array(bins).fill(0), h0 = new Array(bins).fill(0);
  ps.forEach((p, i) => { const b = Math.min(bins - 1, Math.floor(p * bins)); (d[i] ? h1 : h0)[b]++; });
  const p1 = ps.filter((_, i) => d[i]), p0 = ps.filter((_, i) => !d[i]);
  const lo = Math.max(Math.min(...p1), Math.min(...p0)), hi = Math.min(Math.max(...p1), Math.max(...p0));
  const outside = ps.filter((p) => p < lo || p > hi).length;
  const q = (a, f) => { const s = [...a].sort((x, y) => x - y); const t = (s.length - 1) * f, j = Math.floor(t); return s[j] + (s[Math.min(j + 1, s.length - 1)] - s[j]) * (t - j); };
  const summ = (a) => ({ min: Math.min(...a), q25: q(a, 0.25), median: q(a, 0.5), q75: q(a, 0.75), max: Math.max(...a), mean: mean(a) });
  return { bins, treated: h1, control: h0, treatedSummary: summ(p1), controlSummary: summ(p0), commonSupport: [lo, hi], outsideCommonSupport: outside, extreme: ps.filter((p) => p < 0.01 || p > 0.99).length };
}

// ---------- design from a CSV ----------

/**
 * Turn records into the model's inputs. Numeric covariate columns enter as
 * they are (a column at least 90% numbers counts as numeric, and its other
 * cells make the row unreadable); any other column becomes 0/1 indicators of its
 * levels (sorted, the first left out). Rows missing anything used are dropped.
 */
export function buildDesign(records, { treatment, outcome, covariates }) {
  const notes = [];
  const kinds = covariates.map((c) => {
    const vals = records.map((r) => r[c]).filter((v) => String(v ?? "").trim() !== "" && !/^(na|nan|null)$/i.test(String(v).trim()));
    // numeric when at least 90% of the filled cells read as numbers; the rest are then dropped as unreadable
    const numeric = vals.length > 0 && vals.filter((v) => Number.isFinite(num(v))).length >= 0.9 * vals.length;
    return { name: c, numeric, levels: numeric ? null : [...new Set(vals)].sort() };
  });
  const keep = [];
  let dropped = 0;
  for (const r of records) {
    const dv = treatmentValue(r[treatment]), yv = num(r[outcome]);
    const ok = Number.isFinite(dv) && Number.isFinite(yv) && kinds.every((k) => (k.numeric ? Number.isFinite(num(r[k.name])) : k.levels.includes(r[k.name])));
    if (ok) keep.push(r); else dropped++;
  }
  if (dropped) notes.push(`${dropped} row${dropped === 1 ? "" : "s"} with a missing or unreadable treatment, outcome or covariate ${dropped === 1 ? "was" : "were"} left out.`);
  const cols = [];
  for (const k of kinds) {
    if (k.numeric) cols.push({ name: k.name, values: keep.map((r) => num(r[k.name])) });
    else {
      if (k.levels.length > 30) throw new Error(`Column "${k.name}" has ${k.levels.length} text values; give it as a number or group it first.`);
      for (const lv of k.levels.slice(1)) cols.push({ name: `${k.name}=${lv}`, values: keep.map((r) => (r[k.name] === lv ? 1 : 0)) });
      notes.push(`"${k.name}" is text, so it enters as ${k.levels.length - 1} indicator${k.levels.length === 2 ? "" : "s"} (baseline "${k.levels[0]}").`);
    }
  }
  const d = keep.map((r) => treatmentValue(r[treatment]));
  const y = keep.map((r) => num(r[outcome]));
  const X = keep.map((_, i) => [1, ...cols.map((c) => c.values[i])]);
  return { X, d, y, cols, notes, rows: keep };
}

const fmt = (v, dp = 3) => (Number.isFinite(v) ? Number(v).toFixed(dp) : "n/a");

function welch(y, d, alpha) {
  const a = y.filter((_, i) => d[i]), b = y.filter((_, i) => !d[i]);
  const est = mean(a) - mean(b), se = Math.sqrt(variance(a) / a.length + variance(b) / b.length);
  const z = normalQuantile(1 - alpha / 2);
  return { method: "naive", estimand: "difference", estimate: est, se, ci: [est - z * se, est + z * se], pValue: 2 * (1 - normalCdf(Math.abs(est / se))), pom0: mean(b), pom1: mean(a) };
}

function trimBounds(trim) {
  if (trim === "none" || trim === "" || trim === null || trim === undefined) return null;
  if (trim === "crump") return 0.1;
  const a = Number(trim);
  if (!(a > 0 && a < 0.5)) throw new Error("trim must be none, crump, or a number between 0 and 0.5.");
  return a;
}

/**
 * Full analysis from a CSV: the propensity model, IPW, regression adjustment,
 * AIPW and matching for the ATE, ATT and ATC, balance for the chosen
 * estimand's weights and matches, overlap and effective sample sizes.
 */
export function analyze(input = {}) {
  const o = { ...DEFAULTS, ...Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined && v !== null && v !== "")) };
  const estimand = String(o.estimand).toLowerCase();
  if (!["ate", "att", "atc"].includes(estimand)) throw new Error("estimand must be ate, att or atc.");
  const alpha = Number(o.alpha);
  if (!(alpha > 0 && alpha < 1)) throw new Error("alpha must be between 0 and 1.");
  const caliper = Number(o.caliper);
  if (!(caliper >= 0)) throw new Error("caliper must be zero (no caliper) or a positive number of standard deviations.");
  const trimA = trimBounds(o.trim);
  const replace = !(o.replace === false || /^(false|no|0)$/i.test(String(o.replace)));
  const { header, records } = parseCsv(o.csv);
  for (const [k, label] of [["treatment", "treatment"], ["outcome", "outcome"]]) {
    if (!o[k]) throw new Error(`Name the ${label} column.`);
    if (!header.includes(o[k])) throw new Error(`No column named "${o[k]}" (columns: ${header.join(", ")}).`);
  }
  const covariates = (Array.isArray(o.covariates) ? o.covariates : String(o.covariates || "").split(/\s*,\s*/)).map((s) => s.trim()).filter(Boolean);
  if (!covariates.length) throw new Error("Name at least one covariate: something measured before treatment that affects both who was treated and the outcome.");
  for (const cv of covariates) {
    if (!header.includes(cv)) throw new Error(`No covariate column named "${cv}".`);
    if (cv === o.treatment || cv === o.outcome) throw new Error(`"${cv}" is the treatment or the outcome; it cannot also be a covariate.`);
  }
  let design = buildDesign(records, { treatment: o.treatment, outcome: o.outcome, covariates });
  const notes = [...design.notes];
  const check = (des) => {
    const n1 = des.d.filter((v) => v).length, n0 = des.d.length - n1;
    if (n1 < 5 || n0 < 5) throw new Error(`Need at least 5 treated and 5 control units (found ${n1} treated and ${n0} control). Treatment must be 0/1 (or yes/no).`);
    if (Math.min(n1, n0) < 2 * des.X[0].length) notes.push(`Only ${Math.min(n1, n0)} units in the smaller arm for ${des.X[0].length} coefficients per model: estimates will be noisy.`);
    return { n1, n0 };
  };
  check(design);
  let fit = logit(design.X, design.d);
  let trimmed = null;
  if (trimA !== null) {
    const keepIdx = fit.ps.map((p, i) => (p >= trimA && p <= 1 - trimA ? i : -1)).filter((i) => i >= 0);
    trimmed = { bounds: [trimA, 1 - trimA], dropped: design.d.length - keepIdx.length, dropTreated: fit.ps.filter((p, i) => design.d[i] && (p < trimA || p > 1 - trimA)).length };
    if (trimmed.dropped) {
      design = { ...design, X: keepIdx.map((i) => design.X[i]), d: keepIdx.map((i) => design.d[i]), y: keepIdx.map((i) => design.y[i]), cols: design.cols.map((c) => ({ ...c, values: keepIdx.map((i) => c.values[i]) })), rows: keepIdx.map((i) => design.rows[i]) };
      check(design);
      fit = logit(design.X, design.d);
      notes.push(`Trimming dropped ${trimmed.dropped} units with an estimated propensity score outside [${trimA}, ${1 - trimA}] and refitted the model on the rest. The effect is now about the units that remain, not the whole sample.`);
    }
  }
  const { X, d, y, cols } = design;
  const n1 = d.filter((v) => v).length, n0 = d.length - n1;
  if (!fit.converged) notes.push("The propensity model did not fully converge; check for a covariate that nearly predicts treatment.");
  if (fit.separation) notes.push("Some units have a propensity score extremely close to 0 or 1 (near separation): a covariate almost decides treatment, so overlap is poor and weights are unstable. Consider trimming or dropping that covariate.");
  const ov = overlap(fit.ps, d);
  if (ov.extreme) notes.push(`${ov.extreme} unit${ov.extreme === 1 ? " has" : "s have"} an estimated propensity score below 0.01 or above 0.99; their weights dominate. Consider trimming (the Crump rule drops scores outside 0.1-0.9).`);

  const run = (fn) => { try { return fn(); } catch (e) { return { error: e.message }; } };
  const est = {};
  for (const e of ["ate", "att", "atc"]) {
    est[e] = {
      ipw: run(() => ipw({ X, d, y, estimand: e, alpha, fit })),
      ra: run(() => regressionAdjustment({ X, d, y, estimand: e, alpha })),
      aipw: e === "ate" ? run(() => aipw({ X, d, y, alpha, fit })) : null,
      match: e === "ate" ? null : run(() => matchNearest({ ps: fit.ps, d, y, estimand: e, caliper, alpha, replace })),
    };
  }
  const naive = welch(y, d, alpha);
  const chosen = est[estimand];
  const w = chosen.ipw.weights || d.map(() => 1);
  const balanceWeighted = balanceTable(cols, d, w);
  const matchFor = estimand === "ate" ? est.att.match : chosen.match;
  let balanceMatched = null;
  if (matchFor && !matchFor.error && matchFor.matched > 1) {
    const mw = new Array(d.length).fill(0);
    for (const [t, c] of matchFor.pairs) { mw[t] += 1; mw[c] += 1; }
    balanceMatched = balanceTable(cols, d, mw);
  }
  const ess = { treated: effectiveSampleSize(w.filter((_, i) => d[i])), control: effectiveSampleSize(w.filter((_, i) => !d[i])) };
  const strip = (r) => (r && !r.error ? Object.fromEntries(Object.entries(r).filter(([k]) => k !== "weights" && k !== "pairs")) : r);
  const estimates = Object.fromEntries(Object.entries(est).map(([k, v]) => [k, Object.fromEntries(Object.entries(v).map(([m, r]) => [m, strip(r)]))]));

  const lvl = Math.round((1 - alpha) * 100);
  const name = { ate: "average treatment effect (everyone)", att: "average effect on the treated", atc: "average effect on the controls (if they had been treated)" }[estimand];
  const lead = estimand === "ate" && !chosen.aipw.error ? chosen.aipw : chosen.ipw;
  const parts = [];
  if (lead && !lead.error) {
    parts.push(`Estimated ${name}: ${fmt(lead.estimate)} by ${lead.method === "aipw" ? "doubly robust AIPW" : "inverse probability weighting"} (${lvl}% CI ${fmt(lead.ci[0])} to ${fmt(lead.ci[1])}, ${lead.pValue < 0.0001 ? "p < 0.0001" : `p = ${fmt(lead.pValue, 4)}`}).`);
    parts.push(`The raw difference in means is ${fmt(naive.estimate)}; the gap between the two is what the covariates explain about who was treated.`);
    const others = [chosen.ipw, chosen.ra, chosen.aipw, chosen.match].filter((r) => r && !r.error && Number.isFinite(r.estimate));
    if (others.length > 1) {
      const lo = Math.min(...others.map((r) => r.estimate)), hi = Math.max(...others.map((r) => r.estimate));
      parts.push(`The ${others.length} adjusted estimators range from ${fmt(lo)} to ${fmt(hi)}${new Set(others.map((r) => Math.sign(r.estimate))).size > 1 ? ", and disagree on the sign: the answer depends on the model" : ""}.`);
    }
  }
  const worst = balanceWeighted.reduce((m, b) => Math.max(m, Math.abs(b.smdAfter)), 0);
  const worstBefore = balanceWeighted.reduce((m, b) => Math.max(m, Math.abs(b.smdBefore)), 0);
  parts.push(worst <= 0.1 ? `After weighting every covariate's standardised difference is at most ${fmt(worst, 3)} (from ${fmt(worstBefore, 3)} before), within the usual 0.1.` : `After weighting the largest standardised difference is still ${fmt(worst, 3)} (before ${fmt(worstBefore, 3)}): balance is not achieved, so add terms to the propensity model or trim.`);
  parts.push(`Effective sample sizes under the weights: ${fmt(ess.treated, 0)} of ${n1} treated and ${fmt(ess.control, 0)} of ${n0} controls.`);
  if (matchFor && !matchFor.error && matchFor.unmatched) parts.push(`Matching left ${matchFor.unmatched} of ${matchFor.focalCount} ${matchFor.estimand === "atc" ? "controls" : "treated units"} without a partner inside the caliper, so the matched estimate is about the rest.`);
  if (matchFor && !matchFor.error && !replace) parts.push("Matching without replacement can run out of good partners where scores are high; on this tool's simulation study it was biased where matching with replacement was not (README).");
  if (matchFor && !matchFor.error && replace && matchFor.maxReuse > 5) parts.push(`One ${matchFor.estimand === "atc" ? "treated unit" : "control"} is reused as a match ${matchFor.maxReuse} times; the matched estimate leans on a few units.`);
  parts.push("These numbers are causal only if every common cause of treatment and outcome is among the covariates; no diagnostic here can check that.");

  return {
    summary: parts.join(" "),
    options: { estimand, trim: trimA === null ? "none" : trimA, caliper, replace, alpha, treatment: o.treatment, outcome: o.outcome, covariates },
    n: { total: d.length, treated: n1, control: n0 },
    propensityModel: { terms: ["(intercept)", ...cols.map((c) => c.name)], coefficients: fit.beta, se: fit.se, logLik: fit.logLik, iterations: fit.iterations, converged: fit.converged },
    naive,
    estimates,
    balance: { weighted: balanceWeighted, matched: balanceMatched, matchedFor: matchFor && !matchFor.error ? matchFor.estimand : null },
    effectiveSampleSize: ess,
    overlap: ov,
    trimmed,
    scores: fit.ps,
    treated: d,
    rows: design.rows.length,
    notes,
    papers: PAPERS.map((q) => ({ authors: q.authors, year: q.year, title: q.title, url: q.url })),
  };
}
