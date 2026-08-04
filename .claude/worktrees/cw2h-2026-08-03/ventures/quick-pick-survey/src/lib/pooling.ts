/**
 * Empirical-Bayes pooling of one person's ratings across their three
 * perspectives.
 *
 * ## Why this exists
 *
 * `docs/CONVERGENCE.md` names this "the largest untaken win, and the one most
 * likely to be got subtly wrong". The appeal is real: a person rates the same
 * items three times — what they want for themselves (SELF), what they want in
 * a partner (PARTNER), and what they think their partner wants
 * (PARTNER_GUESS) — and the three sets of answers share nothing at all. Three
 * separate ratings, three separate deviations, three times the answers before
 * any of them is usable. Since the three are obviously correlated, a
 * hierarchical prior should be able to borrow strength between them and reach
 * the couple screen's `rd < 150` for a third of the budget.
 *
 * ## Why it is NOT wired into the app
 *
 * Because it works, and that is the problem. `pooling.simulation.test.ts`
 * measures it against the real Glicko-2 loop, and the measurement is in
 * `docs/POOLING.md`. The short version:
 *
 * Pooling shrinks each perspective toward the person's own cross-perspective
 * mean. For SELF and PARTNER that is a fair trade. For PARTNER_GUESS it is
 * not, because "this person's guess about their partner is pulled toward what
 * this person wants for themselves" is not a modelling artefact — it is
 * *precisely the egocentric bias the blind-spots screen exists to detect*.
 * The estimator cannot distinguish the two, so it removes the signal and
 * reports the residue with tighter error bars.
 *
 * Kept as a written, tested implementation rather than deleted so the finding
 * is reproducible and so the decision can be revisited against a real
 * estimator instead of an imagined one. Do not import it into a route or a
 * screen without reading `docs/POOLING.md` first.
 *
 * @see docs/POOLING.md
 * @see docs/CONVERGENCE.md
 */

/** One item's estimate under one perspective. `rd` is the standard error. */
export type Estimate = { rating: number; rd: number };

/**
 * One person's estimates: perspective -> item label -> estimate. Item labels
 * are the join key across perspectives, the same way `rankingFor` merges the
 * activities/professions/combined surveys.
 */
export type ByPerspective = Map<string, Map<string, Estimate>>;

/** Glicko-2's starting deviation. At or above it, nothing has been learned. */
const MAX_RD = 349;

/**
 * Estimated variance *between* a person's perspectives on the same item, on
 * the Glicko rating scale, by method of moments.
 *
 * The model is `r[i][p] = mu[i] + delta[i][p] + e[i][p]`, where `mu[i]` is the
 * person's item-level common component, `delta ~ N(0, tau^2)` is how much this
 * perspective genuinely departs from it, and `e ~ N(0, rd^2)` is measurement
 * error. For k observations of one item,
 *
 *     E[sample variance across perspectives] = tau^2 + mean(rd^2)
 *
 * so subtracting the mean squared deviation from the observed spread leaves
 * `tau^2`. Floored at zero: a negative estimate means the observed spread is
 * smaller than measurement error alone predicts, which is evidence for total
 * agreement, not for negative variance.
 *
 * This is the safety valve for the whole idea. A person whose perspectives
 * genuinely diverge produces a large `tau^2`, which makes the prior diffuse
 * and the shrinkage negligible — so pooling cannot manufacture agreement out
 * of nothing. What it *can* still do is shrink the handful of items that
 * disagree inside an otherwise-agreeing person, because `tau^2` is estimated
 * once across all items rather than per item. That tail is exactly where a
 * blind spot lives, and it is why the measurement matters more than the
 * derivation.
 */
export function betweenPerspectiveVariance(byPerspective: ByPerspective): number {
  const perspectives = [...byPerspective.values()];
  if (perspectives.length < 2) return Infinity;

  const labels = new Set<string>();
  for (const m of perspectives) for (const label of m.keys()) labels.add(label);

  let spreadSum = 0;
  let errorSum = 0;
  let counted = 0;

  for (const label of labels) {
    const observed = perspectives
      .map((m) => m.get(label))
      .filter((e): e is Estimate => e !== undefined && e.rd < MAX_RD);
    if (observed.length < 2) continue;

    const k = observed.length;
    const mean = observed.reduce((s, e) => s + e.rating, 0) / k;
    // Unbiased sample variance of the k perspective estimates for this item.
    spreadSum += observed.reduce((s, e) => s + (e.rating - mean) ** 2, 0) / (k - 1);
    errorSum += observed.reduce((s, e) => s + e.rd ** 2, 0) / k;
    counted++;
  }

  // No item measured under two perspectives: nothing licenses borrowing.
  if (counted === 0) return Infinity;
  return Math.max(0, spreadSum / counted - errorSum / counted);
}

/**
 * Pools each perspective toward the evidence from the person's *other*
 * perspectives, leaving one perspective's own answers as the only direct
 * evidence about it.
 *
 * Leave-one-out is deliberate: including a perspective in the prior it is then
 * shrunk toward would use each answer twice and understate the resulting
 * deviation, which is the failure mode that makes a pooled estimate look more
 * certain than it is.
 *
 * Returns a new map; the input is not modified. Items measured under only one
 * perspective come back unchanged, since there is nothing to borrow from.
 */
export function poolAcrossPerspectives(byPerspective: ByPerspective): ByPerspective {
  const tauSq = betweenPerspectiveVariance(byPerspective);
  const out: ByPerspective = new Map();

  // Infinite between-perspective variance means the perspectives carry no
  // information about each other. Return the input untouched rather than
  // dividing by infinity all the way down.
  if (!Number.isFinite(tauSq)) {
    for (const [p, m] of byPerspective) out.set(p, new Map(m));
    return out;
  }

  for (const [perspective, own] of byPerspective) {
    const pooled = new Map<string, Estimate>();

    for (const [label, self] of own) {
      const others = [...byPerspective]
        .filter(([p]) => p !== perspective)
        .map(([, m]) => m.get(label))
        .filter((e): e is Estimate => e !== undefined && e.rd < MAX_RD);

      if (self.rd >= MAX_RD || others.length === 0) {
        pooled.set(label, { ...self });
        continue;
      }

      // Prior mean from the other perspectives, each weighted by the
      // precision of what it says about *this* one: its own measurement
      // error plus the genuine between-perspective gap.
      let priorPrecision = 0;
      let weighted = 0;
      for (const other of others) {
        const precision = 1 / (tauSq + other.rd ** 2);
        priorPrecision += precision;
        weighted += precision * other.rating;
      }
      const priorMean = weighted / priorPrecision;

      const ownPrecision = 1 / self.rd ** 2;
      const total = ownPrecision + priorPrecision;

      pooled.set(label, {
        rating: (ownPrecision * self.rating + priorPrecision * priorMean) / total,
        rd: Math.sqrt(1 / total),
      });
    }

    out.set(perspective, pooled);
  }

  return out;
}

/**
 * How far pooling moved one perspective toward another, as a correlation.
 *
 * This is the diagnostic that decided the question. Run it on PARTNER_GUESS
 * against SELF before and after pooling: any increase is egocentric bias the
 * estimator introduced, not something the person told you.
 */
export function correlation(xs: number[], ys: number[]): number {
  const n = Math.min(xs.length, ys.length);
  if (n < 2) return 0;
  const mx = xs.reduce((s, v) => s + v, 0) / n;
  const my = ys.reduce((s, v) => s + v, 0) / n;
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    dx += (xs[i] - mx) ** 2;
    dy += (ys[i] - my) ** 2;
  }
  return dx === 0 || dy === 0 ? 0 : num / Math.sqrt(dx * dy);
}

/** Ratings for the labels the two maps share, aligned index-for-index. */
export function alignOn(
  a: Map<string, Estimate>,
  b: Map<string, Estimate>
): { labels: string[]; a: number[]; b: number[] } {
  const labels = [...a.keys()].filter((l) => b.has(l)).sort();
  return {
    labels,
    a: labels.map((l) => a.get(l)!.rating),
    b: labels.map((l) => b.get(l)!.rating),
  };
}
