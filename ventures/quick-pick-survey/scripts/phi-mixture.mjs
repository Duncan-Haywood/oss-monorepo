// The prior-sd mixture reads measured against the person's own prior (one
// estimate) in docs/RANK-PAGE.md, "Honest results for close calls". Both were
// rejected for the page: as a stop rule the mixture cost consistent answerers
// 20-40% more picks, and as a results table it widened their ranges (25
// options, never-wrong: mean width 10.8 -> 17.8 places) with the favourite
// chance falling further below how often the favourite was right. Kept so the
// sweeps can be rerun.
import { fit, fitAt, order, orderConfidence, rankTable, sampleRanks, stopCheck, pilePrior, STOP_CONFIDENCE, RANK_DRAWS } from "../site/rank-core.mjs";
import { refitEvidence, sampledEvidence, REFIT_PRIOR_PHI, EB_PHI_MIN } from "../site/engine/btRefit.mjs";
import { isSetAnswer } from "../site/best-worst.mjs";

const ids = (n) => Array.from({ length: n }, (_, i) => String(i));

/** Prior sds the averaged stop read weighs (log-spaced over [EB_PHI_MIN, REFIT_PRIOR_PHI]). */
export const MIX_PHI_POINTS = 6;
export const mixPhiGrid = (k = MIX_PHI_POINTS) =>
  Array.from({ length: k }, (_, i) => Math.exp(Math.log(EB_PHI_MIN) + ((Math.log(REFIT_PRIOR_PHI) - Math.log(EB_PHI_MIN)) * i) / (k - 1)));

/**
 * The stop rule's second read averaged over the prior sd rather than at one
 * estimate of it: each grid phi is weighted by the answers' evidence there
 * (flat prior on log phi), and the read is the weighted mean of
 * orderConfidence at each phi against the order the page shows. Pairs only;
 * with piles or screens it is stopCheck.
 */
export function mixedStopCheck(n, answers, { fixedFit, fixedConfidence, force = false, piles, evidence = "laplace", points = MIX_PHI_POINTS } = {}) {
  if (pilePrior(piles) || answers.some(isSetAnswer)) return stopCheck(n, answers, { fixedFit, fixedConfidence, force, piles });
  const f = fixedFit || fit(n, answers);
  const cf = fixedConfidence ?? (answers.length ? orderConfidence(f) : 0);
  if (!answers.length || (!force && cf < STOP_CONFIDENCE)) return { done: false, confidence: cf, phi: null };
  const a = answers.map(([w, l, t]) => ({ winner: String(w), loser: String(l), tie: !!t }));
  const grid = mixPhiGrid(points);
  const ev = grid.map((phi) => (evidence === "sampled" ? sampledEvidence(ids(n), a, phi) : refitEvidence(ids(n), a, phi)));
  const top = Math.max(...ev);
  const w = ev.map((e) => Math.exp(e - top));
  const W = w.reduce((x, y) => x + y, 0);
  const shownOrder = order(f);
  let ce = 0, phiMean = 0;
  grid.forEach((phi, k) => {
    if (w[k] / W < 1e-4) return;
    const c = phi >= REFIT_PRIOR_PHI * 0.999 ? orderConfidence(f, { shownOrder }) : orderConfidence(fitAt(n, answers, phi), { shownOrder });
    ce += (w[k] / W) * c;
    phiMean += (w[k] / W) * Math.log(phi);
  });
  const confidence = Math.min(cf, ce);
  return { done: confidence >= STOP_CONFIDENCE, confidence, phi: Math.exp(phiMean) };
}

/**
 * The rank table drawn from an evidence-weighted mixture over the prior sd
 * (mixPhiGrid, flat on log phi) instead of the fixed prior alone: each grid
 * fit contributes draws in proportion to its weight, ranges and favourite
 * chances come from the pooled draws, and the rows stay in the fixed fit's
 * order (the order the page shows). Pairs only; with piles or screens it is
 * rankTable at the fixed fit.
 */
export function mixedRankTable(n, answers, { fixedFit, piles, draws = RANK_DRAWS, seed = 0x51ce, points = MIX_PHI_POINTS } = {}) {
  const f = fixedFit || fit(n, answers, piles);
  if (!answers.length || pilePrior(piles) || answers.some(isSetAnswer)) return rankTable(f, { draws, seed });
  const grid = mixPhiGrid(points), w = phiWeights(n, answers, grid);
  const ranks = Array.from({ length: n }, () => new Uint16Array(draws));
  const top = new Array(n).fill(0);
  let at = 0;
  grid.forEach((phi, k) => {
    const m = k === grid.length - 1 ? draws - at : Math.round(w[k] * draws);
    if (m <= 0) return;
    const g = phi >= REFIT_PRIOR_PHI * 0.999 ? f : fitAt(n, answers, phi);
    const s = sampleRanks(g, { draws: m, seed: seed + k });
    for (let i = 0; i < n; i++) { ranks[i].set(s.ranks[i], at); top[i] += s.top[i]; }
    at += m;
  });
  const lo = Math.floor(0.05 * draws), hi = Math.min(draws - 1, Math.ceil(0.95 * draws) - 1);
  return order(f).map((i, k) => {
    const sorted = Array.from(ranks[i]).sort((a, b) => a - b);
    return { item: i, rank: k + 1, low: sorted[lo], high: sorted[hi], favourite: top[i] / draws, score: f.mu[i] };
  });
}

/** Normalised evidence weights of a phi grid for pairs-only answers (Laplace evidence, flat prior on log phi). */
export function phiWeights(n, answers, grid, evidence = "laplace") {
  const a = answers.map(([w, l, t]) => ({ winner: String(w), loser: String(l), tie: !!t }));
  const ev = grid.map((phi) => (evidence === "sampled" ? sampledEvidence(ids(n), a, phi) : refitEvidence(ids(n), a, phi)));
  const top = Math.max(...ev);
  const w = ev.map((e) => Math.exp(e - top));
  const W = w.reduce((x, y) => x + y, 0);
  return w.map((x) => x / W);
}

