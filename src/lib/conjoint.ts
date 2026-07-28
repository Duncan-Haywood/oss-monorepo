/**
 * Discrete-choice conjoint model for the FINANCIAL and CONJOINED surveys,
 * where attributes are continuous rather than a fixed item list, so plain
 * Glicko-2 doesn't apply. Uses Davidson's (1970) tie-extension of the
 * Bradley-Terry model: a paired-comparison logit model with an explicit
 * "too close to call" outcome, which is exactly the A/B/Equal response we
 * collect.
 *
 * Only the utility DIFFERENCE between the two shown profiles matters (no
 * intercept term — a constant utility offset cancels out in a paired
 * comparison), so the whole model reduces to a linear predictor
 *   d = params . (featuresA - featuresB)
 * and:
 *   P(A) = e^d / (e^d + 1 + nu * e^(d/2))
 *   P(B) = 1   / (e^d + 1 + nu * e^(d/2))
 *   P(tie) = nu * e^(d/2) / (e^d + 1 + nu * e^(d/2))
 *
 * Fit by maximum likelihood (Newton-Raphson with a numerically estimated
 * Hessian, which doubles as the basis for Wald confidence intervals). A
 * small ridge penalty keeps the fit finite when data is sparse (e.g. the
 * first few trials, or a perfectly one-sided run) and encodes a "no effect
 * until the data says otherwise" prior, which is standard practice for
 * small-n discrete choice models.
 */

export type Outcome = "A" | "B" | "EQUAL";

export type FitResult = {
  /** Coefficients in the same order as the feature vectors, plus nu last. */
  params: number[];
  se: number[];
  nu: number;
  nuSe: number;
  covariance: number[][]; // over [...params, logNu]
  logLikelihood: number;
  converged: boolean;
  iterations: number;
};

const RIDGE_LAMBDA = 0.08;
const MAX_ITERATIONS = 60;
/**
 * Convergence is judged on the gradient PER OBSERVATION, not on its raw
 * norm. The log-likelihood is a sum over rows, so its gradient scales with
 * the number of trials: a fixed absolute threshold that a small fit clears
 * easily becomes unreachable as the history grows, and the fit then reports
 * `converged: false` while sitting on a perfectly good answer. A flag that
 * turns false purely because someone answered more questions is worse than
 * no flag at all.
 */
const GRAD_NORM_TOL_PER_ROW = 1e-7;
const FD_STEP = 1e-4;
const D_CLAMP = 15;
const LOG_NU_CLAMP = 3;

export type ChoiceRow = {
  /** featuresA - featuresB, precomputed by the caller. */
  deltaX: number[];
  outcome: Outcome;
};

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}

/** log-probabilities of (A, B, tie) given d = params.deltaX and logNu. */
function outcomeLogProbs(d: number, logNu: number): { A: number; B: number; EQUAL: number } {
  const dc = clamp(d, -D_CLAMP, D_CLAMP);
  const nu = Math.exp(clamp(logNu, -LOG_NU_CLAMP, LOG_NU_CLAMP));
  // work in log-space relative to the max term for stability
  const logEA = dc; // ln(e^d)
  const logEB = 0; // ln(1)
  const logETie = Math.log(nu) + dc / 2; // ln(nu * e^(d/2))
  const m = Math.max(logEA, logEB, logETie);
  const denom = Math.exp(logEA - m) + Math.exp(logEB - m) + Math.exp(logETie - m);
  const logDenom = m + Math.log(denom);
  return {
    A: logEA - logDenom,
    B: logEB - logDenom,
    EQUAL: logETie - logDenom,
  };
}

/** Total penalized log-likelihood for parameter vector [...params, logNu]. */
function logLikelihood(theta: number[], rows: ChoiceRow[]): number {
  const nParams = theta.length - 1;
  const logNu = theta[nParams];
  let ll = 0;
  for (const row of rows) {
    let d = 0;
    for (let i = 0; i < nParams; i++) d += theta[i] * row.deltaX[i];
    const probs = outcomeLogProbs(d, logNu);
    ll += probs[row.outcome];
  }
  // ridge penalty on the betas only (not logNu, which has its own natural scale)
  let penalty = 0;
  for (let i = 0; i < nParams; i++) penalty += theta[i] * theta[i];
  ll -= 0.5 * RIDGE_LAMBDA * penalty;
  return ll;
}

function numericGradient(theta: number[], rows: ChoiceRow[]): number[] {
  const grad = new Array(theta.length).fill(0);
  for (let i = 0; i < theta.length; i++) {
    const up = theta.slice();
    const down = theta.slice();
    up[i] += FD_STEP;
    down[i] -= FD_STEP;
    grad[i] = (logLikelihood(up, rows) - logLikelihood(down, rows)) / (2 * FD_STEP);
  }
  return grad;
}

function numericHessian(theta: number[], rows: ChoiceRow[]): number[][] {
  const n = theta.length;
  const hess: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  const base = logLikelihood(theta, rows);
  const fPlus = new Array(n);
  for (let i = 0; i < n; i++) {
    const up = theta.slice();
    up[i] += FD_STEP;
    fPlus[i] = logLikelihood(up, rows);
  }
  for (let i = 0; i < n; i++) {
    for (let j = i; j < n; j++) {
      let value: number;
      if (i === j) {
        const up = theta.slice();
        const down = theta.slice();
        up[i] += FD_STEP;
        down[i] -= FD_STEP;
        value = (logLikelihood(up, rows) - 2 * base + logLikelihood(down, rows)) / (FD_STEP * FD_STEP);
      } else {
        const upup = theta.slice();
        upup[i] += FD_STEP;
        upup[j] += FD_STEP;
        value =
          (logLikelihood(upup, rows) - fPlus[i] - fPlus[j] + base) / (FD_STEP * FD_STEP);
      }
      hess[i][j] = value;
      hess[j][i] = value;
    }
  }
  return hess;
}

/** Gauss-Jordan matrix inverse. n is small (<=8) so this is plenty fast. */
function invertMatrix(m: number[][]): number[][] {
  const n = m.length;
  const aug = m.map((row, i) => [
    ...row,
    ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)),
  ]);

  for (let col = 0; col < n; col++) {
    let pivotRow = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(aug[r][col]) > Math.abs(aug[pivotRow][col])) pivotRow = r;
    }
    if (Math.abs(aug[pivotRow][col]) < 1e-12) {
      aug[pivotRow][col] += 1e-8; // guard against a singular matrix
    }
    [aug[col], aug[pivotRow]] = [aug[pivotRow], aug[col]];

    const pivot = aug[col][col];
    for (let c = 0; c < 2 * n; c++) aug[col][c] /= pivot;

    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const factor = aug[r][col];
      for (let c = 0; c < 2 * n; c++) aug[r][c] -= factor * aug[col][c];
    }
  }

  return aug.map((row) => row.slice(n));
}

/**
 * Fits the model. `nFeatures` is the number of coefficients (not counting
 * nu). Returns params/se in feature order, plus nu/nuSe separately.
 */
export function fitConjointModel(rows: ChoiceRow[], nFeatures: number): FitResult {
  let theta = new Array(nFeatures + 1).fill(0); // betas + logNu, start at nu=1 (indifference baseline)

  if (rows.length === 0) {
    return {
      params: new Array(nFeatures).fill(0),
      se: new Array(nFeatures).fill(0),
      nu: 1,
      nuSe: 0,
      covariance: Array.from({ length: nFeatures + 1 }, () => new Array(nFeatures + 1).fill(0)),
      logLikelihood: 0,
      converged: true,
      iterations: 0,
    };
  }

  let converged = false;
  let iterations = 0;

  const gradTol = GRAD_NORM_TOL_PER_ROW * rows.length;

  for (; iterations < MAX_ITERATIONS; iterations++) {
    const grad = numericGradient(theta, rows);
    const gradNorm = Math.sqrt(grad.reduce((s, g) => s + g * g, 0));
    if (gradNorm < gradTol) {
      converged = true;
      break;
    }

    const hess = numericHessian(theta, rows);
    // Damp the Hessian diagonal (Levenberg-Marquardt style) for stability.
    for (let i = 0; i < hess.length; i++) hess[i][i] -= 1e-6;

    const negHessInv = invertMatrix(hess.map((row) => row.map((v) => -v)));
    const step = negHessInv.map((row) => row.reduce((s, v, j) => s + v * grad[j], 0));

    // Backtracking line search so we never step to a worse likelihood.
    const before = logLikelihood(theta, rows);
    let stepSize = 1;
    let next = theta.map((v, i) => v + stepSize * step[i]);
    let attempts = 0;
    let nextLL = logLikelihood(next, rows);
    while (nextLL < before && attempts < 20) {
      stepSize *= 0.5;
      next = theta.map((v, i) => v + stepSize * step[i]);
      nextLL = logLikelihood(next, rows);
      attempts++;
    }
    // If every halving still made things worse, the direction is unusable at
    // any scale — keep the point we have and stop. Assigning `next` anyway
    // (which is what this used to do) moves the fit DOWNHILL and then reports
    // the result as if it were a maximum. `converged` stays false: the
    // gradient is not small, we simply cannot make progress from here.
    if (nextLL < before) break;
    theta = next;
  }

  const hessFinal = numericHessian(theta, rows);
  const covFull = invertMatrix(hessFinal.map((row) => row.map((v) => -v)));
  const se = covFull.map((row, i) => Math.sqrt(Math.max(0, row[i])));

  const logNu = clamp(theta[nFeatures], -LOG_NU_CLAMP, LOG_NU_CLAMP);
  const nu = Math.exp(logNu);
  // delta method: se(nu) = nu * se(logNu)
  const nuSe = nu * se[nFeatures];

  return {
    params: theta.slice(0, nFeatures),
    se: se.slice(0, nFeatures),
    nu,
    nuSe,
    covariance: covFull,
    logLikelihood: logLikelihood(theta, rows),
    converged,
    iterations,
  };
}

export type Prediction = {
  pA: number;
  pB: number;
  pEqual: number;
  d: number;
  dSe: number;
};

/** Predicts the outcome distribution for an arbitrary (unseen) pair. */
export function predict(fit: FitResult, deltaX: number[]): Prediction {
  const nFeatures = fit.params.length;
  let d = 0;
  for (let i = 0; i < nFeatures; i++) d += fit.params[i] * deltaX[i];

  // variance of d via the delta method: deltaX' * Cov(params) * deltaX
  let variance = 0;
  for (let i = 0; i < nFeatures; i++) {
    for (let j = 0; j < nFeatures; j++) {
      variance += deltaX[i] * deltaX[j] * fit.covariance[i][j];
    }
  }
  const dSe = Math.sqrt(Math.max(0, variance));

  const logNu = Math.log(fit.nu);
  const probs = outcomeLogProbs(d, logNu);
  return {
    pA: Math.exp(probs.A),
    pB: Math.exp(probs.B),
    pEqual: Math.exp(probs.EQUAL),
    d,
    dSe,
  };
}
