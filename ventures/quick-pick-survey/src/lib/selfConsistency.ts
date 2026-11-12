import { refitEvidence, refitRatings, type RefitAnswer } from "./btRefit";

/**
 * How well a respondent's own answers predict their other answers: a check on
 * carelessness that never looks at the rest of the panel
 * (docs/INFORMATION-GAIN-SELECTOR.md, "Self-consistency: a coin-flip check
 * that does not tax camps").
 *
 * The answers are split into `folds` interleaved folds (answer i in fold
 * i mod folds). Each fold is predicted by a Bradley-Terry refit (btRefit.ts) of
 * the other folds, and every held-out answer is scored in bits against a coin:
 * log2 p - log2 0.5, so a coin flipper averages about zero or below (the refit
 * learns noise) and anyone answering by a stable taste, their own or the
 * panel's, averages above it. That is the difference from the leave-one-out
 * agreement in groupRanking.ts, which scores a person against everyone else and
 * so cannot tell a careless block from a camp with a taste of its own.
 *
 * `lapse` is the share e of answers given at random that best explains the
 * held-out answers, P(answer) = e / 2 + (1 - e) p, on a grid of 0.01. The
 * held-out p comes from a refit on four fifths of the answers, so it is noisier
 * than the person's real taste and an honest respondent reads a little above
 * zero; use it relative to the panel, not as an absolute share.
 *
 * Pure: no I/O.
 */

export type SelfConsistency = {
  /** Decided answers scored (ties are scored as half a win each way). */
  answers: number;
  /** Mean held-out gain over a coin, bits per answer. */
  bitsPerAnswer: number;
  /** bitsPerAnswer over its standard error; NaN under 2 answers. */
  z: number;
  /** Share of answers best explained as coin flips, 0-1. */
  lapse: number;
  /** Natural-log Bayes factor of a Bradley-Terry taste (prior sd `priorPhi`, Laplace evidence) over a coin, on all the answers: above 0 the answers look like a taste. */
  logBayesFactor: number;
};

/** Fewer answers than this give no reading (every fold would hold one or two answers). */
export const SELF_CONSISTENCY_MIN_ANSWERS = 20;
/** Prior sd for the held-out refits, internal (logit) scale. Tighter than the
 * refit's default (Glicko's 350) because a held-out prediction from a flat
 * prior overshoots on items seen once or twice. */
export const SELF_CONSISTENCY_PRIOR_PHI = 1;

export function selfConsistency(ids: readonly string[], answers: readonly RefitAnswer[], { folds = 5, priorPhi = SELF_CONSISTENCY_PRIOR_PHI } = {}): SelfConsistency | null {
  if (answers.length < SELF_CONSISTENCY_MIN_ANSWERS) return null;
  if (!(folds >= 2) || !Number.isInteger(folds)) throw new RangeError("folds must be an integer of at least 2");
  const gains: number[] = [];
  const probs: { p: number; tie: boolean }[] = [];
  for (let f = 0; f < folds; f++) {
    const train = answers.filter((_, i) => i % folds !== f);
    const test = answers.filter((_, i) => i % folds === f);
    if (!test.length) continue;
    const fit = refitRatings(ids, train, { priorPhi });
    const at = new Map(fit.ids.map((id, i) => [id, fit.mu[i]]));
    for (const a of test) {
      const p = 1 / (1 + Math.exp(-((at.get(a.winner) ?? 0) - (at.get(a.loser) ?? 0))));
      const g = a.tie ? 0.5 * Math.log2(p) + 0.5 * Math.log2(1 - p) + 1 : Math.log2(p) + 1;
      gains.push(g);
      probs.push({ p, tie: !!a.tie });
    }
  }
  const n = gains.length;
  const mean = gains.reduce((s, g) => s + g, 0) / n;
  const sd = Math.sqrt(gains.reduce((s, g) => s + (g - mean) ** 2, 0) / Math.max(n - 1, 1));
  const z = n > 1 && sd > 0 ? mean / (sd / Math.sqrt(n)) : NaN;
  let best = 0, bestLl = -Infinity;
  for (let k = 0; k <= 100; k++) {
    const e = k / 100;
    let ll = 0;
    for (const { p, tie } of probs) {
      const q = e / 2 + (1 - e) * p;
      ll += tie ? 0.5 * Math.log(q) + 0.5 * Math.log(1 - q) : Math.log(q);
    }
    if (ll > bestLl) { bestLl = ll; best = e; }
  }
  const decided = answers.filter((a) => !a.tie).length;
  const ties = answers.length - decided;
  // A coin gives each decided answer 1/2 and a tie, scored as half a win each way, 1/2 too.
  const logBayesFactor = refitEvidence(ids, answers, priorPhi) + (decided + ties) * Math.log(2);
  return { answers: n, bitsPerAnswer: mean, z, lapse: best, logBayesFactor };
}
