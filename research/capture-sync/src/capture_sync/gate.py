"""A confidence gate with a distribution-free failure bound (milestone 3).

A window is accepted when its score (peak-to-sidelobe ratio, or a derived score) is at least a
threshold lam. The quantity to control is the failure rate among accepted windows,
R(lam) = P(bad | score >= lam). Learn then Test (Angelopoulos, Bates, Candes, Jordan and Lei,
arXiv:2110.01052) chooses lam on calibration data so that P(R(lam_hat) > alpha) <= delta when the
calibration and test windows are i.i.d. draws from one distribution:

  for each lam on a grid fixed in advance, test H0: R(lam) > alpha with the binomial p-value
  p(lam) = P(Bin(m, alpha) <= k), where m windows are accepted and k of them are bad (valid
  conditionally on m, since the accepted windows are i.i.d. from the conditional law);
  walk the grid from the strictest lam to the loosest (fixed-sequence testing, no multiplicity
  correction needed) and stop at the first lam whose p-value exceeds delta; return the last lam
  that passed (or +inf, abstain on everything, when even the strictest fails).

Stdlib + numpy only; the binomial CDF is summed in log space so m in the tens of thousands is fine.
"""
import math

import numpy as np


def binom_cdf(k, m, p):
    """P(Bin(m, p) <= k), exact, by a log-space sum (k and m up to ~1e6)."""
    if k < 0:
        return 0.0
    if k >= m:
        return 1.0
    if p <= 0.0:
        return 1.0
    if p >= 1.0:
        return 0.0
    lp, lq = math.log(p), math.log1p(-p)
    terms = [math.lgamma(m + 1) - math.lgamma(i + 1) - math.lgamma(m - i + 1) + i * lp + (m - i) * lq
             for i in range(int(k) + 1)]
    top = max(terms)
    return min(1.0, math.exp(top) * sum(math.exp(t - top) for t in terms))


def ltt_threshold(score, bad, grid, alpha=0.01, delta=0.1, min_keep=1):
    """Learn-then-Test threshold: the loosest lam in `grid` reached by fixed-sequence testing from the
    strictest. `grid` must be fixed before seeing the calibration data. Returns +inf if none passes."""
    score = np.asarray(score, float)
    bad = np.asarray(bad, bool)
    order = np.argsort(-score, kind="mergesort")
    s_sorted, b_cum = score[order], np.cumsum(bad[order])
    best = float("inf")
    for lam in sorted(grid, reverse=True):
        m = int(np.searchsorted(-s_sorted, -lam, side="right"))  # number with score >= lam
        if m < min_keep:
            continue  # nothing accepted yet: no evidence either way, keep walking down
        k = int(b_cum[m - 1])
        if binom_cdf(k, m, alpha) > delta:
            break
        best = float(lam)
    return best


def naive_threshold(score, bad, grid, alpha=0.01, min_keep=20):
    """Plug-in rule on the same grid: the loosest lam whose empirical failure among accepted is <= alpha
    (step 1's rule, restricted to the grid). No finite-sample guarantee."""
    score = np.asarray(score, float)
    bad = np.asarray(bad, bool)
    for lam in sorted(grid):
        keep = score >= lam
        if keep.sum() < min_keep:
            break
        if bad[keep].mean() <= alpha:
            return float(lam)
    return float("inf")


def apply_gate(score, bad, lam):
    """(share kept, failure among kept or nan, number kept)."""
    score = np.asarray(score, float)
    bad = np.asarray(bad, bool)
    keep = score >= lam
    n = int(keep.sum())
    return float(n / max(len(score), 1)), (float(bad[keep].mean()) if n else float("nan")), n
