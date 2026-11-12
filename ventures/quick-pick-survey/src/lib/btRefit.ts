/**
 * A Bradley-Terry refit of one respondent's answers: the posterior mode and a
 * Laplace (Gaussian) approximation of the posterior covariance, from every
 * answer at once instead of one Glicko-2 game at a time.
 *
 * Why it exists (docs/INFORMATION-GAIN-SELECTOR.md, "Per-person intervals
 * from a refit"): the staged selector asks pairs the current ratings call
 * even, and the one-game-at-a-time Glicko-2 update then shrinks rd faster
 * than the answers justify, so only about 90% of an honest respondent's 95%
 * pairwise intervals hold the true difference. A posterior computed from the
 * full likelihood does not depend on how the pairs were chosen (the
 * likelihood principle: an adaptive design changes which answers you get, not
 * what they mean), so its intervals do not inherit that bias.
 *
 * Model: mu_i ~ N(0, phi0^2) independently, with phi0 = 350 / 173.7178 (the
 * Glicko-2 starting rd on its internal scale, so an unseen item reads exactly
 * as it does today), and P(i beats j) = 1 / (1 + exp(-(mu_i - mu_j))), the
 * Glicko-2 link with g = 1. Newton's method on the log posterior, which is
 * strictly concave (the prior makes the Hessian negative definite), so it
 * converges from zero without a line search in practice; a halving step
 * guards it anyway. The covariance is the inverse of the negative Hessian at
 * the mode, by Cholesky. Dense O(n^3) in the number of items answered about:
 * fine for a person's list (a 300-item inversion is a few milliseconds), not
 * meant for a whole survey's pooled answers.
 *
 * Pure: no I/O. Ratings come back on the Glicko-2 display scale (1500 +
 * 173.7178 mu) so a caller can put them where the Glicko states go.
 */

const SCALE = 173.7178;
const CENTER = 1500;
/** Above this many answered items the dense refit costs ~0.2 s (400 items, 3000 answers); callers fall back to the stored Glicko states. */
export const REFIT_MAX_ITEMS = 300;
/** Prior sd on the internal scale: Glicko-2's starting rd of 350. */
export const REFIT_PRIOR_PHI = 350 / SCALE;

/**
 * One answer. `tie` (the "about equal" button) counts as half a win each way,
 * log-likelihood 0.5 log p + 0.5 log (1 - p): the convention Glicko-2's score
 * of 0.5 follows, so a tie pulls the two ratings together as it does today.
 */
export type RefitAnswer = { winner: string; loser: string; tie?: boolean };

export type RefitResult = {
  ids: string[];
  /** Posterior mode, internal (logit) scale, in `ids` order. */
  mu: number[];
  /** Posterior covariance, internal scale, row-major n x n. */
  cov: Float64Array;
  /** Display-scale rating and marginal sd (rd), as Glicko-2 states carry them. */
  rating: Map<string, number>;
  rd: Map<string, number>;
  iterations: number;
};

/** Lower-triangular Cholesky factor of a symmetric positive definite matrix (row-major). */
function cholesky(a: Float64Array, n: number): Float64Array {
  const l = new Float64Array(n * n);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let s = a[i * n + j];
      for (let k = 0; k < j; k++) s -= l[i * n + k] * l[j * n + k];
      if (i === j) {
        if (!(s > 0)) throw new RangeError("matrix is not positive definite");
        l[i * n + i] = Math.sqrt(s);
      } else {
        l[i * n + j] = s / l[j * n + j];
      }
    }
  }
  return l;
}

/** Solves (L L^T) x = b in place of a copy of b. */
function cholSolve(l: Float64Array, n: number, b: number[]): number[] {
  const y = b.slice();
  for (let i = 0; i < n; i++) {
    let s = y[i];
    for (let k = 0; k < i; k++) s -= l[i * n + k] * y[k];
    y[i] = s / l[i * n + i];
  }
  for (let i = n - 1; i >= 0; i--) {
    let s = y[i];
    for (let k = i + 1; k < n; k++) s -= l[k * n + i] * y[k];
    y[i] = s / l[i * n + i];
  }
  return y;
}

/** Inverse of L L^T, row-major. */
function cholInverse(l: Float64Array, n: number): Float64Array {
  const inv = new Float64Array(n * n);
  for (let c = 0; c < n; c++) {
    const e = new Array<number>(n).fill(0);
    e[c] = 1;
    const col = cholSolve(l, n, e);
    for (let r = 0; r < n; r++) inv[r * n + c] = col[r];
  }
  return inv;
}

const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));

/**
 * Refits every item in `ids` from `answers`. Items in no answer keep the prior
 * (rating 1500, rd 350). Answers naming an id outside `ids` are rejected, not
 * skipped: a silently dropped answer would make the intervals too wide with no
 * sign of why.
 */
export function refitRatings(ids: readonly string[], answers: readonly RefitAnswer[], { priorPhi = REFIT_PRIOR_PHI, maxIterations = 50, tolerance = 1e-9 } = {}): RefitResult {
  if (!(priorPhi > 0)) throw new RangeError("priorPhi must be positive");
  const n = ids.length;
  const index = new Map(ids.map((id, i) => [id, i]));
  if (index.size !== n) throw new RangeError("ids must be distinct");
  const games = answers.map(({ winner, loser, tie }) => {
    const w = index.get(winner), l = index.get(loser);
    if (w === undefined || l === undefined) throw new RangeError(`answer names an item outside the list: ${w === undefined ? winner : loser}`);
    if (w === l) throw new RangeError("an answer cannot compare an item with itself");
    return [w, l, tie ? 0.5 : 1] as const;
  });
  const prec = 1 / (priorPhi * priorPhi);
  const logPost = (mu: number[]) => {
    let s = 0;
    for (const m of mu) s -= 0.5 * prec * m * m;
    for (const [w, l, score] of games) {
      const d = mu[w] - mu[l];
      s -= score * Math.log1p(Math.exp(-d)) + (1 - score) * Math.log1p(Math.exp(d));
    }
    return s;
  };
  // Negative Hessian and gradient of the log posterior at mu.
  const curvature = (mu: number[]) => {
    const h = new Float64Array(n * n);
    const grad = mu.map((m) => -prec * m);
    for (let i = 0; i < n; i++) h[i * n + i] = prec;
    for (const [w, l, score] of games) {
      const p = sigmoid(mu[w] - mu[l]);
      grad[w] += score - p;
      grad[l] -= score - p;
      const c = p * (1 - p);
      h[w * n + w] += c;
      h[l * n + l] += c;
      h[w * n + l] -= c;
      h[l * n + w] -= c;
    }
    return { h, grad };
  };

  let mu = new Array<number>(n).fill(0);
  let iterations = 0;
  let current = logPost(mu);
  for (; iterations < maxIterations; iterations++) {
    const { h, grad } = curvature(mu);
    const step = cholSolve(cholesky(h, n), n, grad);
    let t = 1;
    let next = mu.map((m, i) => m + step[i]);
    let value = logPost(next);
    while (value < current - 1e-12 && t > 1e-6) {
      t /= 2;
      next = mu.map((m, i) => m + t * step[i]);
      value = logPost(next);
    }
    mu = next;
    const moved = Math.max(0, ...step.map((s) => Math.abs(t * s)));
    current = value;
    if (moved < tolerance) {
      iterations++;
      break;
    }
  }
  const cov = cholInverse(cholesky(curvature(mu).h, n), n);
  const rating = new Map<string, number>();
  const rd = new Map<string, number>();
  ids.forEach((id, i) => {
    rating.set(id, CENTER + SCALE * mu[i]);
    rd.set(id, SCALE * Math.sqrt(cov[i * n + i]));
  });
  return { ids: [...ids], mu, cov, rating, rd, iterations };
}

/** Posterior sd of mu_a - mu_b on the internal scale, with the covariance the marginal rds leave out. */
export function differenceSd(fit: RefitResult, a: string, b: string): number {
  const n = fit.ids.length;
  const i = fit.ids.indexOf(a), j = fit.ids.indexOf(b);
  if (i < 0 || j < 0) throw new RangeError("unknown item");
  const v = fit.cov[i * n + i] + fit.cov[j * n + j] - 2 * fit.cov[i * n + j];
  return Math.sqrt(Math.max(v, 0));
}

/**
 * Laplace approximation of the log marginal likelihood (the evidence) of the
 * answers under prior sd `priorPhi`: log p(y | mu*) - |mu*|^2 / (2 phi^2) -
 * n log phi - log det(H) / 2 (the 2 pi terms of prior and approximation
 * cancel), with mu* the posterior mode and H the negative Hessian there. Items in no answer
 * add exactly zero (mode 0, H = 1/phi^2 on their diagonal).
 */
export function refitEvidence(ids: readonly string[], answers: readonly RefitAnswer[], priorPhi: number): number {
  const fit = refitRatings(ids, answers, { priorPhi });
  const n = ids.length;
  const index = new Map(ids.map((id, i) => [id, i]));
  let s = 0;
  for (const { winner, loser, tie } of answers) {
    const d = fit.mu[index.get(winner)!] - fit.mu[index.get(loser)!];
    const score = tie ? 0.5 : 1;
    s -= score * Math.log1p(Math.exp(-d)) + (1 - score) * Math.log1p(Math.exp(d));
  }
  for (const m of fit.mu) s -= (0.5 * m * m) / (priorPhi * priorPhi);
  s -= n * Math.log(priorPhi);
  // log det H = -log det cov; the Cholesky factor of cov gives it stably.
  let logDetCov = 0;
  const l = cholesky(fit.cov, n);
  for (let i = 0; i < n; i++) logDetCov += 2 * Math.log(l[i * n + i]);
  return s + 0.5 * logDetCov;
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Draws for the sampled evidence: relative standard error of the estimate under 0.05 on 15 items x 4 answers each (scripts/eb-laplace-check.ts). */
export const EVIDENCE_DRAWS = 2000;

/**
 * Importance-sampled log marginal likelihood, on the same scale as
 * refitEvidence (both estimate log p(y | phi) itself): draws from the Laplace posterior with its
 * covariance inflated 1.1^2 (wider proposals multiply the weights' variance
 * per item: at 30 items 1.5 gave an sd of 0.3 in the log evidence, 1.1 gives 0.02), weighted by likelihood x prior / proposal. Seeded
 * (the same seed for every phi, so a search over phi sees smooth noise), so
 * the same answers always give the same number.
 *
 * Why it exists (docs/INFORMATION-GAIN-SELECTOR.md, "An empirical-Bayes
 * prior"): the Laplace evidence is biased toward a small prior sd when the
 * pairs were chosen to be close. Under the staged selector it peaks at 0.3 to
 * 0.45 where the sampled evidence peaks at 1.2 (true spread 1.155); under the
 * shipped selector the two agree (1.0).
 */
export function sampledEvidence(ids: readonly string[], answers: readonly RefitAnswer[], priorPhi: number, { draws = EVIDENCE_DRAWS, seed = 0xe71d, inflate = 1.1 } = {}): number {
  const n = ids.length;
  const index = new Map(ids.map((id, i) => [id, i]));
  const fit = refitRatings(ids, answers, { priorPhi });
  // Answers grouped by ordered pair: wins of the first item, ties, as counts, so a repeated pair costs one term.
  const pairCounts = new Map<number, { a: number; b: number; wins: number; losses: number; ties: number }>();
  for (const { winner, loser, tie } of answers) {
    const w = index.get(winner)!, lo = index.get(loser)!;
    const [a, b] = w < lo ? [w, lo] : [lo, w];
    const key = a * n + b;
    const c = pairCounts.get(key) ?? { a, b, wins: 0, losses: 0, ties: 0 };
    if (tie) c.ties++;
    else if (w === a) c.wins++;
    else c.losses++;
    pairCounts.set(key, c);
  }
  const pairs = [...pairCounts.values()];
  const pa = Int32Array.from(pairs, (c) => c.a), pb = Int32Array.from(pairs, (c) => c.b);
  // log p(a beats b) = -softplus(-d), log p(b beats a) = -softplus(d); a tie is half of each.
  const winW = Float64Array.from(pairs, (c) => c.wins + 0.5 * c.ties), lossW = Float64Array.from(pairs, (c) => c.losses + 0.5 * c.ties);
  const scaled = fit.cov.map((v) => inflate * inflate * v);
  const l = cholesky(scaled, n);
  let logDetL = 0;
  for (let i = 0; i < n; i++) logDetL += Math.log(l[i * n + i]);
  const rand = mulberry32(seed);
  const z = new Float64Array(n), x = new Float64Array(n);
  const logw = new Float64Array(draws);
  const prec = 1 / (priorPhi * priorPhi);
  const nLogPhi = n * Math.log(priorPhi);
  for (let d = 0; d < draws; d++) {
    for (let a = 0; a < n; a += 2) {
      const u = 1 - rand(), v = rand();
      const r = Math.sqrt(-2 * Math.log(u));
      z[a] = r * Math.cos(2 * Math.PI * v);
      if (a + 1 < n) z[a + 1] = r * Math.sin(2 * Math.PI * v);
    }
    let zz = 0, xx = 0;
    for (let a = 0; a < n; a++) {
      let s = fit.mu[a];
      const row = a * n;
      for (let b = 0; b <= a; b++) s += l[row + b] * z[b];
      x[a] = s;
      zz += z[a] * z[a];
      xx += s * s;
    }
    let ll = 0;
    for (let k = 0; k < pa.length; k++) {
      const diff = x[pa[k]] - x[pb[k]];
      // softplus(t) = max(t, 0) + log1p(exp(-|t|)); softplus(-d) = softplus(d) - d.
      const sp = (diff > 0 ? diff : 0) + Math.log1p(Math.exp(-Math.abs(diff)));
      ll -= winW[k] * (sp - diff) + lossW[k] * sp;
    }
    logw[d] = ll - 0.5 * prec * xx - nLogPhi + 0.5 * zz + logDetL;
  }
  let m = -Infinity;
  for (const v of logw) if (v > m) m = v;
  let sum = 0;
  for (const v of logw) sum += Math.exp(v - m);
  return m + Math.log(sum / draws);
}

/**
 * Above this many answered items the insights route skips the empirical-Bayes
 * prior and draws the favourite set from the fixed-prior refit (the search
 * takes about 60 ms at 15 items and 4 answers each, 215 ms at 30 x 8, 600 ms
 * at 60 x 8).
 */
export const EB_MAX_ITEMS = 40;

/** Narrowest prior sd the empirical-Bayes search may pick (internal scale; 0.3 is about 52 rating points). */
export const EB_PHI_MIN = 0.3;

/**
 * Empirical-Bayes prior sd for one respondent: the phi in [min, max] that
 * maximises the evidence (sampledEvidence by default; refitEvidence, the
 * Laplace form, with `evidence: "laplace"`), by golden-section search on
 * log phi. The upper end defaults to REFIT_PRIOR_PHI, so the prior is never
 * wider than the fixed one it replaces; the lower end stops the classic
 * type-II failure where few, mixed answers drive the estimate to zero and make
 * every interval falsely narrow.
 *
 * Why (docs/INFORMATION-GAIN-SELECTOR.md, "An empirical-Bayes prior"): with
 * the fixed sd of 2.0 the favourite's credible set undercovers, because a
 * prior wider than the person's real spread of likes shrinks the leader too
 * little (a winner's curse on a maximum over many items).
 */
export type EvidenceMethod = "laplace" | "sampled";

export function empiricalPriorPhi(ids: readonly string[], answers: readonly RefitAnswer[], options: { min?: number; max?: number; steps?: number; evidence?: EvidenceMethod } = {}): number {
  return pooledPriorPhi([{ ids, answers }], options);
}

/**
 * The same estimate from several respondents at once: the phi that maximises
 * the sum of their evidences, i.e. one prior sd shared by everyone in
 * a survey, each with their own scores. A single person's estimate is noisy
 * (under the staged selector, whose close pairs say little about spread, a
 * third of respondents hit the floor; docs/INFORMATION-GAIN-SELECTOR.md, "An
 * empirical-Bayes prior"); pooling over a survey's respondents is the
 * hierarchical fix.
 */
export function pooledPriorPhi(people: readonly { ids: readonly string[]; answers: readonly RefitAnswer[] }[], { min = EB_PHI_MIN, max = REFIT_PRIOR_PHI, steps = 8, evidence = "sampled" as EvidenceMethod } = {}): number {
  if (!(min > 0 && max >= min)) throw new RangeError("need 0 < min <= max");
  const ev = evidence === "laplace" ? refitEvidence : sampledEvidence;
  const used = people.filter((p) => p.answers.length > 0);
  if (used.length === 0 || min === max) return max;
  const cache = new Map<number, number>();
  const f = (x: number) => {
    let v = cache.get(x);
    if (v === undefined) cache.set(x, (v = used.reduce((s, p) => s + ev(p.ids, p.answers, Math.exp(x)), 0)));
    return v;
  };
  const g = (Math.sqrt(5) - 1) / 2;
  let a = Math.log(min), b = Math.log(max);
  let c = b - g * (b - a), d = a + g * (b - a);
  let fc = f(c), fd = f(d);
  for (let i = 0; i < steps; i++) {
    if (fc >= fd) {
      b = d; d = c; fd = fc;
      c = b - g * (b - a); fc = f(c);
    } else {
      a = c; c = d; fc = fd;
      d = a + g * (b - a); fd = f(d);
    }
  }
  // The evidence can be monotone in phi; check the ends so a boundary optimum is returned exactly.
  const mid = (a + b) / 2;
  const candidates: [number, number][] = [[Math.log(min), f(Math.log(min))], [Math.log(max), f(Math.log(max))], [mid, f(mid)]];
  candidates.sort((p, q) => q[1] - p[1]);
  return Math.exp(candidates[0][0]);
}
