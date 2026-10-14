"""Eliciting the variance of benign drift from two independent observations.

One observation y cannot elicit Var(y); two can, through D = (y1-y2)^2/2, which is
unbiased for the variance. Scores are applied to D. kappa = mu4/sigma^4 is the kurtosis.
"""
import math
from statistics import NormalDist

__all__ = ["pair_stat", "brier_score", "is_score", "excess_brier", "excess_is", "var_pair",
           "var_sample_variance", "pair_average_variance", "sample_variance", "pairs_efficiency",
           "score_gap_mean", "score_gap_sd", "tasks_needed", "tasks_needed_first_order",
           "mixture_variance", "known_mean_bias", "kurtosis"]

def pair_stat(y1, y2):
    return 0.5 * (y1 - y2) ** 2

def brier_score(r, d):
    """Loss (lower is better); minimised in expectation at r = E[D] = sigma^2."""
    return (r - d) ** 2

def is_score(r, d):
    """Itakura-Saito / scale-free loss d/r + ln r; minimised at r = E[D]."""
    return d / r + math.log(r)

def excess_brier(r, s2):
    return (r - s2) ** 2

def excess_is(lam):
    """Expected excess of reporting lam*sigma^2 under the scale-free loss."""
    return 1.0 / lam + math.log(lam) - 1.0

def kurtosis(mu4, s2):
    return mu4 / s2 ** 2

def var_pair(kappa, s2=1.0):
    """Var(D) for one pair of iid observations: sigma^4 (kappa+1)/2."""
    return s2 ** 2 * (kappa + 1.0) / 2.0

def var_sample_variance(n, kappa, s2=1.0):
    """Var of the unbiased sample variance of n iid observations."""
    return s2 ** 2 * (kappa - (n - 3.0) / (n - 1.0)) / n

def pair_average_variance(n, kappa, s2=1.0):
    """Var of the average of n//2 disjoint-pair statistics."""
    return var_pair(kappa, s2) / (n // 2)

def pairs_efficiency(n, kappa):
    return pair_average_variance(n, kappa) / var_sample_variance(n, kappa)

def sample_variance(ys):
    m = sum(ys) / len(ys)
    return sum((y - m) ** 2 for y in ys) / (len(ys) - 1)

def score_gap_mean(lam):
    """E[IS(lam s2, D) - IS(s2, D)] = excess_is."""
    return excess_is(lam)

def score_gap_sd(lam, kappa):
    return abs(1.0 / lam - 1.0) * math.sqrt((kappa + 1.0) / 2.0)

def tasks_needed(lam, kappa, delta=0.05):
    """Tasks m so the honest total loss beats a lam-misreport with prob 1-delta (CLT)."""
    z = NormalDist().inv_cdf(1.0 - delta)
    return z * z * (score_gap_sd(lam, kappa) / excess_is(lam)) ** 2

def tasks_needed_first_order(lam, kappa, delta=0.05):
    z = NormalDist().inv_cdf(1.0 - delta)
    return 2.0 * z * z * (kappa + 1.0) / (lam - 1.0) ** 2

def mixture_variance(v1, m1, v2, m2, w=0.5):
    """Variance of a w/(1-w) mixture: the level set {variance = v} is not convex."""
    mean = w * m1 + (1 - w) * m2
    return w * (v1 + m1 ** 2) + (1 - w) * (v2 + m2 ** 2) - mean ** 2

def known_mean_bias(mean_true, mean_assumed):
    """Reports elicited with the wrong centre estimate sigma^2 + (mean gap)^2."""
    return (mean_true - mean_assumed) ** 2
