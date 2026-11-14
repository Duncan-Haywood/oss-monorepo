// Graded pairwise answers ("a bit better" / "much better") as an ordinal
// Bradley-Terry model, pure and DOM-free (graded-fit.test.mjs).
//
// The person compares A and B on a latent scale z = (x_A - x_B) + e, with e
// logistic, and answers
//   "much better: A"  when z > tau,
//   "a bit better: A" when 0 < z < tau,
// and the mirror images for B. Integrating e out:
//   P(much A)  = sigma(d - tau)
//   P(bit A)   = sigma(d) - sigma(d - tau) = sigma(d) sigma(tau - d) (1 - e^-tau)
// with d = x_A - x_B. Dropping the constant, both are sums of log-sigmoid
// terms, log sigma(x_w - x_l - offset):
//   much A   -> one term (A over B, offset tau)
//   bit A    -> (A over B, offset 0) + (B over A, offset -tau)
//   ungraded -> (A over B, offset 0), the plain Bradley-Terry win, which is
//               also the two graded answers added together, so an old code
//               with no grades reads exactly as before
//   tie      -> half a win each way (btRefit.mjs's convention).
// Each term is concave in x, so Newton's method with the Gaussian prior
// converges; the covariance is the inverse negative Hessian at the mode
// (Laplace), the same shape `fit` in rank-core.mjs returns ({ mu, cov, n }).
//
// tau is fixed, not fitted per person: with a dozen answers per criterion a
// per-person threshold is mostly noise. GRADED_TAU = 2 means a person whose
// options are level on a criterion still says "much" about one time in nine
// (sigma(-2) = 0.12 each way); docs/DECIDE-PAGE.md "Graded answers" measures
// what a wrong tau costs.
import { cholesky, cholSolve, cholInverse, REFIT_PRIOR_PHI } from "./engine/btRefit.mjs";

export const GRADED_TAU = 2;
/** Grade codes on an answer: undefined/0 ungraded, 1 "a bit", 2 "much". */
export const BIT = 1, MUCH = 2;

const logSig = (x) => (x >= 0 ? -Math.log1p(Math.exp(-x)) : x - Math.log1p(Math.exp(x)));
const sig = (x) => (x >= 0 ? 1 / (1 + Math.exp(-x)) : Math.exp(x) / (1 + Math.exp(x)));

/** The log-sigmoid terms for answers [winner, loser, tie, grade]: [w, l, offset, weight]. */
export function gradedTerms(answers, tau = GRADED_TAU) {
  const terms = [];
  for (const [w, l, tie, grade] of answers) {
    if (tie) { terms.push([w, l, 0, 0.5], [l, w, 0, 0.5]); continue; }
    if (grade === MUCH) terms.push([w, l, tau, 1]);
    else if (grade === BIT) terms.push([w, l, 0, 1], [l, w, -tau, 1]);
    else terms.push([w, l, 0, 1]);
  }
  return terms;
}

/** Posterior mode and Laplace covariance of n item scores from graded answers. */
export function gradedFit(n, answers, { tau = GRADED_TAU, priorPhi = REFIT_PRIOR_PHI, maxIterations = 50, tolerance = 1e-9 } = {}) {
  const terms = gradedTerms(answers, tau);
  const pp = 1 / (priorPhi * priorPhi);
  const logPost = (mu) => {
    let s = 0;
    for (const m of mu) s -= 0.5 * pp * m * m;
    for (const [w, l, o, k] of terms) s += k * logSig(mu[w] - mu[l] - o);
    return s;
  };
  const curvature = (mu) => {
    const h = new Float64Array(n * n), grad = new Array(n);
    for (let i = 0; i < n; i++) { grad[i] = -pp * mu[i]; h[i * n + i] = pp; }
    for (const [w, l, o, k] of terms) {
      const x = mu[w] - mu[l] - o, q = sig(-x), c = k * q * (1 - q);
      grad[w] += k * q; grad[l] -= k * q;
      h[w * n + w] += c; h[l * n + l] += c; h[w * n + l] -= c; h[l * n + w] -= c;
    }
    return { h, grad };
  };
  let mu = new Array(n).fill(0), current = logPost(mu);
  for (let it = 0; it < maxIterations; it++) {
    const { h, grad } = curvature(mu);
    const step = cholSolve(cholesky(h, n), n, grad);
    let t = 1, next = mu.map((m, i) => m + step[i]), value = logPost(next);
    while (value < current - 1e-12 && t > 1e-6) { t /= 2; next = mu.map((m, i) => m + t * step[i]); value = logPost(next); }
    mu = next; current = value;
    if (Math.max(0, ...step.map((s) => Math.abs(t * s))) < tolerance) break;
  }
  const l = cholesky(curvature(mu).h, n);
  // Laplace log evidence up to a constant that does not depend on tau: the
  // mode's log posterior, the log(1 - e^-tau) each "a bit" answer dropped
  // above, and -1/2 log det of the negative Hessian.
  let logDet = 0;
  for (let i = 0; i < n; i++) logDet += 2 * Math.log(l[i * n + i]);
  const bits = answers.filter((a) => !a[2] && a[3] === BIT).length;
  const logEvidence = current + bits * Math.log(-Math.expm1(-tau)) - 0.5 * logDet;
  return { mu, cov: cholInverse(l, n), n, logEvidence };
}

/**
 * The person's own threshold, from all their graded answers at once (every
 * criterion's option fit and the criteria fit share one tau): the maximum of
 * the summed Laplace evidence times a log-normal prior centred on
 * GRADED_TAU (sd TAU_PRIOR_SD on log tau), by golden-section search on log
 * tau in [TAU_MIN, TAU_MAX]. The prior keeps a handful of answers near the
 * default; a person who says "much" for most picks pulls tau down, so their
 * "much" answers count for less (docs/DECIDE-PAGE.md "Graded answers").
 * `lists` holds [n, answers] pairs.
 */
export const TAU_MIN = 0.4, TAU_MAX = 6, TAU_PRIOR_SD = 0.5, TAU_STEPS = 14;
export function estimateTau(lists, { steps = TAU_STEPS } = {}) {
  const graded = lists.filter(([, a]) => hasGrades(a));
  if (!graded.length) return GRADED_TAU;
  const m0 = Math.log(GRADED_TAU);
  const f = (lt) => {
    const tau = Math.exp(lt);
    let s = -0.5 * ((lt - m0) / TAU_PRIOR_SD) ** 2;
    for (const [n, a] of graded) s += gradedFit(n, a, { tau }).logEvidence;
    return s;
  };
  const g = (Math.sqrt(5) - 1) / 2;
  let lo = Math.log(TAU_MIN), hi = Math.log(TAU_MAX);
  let x1 = hi - g * (hi - lo), x2 = lo + g * (hi - lo), f1 = f(x1), f2 = f(x2);
  for (let i = 0; i < steps; i++) {
    if (f1 < f2) { lo = x1; x1 = x2; f1 = f2; x2 = lo + g * (hi - lo); f2 = f(x2); }
    else { hi = x2; x2 = x1; f2 = f1; x1 = hi - g * (hi - lo); f1 = f(x1); }
  }
  return Math.exp((lo + hi) / 2);
}

/** True when any [winner, loser, tie, grade] answer carries a grade (so the graded fit, not the plain one, applies). */
export const hasGrades = (answers) => answers.some((a) => !a[2] && (a[3] === BIT || a[3] === MUCH));
