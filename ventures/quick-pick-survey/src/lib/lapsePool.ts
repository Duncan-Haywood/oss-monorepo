/**
 * A pooled prior sd that models careless answers instead of gating people out.
 *
 * Why (docs/INFORMATION-GAIN-SELECTOR.md, "A pooled spread that models the
 * lapse"): a lapse looks like a smaller spread, so careless respondents pull the
 * pooled sd (and its upper end) down and every honest person's intervals with
 * it. Gating the pool by a lapse estimate failed because consistency selects on
 * the very spread being pooled ("Anchor pairs as the gate's detector"). Here
 * nobody is selected out. Each person's answers are scored under
 *
 *   P(picked beats other) = e / 2 + (1 - e) sigma(mu_picked - mu_other),
 *
 * with mu_i ~ N(0, phi^2) and their own lapse share e on a small grid. The
 * panel's lapse distribution over that grid (weights pi) is fitted by EM for
 * each phi, and the pooled log evidence is
 *
 *   sum_people log sum_k pi_k p(answers | phi, e_k),
 *
 * profiled over pi. A coin flip can then be explained by a lapse term rather
 * than by shrinking the spread everyone shares.
 *
 * Each p(answers | phi, e) is importance-sampled like btRefit's sampledEvidence,
 * from a Gaussian at that (phi, e)'s posterior mode with the Fisher information
 * as precision (always positive definite; the lapse likelihood is not
 * log-concave, so its Hessian may not be), covariance inflated 1.1^2 at e = 0
 * (as sampledEvidence) and 1.2^2 above it, where the Fisher curvature fits the
 * posterior less well: against 200,000 draws, 2,000 draws at 1.2 land within
 * -0.24 to +0.38 nats per person at 30 items and phi 2, 1,000 at 1.1 within
 * -0.35 to +0.04 (biased low, which would pull phi down).
 *
 * Pure, seeded, no I/O. Not wired into a route: measured in
 * scripts/gated-upper-sweep.ts (rule "lapse-pool").
 */
import { cholesky, cholSolve, EB_PHI_MIN, PHI_INTERVAL_DROP, REFIT_PRIOR_PHI, type RefitAnswer } from "./btRefit";

/** Lapse shares the pooled fit integrates over. 1 is a pure coin flipper, whose answers carry no information on phi. */
export const LAPSE_POOL_GRID: readonly number[] = [0, 0.1, 0.2, 0.3, 0.4, 0.6, 1];

export type LapsePoolPerson = { ids: readonly string[]; answers: readonly RefitAnswer[] };

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

const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));

/** Answers grouped by unordered pair: weight of "a picked", weight of "b picked" (a tie is half of each). */
function groupPairs(ids: readonly string[], answers: readonly RefitAnswer[]) {
  const n = ids.length;
  const index = new Map(ids.map((id, i) => [id, i]));
  const byKey = new Map<number, { a: number; b: number; wa: number; wb: number }>();
  for (const { winner, loser, tie } of answers) {
    const w = index.get(winner), l = index.get(loser);
    if (w === undefined || l === undefined) throw new RangeError("answer names an item outside the list");
    if (w === l) throw new RangeError("an answer cannot compare an item with itself");
    const [a, b] = w < l ? [w, l] : [l, w];
    const key = a * n + b;
    const c = byKey.get(key) ?? { a, b, wa: 0, wb: 0 };
    if (tie) {
      c.wa += 0.5;
      c.wb += 0.5;
    } else if (w === a) c.wa++;
    else c.wb++;
    byKey.set(key, c);
  }
  const ps = [...byKey.values()];
  return { pa: Int32Array.from(ps, (c) => c.a), pb: Int32Array.from(ps, (c) => c.b), wa: Float64Array.from(ps, (c) => c.wa), wb: Float64Array.from(ps, (c) => c.wb) };
}

type Pairs = ReturnType<typeof groupPairs>;

/** Log likelihood of the grouped answers at mu under lapse e. */
function logLik(x: ArrayLike<number>, pairs: Pairs, e: number): number {
  let s = 0;
  const { pa, pb, wa, wb } = pairs;
  for (let k = 0; k < pa.length; k++) {
    const d = x[pa[k]] - x[pb[k]];
    if (e === 0) {
      const sp = (d > 0 ? d : 0) + Math.log1p(Math.exp(-Math.abs(d)));
      s -= wa[k] * (sp - d) + wb[k] * sp;
    } else {
      const p = e / 2 + (1 - e) * sigmoid(d);
      s += wa[k] * Math.log(p) + wb[k] * Math.log(1 - p);
    }
  }
  return s;
}

/**
 * Posterior mode of mu at (phi, e) by Fisher scoring with a halving line search,
 * and the Fisher-plus-prior precision there (the proposal's inverse covariance).
 */
export function lapseMode(ids: readonly string[], answers: readonly RefitAnswer[], phi: number, e: number, { maxIterations = 60, tolerance = 1e-8 } = {}) {
  if (!(phi > 0)) throw new RangeError("phi must be positive");
  if (!(e >= 0 && e < 1)) throw new RangeError("e must be in [0, 1)");
  const n = ids.length;
  const pairs = groupPairs(ids, answers);
  const prec = 1 / (phi * phi);
  const logPost = (mu: ArrayLike<number>) => {
    let s = logLik(mu, pairs, e);
    for (let i = 0; i < n; i++) s -= 0.5 * prec * mu[i] * mu[i];
    return s;
  };
  const info = (mu: ArrayLike<number>) => {
    const h = new Float64Array(n * n);
    const g = new Array<number>(n);
    for (let i = 0; i < n; i++) {
      h[i * n + i] = prec;
      g[i] = -prec * mu[i];
    }
    const { pa, pb, wa, wb } = pairs;
    for (let k = 0; k < pa.length; k++) {
      const a = pa[k], b = pb[k];
      const s = sigmoid(mu[a] - mu[b]);
      const p = e / 2 + (1 - e) * s;
      const dp = (1 - e) * s * (1 - s);
      // d/dd of wa log p + wb log(1 - p), and the expected information per answer, dp^2 / (p (1 - p)).
      const grad = dp * (wa[k] / p - wb[k] / (1 - p));
      const c = ((wa[k] + wb[k]) * dp * dp) / (p * (1 - p));
      g[a] += grad;
      g[b] -= grad;
      h[a * n + a] += c;
      h[b * n + b] += c;
      h[a * n + b] -= c;
      h[b * n + a] -= c;
    }
    return { h, g };
  };
  let mu = new Array<number>(n).fill(0);
  let current = logPost(mu);
  for (let it = 0; it < maxIterations; it++) {
    const { h, g } = info(mu);
    const step = cholSolve(cholesky(h, n), n, g);
    let t = 1;
    let next = mu.map((m, i) => m + step[i]);
    let value = logPost(next);
    while (value < current - 1e-12 && t > 1e-6) {
      t /= 2;
      next = mu.map((m, i) => m + t * step[i]);
      value = logPost(next);
    }
    const moved = Math.max(0, ...step.map((s) => Math.abs(t * s)));
    mu = next;
    current = value;
    if (moved < tolerance) break;
  }
  return { mu, precision: info(mu).h, pairs };
}

/**
 * Importance-sampled log p(answers | phi, e) for each e in `grid` (same scale as
 * btRefit's sampledEvidence, which it matches at e = 0 up to sampling noise).
 * Seeded, the same seed for every phi and e, so a search over phi sees smooth noise.
 */
export function lapseEvidenceGrid(ids: readonly string[], answers: readonly RefitAnswer[], phi: number, { grid = LAPSE_POOL_GRID, draws = 2000, seed = 0x1a95, inflate = 1.1, inflateLapse = 1.2 } = {}): number[] {
  const n = ids.length;
  if (answers.length === 0) return grid.map(() => 0);
  const prec = 1 / (phi * phi);
  const nLogPhi = n * Math.log(phi);
  return grid.map((e) => {
    if (!(e >= 0 && e <= 1)) throw new RangeError("e must be in [0, 1]");
    // A pure coin flipper: every answer has chance 1/2 whatever mu is, so the evidence is exact.
    if (e === 1) return answers.length * Math.log(0.5);
    const { mu, precision, pairs } = lapseMode(ids, answers, phi, e);
    // Proposal N(mu, inflate^2 P^-1): x = mu + inflate L^-T z with P = L L^T.
    const l = cholesky(precision, n);
    const inf = e === 0 ? inflate : inflateLapse;
    let logDetL = 0;
    for (let i = 0; i < n; i++) logDetL += Math.log(l[i * n + i]);
    const rand = mulberry32(seed);
    const z = new Float64Array(n), x = new Float64Array(n);
    const logw = new Float64Array(draws);
    for (let d = 0; d < draws; d++) {
      for (let a = 0; a < n; a += 2) {
        const u = 1 - rand(), v = rand();
        const r = Math.sqrt(-2 * Math.log(u));
        z[a] = r * Math.cos(2 * Math.PI * v);
        if (a + 1 < n) z[a + 1] = r * Math.sin(2 * Math.PI * v);
      }
      // Solve L^T y = z (back substitution), x = mu + inflate y.
      let zz = 0, xx = 0;
      for (let i = n - 1; i >= 0; i--) {
        let s = z[i];
        for (let k = i + 1; k < n; k++) s -= l[k * n + i] * x[k];
        x[i] = s / l[i * n + i];
      }
      for (let i = 0; i < n; i++) {
        zz += z[i] * z[i];
        x[i] = mu[i] + inf * x[i];
        xx += x[i] * x[i];
      }
      // log q(x) = -n/2 log 2pi - n log inflate + log det L - zz / 2; the prior's 2pi cancels it.
      logw[d] = logLik(x, pairs, e) - 0.5 * prec * xx - nLogPhi + 0.5 * zz + n * Math.log(inf) - logDetL;
    }
    let m = -Infinity;
    for (const v of logw) if (v > m) m = v;
    let sum = 0;
    for (const v of logw) sum += Math.exp(v - m);
    return m + Math.log(sum / draws);
  });
}

/**
 * The panel's log evidence at one phi from each person's grid, profiled over the
 * lapse weights: EM for the mixing weights (a small floor keeps every grid value
 * possible), then sum log sum_k pi_k exp(L_k).
 */
export function profiledPanelEvidence(grids: readonly (readonly number[])[], { iterations = 200, floor = 1e-4 } = {}): { evidence: number; weights: number[] } {
  if (grids.length === 0) return { evidence: 0, weights: [] };
  const K = grids[0].length;
  const tops = grids.map((g) => Math.max(...g));
  const lik = grids.map((g, i) => g.map((v) => Math.exp(v - tops[i])));
  let w = new Array<number>(K).fill(1 / K);
  for (let it = 0; it < iterations; it++) {
    const next = new Array<number>(K).fill(0);
    for (const l of lik) {
      let z = 0;
      for (let k = 0; k < K; k++) z += w[k] * l[k];
      for (let k = 0; k < K; k++) next[k] += (w[k] * l[k]) / z;
    }
    const f = next.map((x) => x / lik.length + floor);
    const t = f.reduce((s, x) => s + x, 0);
    w = f.map((x) => x / t);
  }
  let evidence = 0;
  lik.forEach((l, i) => {
    let z = 0;
    for (let k = 0; k < K; k++) z += w[k] * l[k];
    evidence += tops[i] + Math.log(z);
  });
  return { evidence, weights: w };
}

/**
 * The lapse-aware pooled prior sd and the upper end of its likelihood interval
 * (the same golden-section-then-bisection shape as btRefit's pooledPriorPhiUpper),
 * plus the fitted lapse weights at the best phi.
 */
export function pooledLapseSpread(
  people: readonly LapsePoolPerson[],
  { min = EB_PHI_MIN, max = REFIT_PRIOR_PHI, steps = 8, drop = PHI_INTERVAL_DROP, bisect = 8, grid = LAPSE_POOL_GRID, draws = 2000 } = {}
): { phi: number; upper: number; weights: number[] } {
  const used = people.filter((p) => p.answers.length > 0);
  if (used.length === 0) return { phi: max, upper: max, weights: grid.map(() => 1 / grid.length) };
  const cache = new Map<number, { evidence: number; weights: number[] }>();
  const at = (x: number) => {
    let r = cache.get(x);
    if (!r) cache.set(x, (r = profiledPanelEvidence(used.map((p) => lapseEvidenceGrid(p.ids, p.answers, Math.exp(x), { grid, draws })))));
    return r;
  };
  const g = (Math.sqrt(5) - 1) / 2;
  let a = Math.log(min), b = Math.log(max);
  let c = b - g * (b - a), d = a + g * (b - a);
  for (let i = 0; i < steps; i++) {
    if (at(c).evidence >= at(d).evidence) {
      b = d; d = c; c = b - g * (b - a);
    } else {
      a = c; c = d; d = a + g * (b - a);
    }
  }
  const cands = [Math.log(min), Math.log(max), (a + b) / 2].sort((p, q) => at(q).evidence - at(p).evidence);
  const best = cands[0];
  const target = at(best).evidence - drop;
  const phi = Math.exp(best);
  const weights = at(best).weights;
  if (at(Math.log(max)).evidence >= target) return { phi, upper: max, weights };
  let lo = best, hi = Math.log(max);
  for (let i = 0; i < bisect; i++) {
    const mid = (lo + hi) / 2;
    if (at(mid).evidence >= target) lo = mid;
    else hi = mid;
  }
  return { phi, upper: Math.exp(lo), weights };
}
