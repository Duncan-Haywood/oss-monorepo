/**
 * A per-respondent lapse estimate: the share of this person's answers that
 * look like coin flips, read from their own answers.
 *
 * The Glicko update with a lapse term (glicko2.ts, `lapse`) needs an assumed
 * share e of random answers. A fixed e is a discount every respondent pays,
 * honest or not (docs/INFORMATION-GAIN-SELECTOR.md, "A Glicko update with a
 * lapse term"). This reads e from the respondent instead: a grid posterior
 * over e, where each answer's likelihood is e/2 + (1 - e) p and p is the
 * chance, under the current ratings and their rd, that the item they picked
 * beats the other. Answers that keep contradicting the ratings raise e;
 * answers that agree with them keep it near the prior's 0.
 *
 * Measured, not shipped (docs/INFORMATION-GAIN-SELECTOR.md, "A per-respondent
 * lapse estimate"): at survey lengths one person's answers barely move this
 * posterior, in-sample or prequential, and not at all under the staged
 * selector, whose pairs the ratings call even. Kept as the measurement.
 *
 * Anchor pairs (scripts/anchor-lapse-sweep.ts) give it a signal under the
 * staged selector; pooledLapsePrior and posteriorMean below fit a survey's
 * lapse distribution from everyone's answers ("Anchor pairs and a pooled
 * survey prior" in the same doc). Also measured, not shipped.
 */
import { GLICKO_SCALE, type GlickoState } from "@/lib/glicko2";

/**
 * One answer. `p`, when present, is the chance the picked item won as the
 * ratings stood just before this answer was applied (prequential); without it
 * the current states are used (in-sample, which reads low).
 */
export type LapseAnswer = { picked: string; other: string; p?: number };

/** Grid of lapse shares 0, 0.025, ..., 0.9. */
export const LAPSE_GRID: readonly number[] = Array.from({ length: 37 }, (_, i) => i * 0.025);

/**
 * Prior weight on each grid value: Beta(1, b), density (1 - e)^(b - 1),
 * mean 1 / (1 + b). b = 19 (mean 0.05) is the measured default; it keeps
 * a respondent with few answers near 0, so an honest one pays little.
 */
export const DEFAULT_PRIOR_B = 19;

export type LapseEstimateOptions = {
  priorB?: number;
  /** "mean" (posterior mean, default) or "map" (posterior mode). */
  summary?: "mean" | "map";
};

function g(phi: number): number {
  return 1 / Math.sqrt(1 + (3 * phi * phi) / (Math.PI * Math.PI));
}

/**
 * Chance that `picked` beats `other` under their current states, with the
 * uncertainty of both folded in through Glicko's g (rd of the difference).
 */
export function pickProbability(picked: GlickoState, other: GlickoState): number {
  const d = (picked.rating - other.rating) / GLICKO_SCALE;
  const phi = Math.hypot(picked.rd, other.rd) / GLICKO_SCALE;
  return 1 / (1 + Math.exp(-g(phi) * d));
}

/**
 * Posterior over LAPSE_GRID given the answers and the current states.
 * Answers naming an unknown item are skipped. Returns normalised weights.
 */
export function lapsePosterior(
  answers: readonly LapseAnswer[],
  states: ReadonlyMap<string, GlickoState>,
  priorB = DEFAULT_PRIOR_B
): number[] {
  if (!(priorB >= 1)) throw new RangeError("priorB must be at least 1");
  const logw = LAPSE_GRID.map((e) => (priorB - 1) * Math.log1p(-e));
  for (const ans of answers) {
    let p = ans.p;
    if (p === undefined) {
      const a = states.get(ans.picked);
      const b = states.get(ans.other);
      if (!a || !b) continue;
      p = pickProbability(a, b);
    }
    for (let k = 0; k < LAPSE_GRID.length; k++) {
      const e = LAPSE_GRID[k];
      logw[k] += Math.log(e / 2 + (1 - e) * p);
    }
  }
  const top = Math.max(...logw);
  const w = logw.map((x) => Math.exp(x - top));
  const total = w.reduce((s, x) => s + x, 0);
  return w.map((x) => x / total);
}

/** The lapse share to pass to applyComparison for this respondent's next answer. */
export function estimateLapse(
  answers: readonly LapseAnswer[],
  states: ReadonlyMap<string, GlickoState>,
  options: LapseEstimateOptions = {}
): number {
  const post = lapsePosterior(answers, states, options.priorB ?? DEFAULT_PRIOR_B);
  if (options.summary === "map") {
    let best = 0;
    for (let k = 1; k < post.length; k++) if (post[k] > post[best]) best = k;
    return LAPSE_GRID[best];
  }
  return post.reduce((s, w, k) => s + w * LAPSE_GRID[k], 0);
}

/**
 * Posterior mean of e from a grid log-likelihood and a grid log-prior (both
 * over LAPSE_GRID, any additive constant).
 */
export function posteriorMean(logLik: readonly number[], logPrior: readonly number[]): number {
  if (logLik.length !== LAPSE_GRID.length || logPrior.length !== LAPSE_GRID.length) throw new RangeError("grid length mismatch");
  const lw = logLik.map((x, k) => x + logPrior[k]);
  const top = Math.max(...lw);
  const w = lw.map((x) => (Number.isFinite(x) ? Math.exp(x - top) : 0));
  const total = w.reduce((s, x) => s + x, 0);
  return w.reduce((s, x, k) => s + x * LAPSE_GRID[k], 0) / total;
}

/**
 * A survey's lapse distribution over LAPSE_GRID, fitted from every
 * respondent's grid log-likelihood by EM on the grid weights (the
 * nonparametric maximum-likelihood mixing distribution). Each respondent's
 * estimate is then their own likelihood times this prior (posteriorMean with
 * its log): shrunk toward how the survey's people actually behave, not
 * toward a fixed guess. A small floor keeps every grid value possible.
 */
export function pooledLapsePrior(logLiks: readonly (readonly number[])[], iterations = 300, floor = 1e-4): number[] {
  const K = LAPSE_GRID.length;
  let w = new Array<number>(K).fill(1 / K);
  if (logLiks.length === 0) return w;
  const lik = logLiks.map((ll) => {
    if (ll.length !== K) throw new RangeError("grid length mismatch");
    const top = Math.max(...ll);
    return ll.map((x) => Math.exp(x - top));
  });
  for (let it = 0; it < iterations; it++) {
    const next = new Array<number>(K).fill(0);
    for (const l of lik) {
      let z = 0;
      for (let k = 0; k < K; k++) z += w[k] * l[k];
      if (z === 0) continue;
      for (let k = 0; k < K; k++) next[k] += (w[k] * l[k]) / z;
    }
    const floored = next.map((x) => x / lik.length + floor);
    const t = floored.reduce((s, x) => s + x, 0);
    w = floored.map((x) => x / t);
  }
  return w;
}
