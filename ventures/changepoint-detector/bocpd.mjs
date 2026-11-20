// Bayesian online changepoint detection (Adams & MacKay 2007) with Normal-Inverse-Gamma, Gamma-Poisson and
// negative-binomial models, its priors and marginals, and peak picking on the change probabilities.
// Split out of engine.mjs (quality round 89, 2026-11-19: engine.mjs had grown to 3,004 lines); engine.mjs re-exports
// every name here, so existing imports keep working.

import { median, robustSd, lgamma } from './stats-core.mjs';


export const NB_CLASS_MAX = 64; // most distinct exposures the per-class prefix-sum NB cost handles
const NB_GRID = 240, NB_SPAN = 10;

/**
 * Bayesian online changepoint detection with a constant hazard and a
 * Normal-Inverse-Gamma prior (mu0, kappa0, alpha0, beta0).
 *
 * Returns, for each t, the MAP run length after seeing x[t], and
 * `changeProb[i]`: the posterior probability, given x[0..i+lag], that a new
 * segment started at x[i]. Also returns the log evidence sum log p(x_t | x_<t).
 */
export function bocpd(x, { hazardLambda = 100, lag = 5, prior, prune = 1e-10, model = 'mean', rho = 0, exposure = null, dispersion = 1, nbSize = 0 } = {}) {
  const n = x.length;
  // Counts with dispersion phi > 1: temper the Poisson likelihood by 1/phi (quasi-likelihood), i.e. counts and exposure
  // each divided by phi, so the evidence for a change is what phi times fewer independent Poisson counts would give.
  const phi = model === 'poisson' ? Math.max(1, dispersion) : 1;
  const H = 1 / Math.max(1, hazardLambda);
  const pois = model === 'poisson';
  // Clumpy counts (nbSize r > 0, no exposure): x ~ NB(r, p) with p ~ Beta(a, b), conjugate: a += r, b += x.
  // The predictive is beta-negative-binomial; alpha and beta hold a and b. Dispersion is not applied on top.
  const useNb = pois && nbSize > 0 && !exposure;
  // Clumpy counts with exposures (nbSize r > 0 and a season or trend): the rate lam has no conjugate prior when the
  // NB success probability changes with the exposure e[t], so each run keeps its posterior over lam on a log grid
  // (NB_GRID points, a factor of NB_SPAN either side of the series' mean rate per unit exposure), and the
  // predictive is the exact grid sum. The prior is Gamma(1) on lam, which is flat-ish and decays beyond the mean.
  const useNbGrid = pois && nbSize > 0 && !!exposure;
  let lamGrid = null, priorGrid = null;
  if (useNbGrid) {
    let sx = 0, se = 0;
    for (let t = 0; t < n; t++) { sx += x[t]; se += exposure[t]; }
    const m = Math.max(sx / se, 1e-3);
    lamGrid = new Float64Array(NB_GRID);
    priorGrid = new Float64Array(NB_GRID);
    let z = -Infinity;
    for (let g = 0; g < NB_GRID; g++) {
      lamGrid[g] = m * Math.exp(Math.log(NB_SPAN) * (2 * g / (NB_GRID - 1) - 1));
      priorGrid[g] = Math.log(lamGrid[g]) - lamGrid[g] / m; // Gamma(1, 1/m) density times the log-grid Jacobian
      z = logAdd(z, priorGrid[g]);
    }
    for (let g = 0; g < NB_GRID; g++) priorGrid[g] -= z;
  }
  let grids = useNbGrid ? [priorGrid] : null;
  const lgR = useNbGrid ? lgamma(nbSize) : 0;
  // Poisson counts: Gamma(alpha, beta) rate prior, negative-binomial predictive; mu and kappa are unused.
  const p0 = prior ?? (useNb ? defaultNbPrior(x, nbSize) : pois ? defaultPoissonPrior(x) : defaultPrior(x));
  // Parallel arrays over current run lengths r = 0..R-1 (index = run length, possibly pruned to a tail).
  let mu = Float64Array.of(p0.mu);
  let kappa = Float64Array.of(p0.kappa);
  let alpha = Float64Array.of(p0.alpha);
  let beta = Float64Array.of(p0.beta);
  let rl = Int32Array.of(0);
  let logR = Float64Array.of(0);
  const mapRun = new Int32Array(n);
  const expRun = new Float64Array(n);
  const changeProb = new Float64Array(n);
  const logH = Math.log(H), log1mH = Math.log1p(-H), logPrune = Math.log(prune);
  let logEvidence = 0;
  for (let t = 0; t < n; t++) {
    const xt = x[t];
    const m = rl.length;
    const logPred = new Float64Array(m);
    // AR(1) noise (rho > 0, mean model): the first point of a run is stationary, x ~ N(mu, s2 / (1 - rho^2)),
    // i.e. z = x sqrt(1 - rho^2) has regressor a0 on mu; later points are x[t] - rho x[t-1] = (1 - rho) mu + e.
    // Each run keeps a scalar-regression NIG posterior; a = 1 and no Jacobian when rho = 0.
    const a0 = Math.sqrt(1 - rho * rho);
    const zAt = (i) => (rl[i] === 0 ? xt * a0 : t ? xt - rho * x[t - 1] : (1 - rho) * xt);
    const aAt = (i) => (rl[i] === 0 ? a0 : 1 - rho);
    let lik = null;
    if (useNbGrid) {
      // log NB(x_t | r, lam e_t) on the grid: p = r / (r + lam e)
      lik = new Float64Array(NB_GRID);
      const c = lgamma(xt + nbSize) - lgR - lgamma(xt + 1), e = exposure[t];
      for (let g = 0; g < NB_GRID; g++) {
        const mean = lamGrid[g] * e;
        lik[g] = c + nbSize * Math.log(nbSize / (nbSize + mean)) + (xt > 0 ? xt * Math.log(mean / (nbSize + mean)) : 0);
      }
      for (let i = 0; i < m; i++) {
        const w = grids[i];
        let top = -Infinity;
        for (let g = 0; g < NB_GRID; g++) { const v = w[g] + lik[g]; if (v > top) top = v; }
        let acc = 0;
        for (let g = 0; g < NB_GRID; g++) acc += Math.exp(w[g] + lik[g] - top);
        logPred[i] = top + Math.log(acc);
      }
    }
    for (let i = 0; i < m; i++) {
      if (useNbGrid) continue;
      if (useNb) logPred[i] = lgamma(xt + nbSize) - lgamma(nbSize) - lgamma(xt + 1) + lbeta(alpha[i] + nbSize, beta[i] + xt) - lbeta(alpha[i], beta[i]);
      else if (pois) logPred[i] = phi === 1 ? gammaPoissonLogPmf(xt, alpha[i], beta[i], exposure ? exposure[t] : 1)
        : gammaPoissonLogPmf(xt / phi, alpha[i], beta[i], (exposure ? exposure[t] : 1) / phi) + lgamma(xt / phi + 1) - lgamma(xt + 1);
      else if (!rho) logPred[i] = studentLogPdf(xt, mu[i], kappa[i], alpha[i], beta[i]);
      else logPred[i] = studentLogPdfReg(zAt(i), aAt(i), mu[i], kappa[i], alpha[i], beta[i]) + (rl[i] === 0 ? Math.log(a0) : 0);
    }
    // Growth and changepoint masses (log space).
    const grow = new Float64Array(m);
    let cpTerms = -Infinity;
    for (let i = 0; i < m; i++) {
      const a = logR[i] + logPred[i];
      grow[i] = a + log1mH;
      cpTerms = logAdd(cpTerms, a + logH);
    }
    // New run-length list: 0 then each old run length + 1, in typed arrays of m + 1 filled in one pass (the per-step
    // spreads, pushes, maps and filters of plain arrays were most of bocpd's own time; the arithmetic is unchanged,
    // docs/history/ci-perf-2026-11-14-changepoint-bocpd-hoists.md).
    const m1 = m + 1;
    let nrl = new Int32Array(m1), nlog = new Float64Array(m1);
    let nmu = new Float64Array(m1), nk = new Float64Array(m1), na = new Float64Array(m1), nb = new Float64Array(m1);
    nlog[0] = cpTerms; nmu[0] = p0.mu; nk[0] = p0.kappa; na[0] = p0.alpha; nb[0] = p0.beta;
    let ngrids = null;
    if (useNbGrid) {
      ngrids = [priorGrid];
      for (let i = 0; i < m; i++) {
        const w = grids[i], u = new Float64Array(NB_GRID);
        for (let g = 0; g < NB_GRID; g++) u[g] = w[g] + lik[g] - logPred[i];
        ngrids.push(u);
      }
    }
    for (let i = 0; i < m; i++) {
      const j = i + 1;
      nrl[j] = rl[i] + 1;
      nlog[j] = grow[i];
      if (rho && !pois) {
        const a = aAt(i), z = zAt(i), k1 = kappa[i] + a * a;
        nmu[j] = (kappa[i] * mu[i] + a * z) / k1;
        nk[j] = k1;
        na[j] = alpha[i] + 0.5;
        nb[j] = beta[i] + (kappa[i] * (z - a * mu[i]) ** 2) / (2 * k1);
        continue;
      }
      const k1 = kappa[i] + 1;
      nmu[j] = (kappa[i] * mu[i] + xt) / k1;
      nk[j] = k1;
      if (useNbGrid) {
        na[j] = 0; nb[j] = 0;
      } else if (useNb) {
        na[j] = alpha[i] + nbSize;
        nb[j] = beta[i] + xt;
      } else if (pois) {
        na[j] = alpha[i] + xt / phi;
        nb[j] = beta[i] + (exposure ? exposure[t] : 1) / phi;
      } else {
        na[j] = alpha[i] + 0.5;
        nb[j] = beta[i] + (kappa[i] * (xt - mu[i]) ** 2) / (2 * k1);
      }
    }
    let z = -Infinity;
    for (let i = 0; i < m1; i++) z = logAdd(z, nlog[i]);
    logEvidence += z;
    // Normalise, and prune negligible run lengths in place, always keeping r = 0.
    let k = 0;
    for (let i = 0; i < m1; i++) {
      const v = nlog[i] - z;
      if (i !== 0 && !(v > logPrune)) continue;
      nrl[k] = nrl[i]; nmu[k] = nmu[i]; nk[k] = nk[i]; na[k] = na[i]; nb[k] = nb[i]; nlog[k] = v;
      if (ngrids) ngrids[k] = ngrids[i];
      k++;
    }
    if (k < m1) {
      nrl = nrl.subarray(0, k); nmu = nmu.subarray(0, k); nk = nk.subarray(0, k);
      na = na.subarray(0, k); nb = nb.subarray(0, k); nlog = nlog.subarray(0, k);
      if (ngrids) ngrids.length = k;
      let z2 = -Infinity;
      for (let i = 0; i < k; i++) z2 = logAdd(z2, nlog[i]);
      for (let i = 0; i < k; i++) nlog[i] -= z2;
    }
    rl = nrl; mu = nmu; kappa = nk; alpha = na; beta = nb; logR = nlog;
    if (ngrids) grids = ngrids;
    let best = 0, bestV = -Infinity, e = 0, pLag = 0;
    for (let i = 0; i < rl.length; i++) {
      const p = Math.exp(logR[i]);
      if (rl[i] === lag + 1) pLag = p;
      e += p * rl[i];
      if (logR[i] > bestV) { bestV = logR[i]; best = rl[i]; }
    }
    mapRun[t] = best;
    expRun[t] = e;
    // r_t counts the points of the current run up to and including x[t], so
    // the run started at x[t - lag] iff r_t = lag + 1. Run lengths are distinct, so
    // pLag is P(r_t = lag + 1), 0 when pruned (as the per-step Map of the posterior gave;
    // only the last step's posterior is read again, below).
    if (t - lag >= 1) changeProb[t - lag] = pLag;
  }
  // Points within `lag` of the end are scored with the data available.
  if (n > 0) {
    const last = new Map();
    for (let i = 0; i < rl.length; i++) last.set(rl[i], Math.exp(logR[i]));
    for (let i = Math.max(0, n - lag); i < n; i++) changeProb[i] = last.get(n - i) ?? 0;
  }
  changeProb[0] = 0; // The series starts a segment by definition; not a change.
  return { mapRun: [...mapRun], expectedRun: [...expRun], changeProb: [...changeProb], logEvidence, prior: p0, hazard: H };
}

/** Prior centred on the data: mean at the median, variance at the robust noise variance, weak (kappa=0.1, alpha=1). */
export function defaultPrior(x) {
  const sd = robustSd(x);
  return { mu: x.length ? median(x) : 0, kappa: 0.1, alpha: 1, beta: sd * sd };
}

/** Weak Gamma prior on the rate, centred on the series mean (prior weight of 1 observation). */
export function defaultPoissonPrior(x) {
  const mean = x.length ? x.reduce((s, v) => s + v, 0) / x.length : 1;
  const m = Math.max(mean, 1e-3);
  return { mu: 0, kappa: 1, alpha: m, beta: 1 };
}

/** Beta(a, b) prior on p for NB(r, p) counts: a = 2 and b set so the prior mean count r b / (a - 1) is the series mean. */
export function defaultNbPrior(x, r) {
  const mean = x.length ? x.reduce((s, v) => s + v, 0) / x.length : 1;
  return { mu: 0, kappa: 1, alpha: 2, beta: Math.max(mean, 1e-3) / r };
}

function lbeta(a, b) { return lgamma(a) + lgamma(b) - lgamma(a + b); }

/** log P(k) for a Poisson count whose rate has a Gamma(alpha, beta) posterior: negative binomial. */
function gammaPoissonLogPmf(k, alpha, beta, e = 1) {
  // k ~ Poisson(rate * e), rate ~ Gamma(alpha, beta): negative binomial with success probability beta / (beta + e)
  return lgamma(k + alpha) - lgamma(alpha) - lgamma(k + 1) + alpha * Math.log(beta / (beta + e)) + k * Math.log(e / (beta + e));
}

/** Closed-form log marginal likelihood of counts under one Gamma-Poisson segment (test reference for hazard -> 0). */
export function gammaPoissonLogMarginal(x, { alpha, beta }) {
  const a = x.reduce((s, v) => s + v, 0);
  const logFact = x.reduce((s, v) => s + lgamma(v + 1), 0);
  return alpha * Math.log(beta) - lgamma(alpha) + lgamma(alpha + a) - (alpha + a) * Math.log(beta + x.length) - logFact;
}

function studentLogPdf(x, mu, kappa, alpha, beta) {
  const nu = 2 * alpha;
  const scale2 = (beta * (kappa + 1)) / (alpha * kappa);
  const z = (x - mu) ** 2 / (nu * scale2);
  return lgamma((nu + 1) / 2) - lgamma(nu / 2) - 0.5 * Math.log(nu * Math.PI * scale2) - ((nu + 1) / 2) * Math.log1p(z);
}

/** Student-t log density of z = a mu + e under the NIG posterior of mu (regressor a); a = 1 is studentLogPdf. */
function studentLogPdfReg(z, a, mu, kappa, alpha, beta) {
  const nu = 2 * alpha;
  const scale2 = (beta * (1 + (a * a) / kappa)) / alpha;
  const d = (z - a * mu) ** 2 / (nu * scale2);
  return lgamma((nu + 1) / 2) - lgamma(nu / 2) - 0.5 * Math.log(nu * Math.PI * scale2) - ((nu + 1) / 2) * Math.log1p(d);
}

function logAdd(a, b) {
  if (a === -Infinity) return b;
  if (b === -Infinity) return a;
  return a > b ? a + Math.log1p(Math.exp(b - a)) : b + Math.log1p(Math.exp(a - b));
}

/** Closed-form log marginal likelihood of x under one Normal-Inverse-Gamma segment (test reference for hazard -> 0). */
export function nigLogMarginal(x, { mu, kappa, alpha, beta }) {
  const n = x.length;
  const mean = x.reduce((s, v) => s + v, 0) / n;
  const ss = x.reduce((s, v) => s + (v - mean) ** 2, 0);
  const kn = kappa + n;
  const an = alpha + n / 2;
  const bn = beta + ss / 2 + (kappa * n * (mean - mu) ** 2) / (2 * kn);
  return lgamma(an) - lgamma(alpha) + alpha * Math.log(beta) - an * Math.log(bn) + 0.5 * (Math.log(kappa) - Math.log(kn)) - (n / 2) * Math.log(2 * Math.PI);
}

/** Local maxima of changeProb at or above threshold, at least `gap` apart (strongest kept). */
export function peaks(prob, threshold = 0.5, gap = 3) {
  const cand = [];
  for (let i = 1; i < prob.length; i++) {
    if (prob[i] < threshold) continue;
    if ((prob[i - 1] ?? 0) > prob[i] || (prob[i + 1] ?? 0) > prob[i]) continue;
    cand.push(i);
  }
  cand.sort((a, b) => prob[b] - prob[a]);
  const kept = [];
  for (const i of cand) if (kept.every((k) => Math.abs(k - i) >= gap)) kept.push(i);
  return kept.sort((a, b) => a - b);
}
