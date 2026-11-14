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

Thresholds that accept fewer than m_min = ceil(log delta / log(1 - alpha)) windows are skipped, not
tested: there even zero failures cannot reject H0 (230 windows at alpha 1%, delta 0.1), so testing them
would end the sequence at once. Which thresholds are skipped depends on the scores only, never on the
labels. (Step 3's first scoring pass tested from m = 1 and abstained everywhere; see LOG.md.)

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


def min_accept(alpha, delta):
    """Smallest m at which m accepted windows with no failure reject H0: R > alpha at level delta."""
    return int(math.ceil(math.log(delta) / math.log1p(-alpha)))


def ltt_threshold(score, bad, grid, alpha=0.01, delta=0.1, min_keep=None):
    """Learn-then-Test threshold: the loosest lam in `grid` reached by fixed-sequence testing from the
    strictest. `grid` must be fixed before seeing the calibration data. Returns +inf if none passes."""
    if min_keep is None:
        min_keep = min_accept(alpha, delta)
    score = np.asarray(score, float)
    bad = np.asarray(bad, bool)
    order = np.argsort(-score, kind="mergesort")
    s_sorted, b_cum = score[order], np.cumsum(bad[order])
    best = float("inf")
    for lam in sorted(grid, reverse=True):
        m = int(np.searchsorted(-s_sorted, -lam, side="right"))  # number with score >= lam
        if m < min_keep:
            continue  # too few accepted to reject even with no failure: skip, keep walking down
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


# ---- Step 3b: a noise-aware gate --------------------------------------------------------------------------

def blind_snr_db(x, frame=512):
    """A window's own SNR estimate, needing no clean reference: the spread of its 32 ms frame energies,
    10 log10(90th / 10th percentile). Speech over a quiet floor spans tens of dB; under strong stationary
    noise the quiet frames fill up and the ratio falls towards 0 dB. A ranking of noise levels, not a
    calibrated SNR."""
    x = np.asarray(x, float)
    n = len(x) // frame
    if n < 2:
        raise ValueError("window shorter than two frames")
    e = np.mean(x[:n * frame].reshape(n, frame) ** 2, axis=1) + 1e-20
    return float(10 * np.log10(np.percentile(e, 90) / np.percentile(e, 10)))


def mondrian_edges(feature, n_bins=4, support_q=0.01):
    """Bin edges for a Mondrian (group-conditional) gate, from calibration features only (no labels):
    the calibration quantiles at 1/n_bins ... and a support floor at quantile support_q, below which a
    test window lies outside what the calibration saw and is refused."""
    f = np.asarray(feature, float)
    inner = np.quantile(f, np.arange(1, n_bins) / n_bins)
    return float(np.quantile(f, support_q)), inner


def mondrian_ltt(score, bad, feature, grid, alpha=0.01, delta=0.1, n_bins=4, support_q=0.01):
    """One Learn-then-Test threshold per feature bin. Returns (floor, inner edges, thresholds per bin).
    Each bin's test is valid for its own windows when calibration and test are exchangeable within the bin,
    so failure among accepted is controlled bin by bin (hence also pooled) under a shift that moves
    windows between bins but not within one."""
    score = np.asarray(score, float)
    bad = np.asarray(bad, bool)
    feature = np.asarray(feature, float)
    floor, inner = mondrian_edges(feature, n_bins, support_q)
    b = np.digitize(feature, inner)
    lams = [ltt_threshold(score[b == k], bad[b == k], grid, alpha, delta) for k in range(n_bins)]
    return floor, inner, lams


def mondrian_accept(score, feature, floor, inner, lams):
    """Boolean accept mask for test windows under a Mondrian gate (refused below the support floor)."""
    score = np.asarray(score, float)
    feature = np.asarray(feature, float)
    b = np.digitize(feature, inner)
    lam = np.asarray(lams, float)[b]
    return (feature >= floor) & (score >= lam)
