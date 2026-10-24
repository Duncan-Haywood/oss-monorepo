"""Interval estimators for a stratified prevalence audit where one stratum (the coder's negatives) is sampled at
only a handful of items. Each returns (low, high, point) for the prevalence sum_s W_s p_s with known stratum
shares W_s and audited counts (x_s successes of n_s):

  wald      point = sum W p_hat, se from sample variances (qual-negaudit's interval; collapses to zero width when a
            small stratum sample is all one value)
  plus_two  Agresti-Coull style: add one success and one failure to each stratum, then Wald
  wilson    each stratum's Wilson centre and Wilson-score variance, combined by the shares and read off a normal
  jeffreys  Beta(x+1/2, n-x+1/2) posterior per stratum, equal-tailed 95% interval of the weighted sum by
            Monte Carlo (Brown, Cai and DasGupta 2001 recommend Wilson and Jeffreys for one proportion)

Stdlib only.
"""
import math
import random

Z95 = 1.959964


def wald(strata):
    est = var = 0.0
    for w, x, n in strata:
        p = x / n
        est += w * p
        var += w * w * p * (1 - p) / n
    s = Z95 * math.sqrt(var)
    return est - s, est + s, est


def plus_two(strata):
    return wald([(w, x + 1, n + 2) for w, x, n in strata])


def wilson(strata, z=Z95):
    est = var = 0.0
    for w, x, n in strata:
        p = x / n
        centre = (p + z * z / (2 * n)) / (1 + z * z / n)
        v = (p * (1 - p) / n + z * z / (4 * n * n)) / (1 + z * z / n) ** 2
        est += w * centre
        var += w * w * v
    s = z * math.sqrt(var)
    return est - s, est + s, est


def jeffreys(strata, rng, draws=1000):
    sums = sorted(sum(w * rng.betavariate(x + 0.5, n - x + 0.5) for w, x, n in strata) for _ in range(draws))
    lo, hi = sums[int(0.025 * draws)], sums[min(draws - 1, int(0.975 * draws))]
    return lo, hi, sum(sums) / draws


def strata_counts(human, neg, pos, gneg, gpos):
    n = len(neg) + len(pos)
    return [(len(idx) / n, sum(human[i] for i in g), len(g)) for idx, g in ((neg, gneg), (pos, gpos))]
