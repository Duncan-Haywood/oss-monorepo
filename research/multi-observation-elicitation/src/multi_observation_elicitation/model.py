"""Multi-observation elicitation (Casalaina-Martin, Frongillo, Morgan, Waggoner 2017) applied to verifier reports of
the scale of benign floating-point drift.

A scorer that sees m i.i.d. draws y_1..y_m of the drift can elicit any property with an unbiased m-sample kernel h by
squared loss S(r; y) = (r - h(y))^2: E S = (r - Gamma(F))^2 + Var h. The variance needs m = 2, h = (y1-y2)^2/2.
Everything here is exact (Fractions, full enumeration of a finite support) or a seeded Monte Carlo cross-check.
"""
from fractions import Fraction
from itertools import product
from math import sqrt, pi
from statistics import NormalDist
import random

__all__ = ["pair_kernel", "third_moment_kernel", "sq_var_kernel", "sq_mean_kernel", "score", "expected_kernel",
           "expected_score", "moments", "var_sample_variance", "var_pair_kernel", "detection_pairs",
           "sd_rel_sigma_variance", "sd_rel_sigma_gini", "pooled_vs_disjoint_ratio", "biased_target",
           "draw_normal", "draw_laplace", "draw_t", "sample_variance", "pooled_pair_score",
           "disjoint_pair_score", "min_observations"]


def pair_kernel(y):
    return (y[0] - y[1]) ** 2 / 2


def third_moment_kernel(y):
    """Unbiased for the third central moment; needs 3 independent draws."""
    return y[0] ** 3 - 3 * y[0] * y[1] ** 2 + 2 * y[0] * y[1] * y[2]


def sq_var_kernel(y):
    """Unbiased for sigma^4 (the squared variance); needs 4 draws."""
    return (y[0] - y[1]) ** 2 * (y[2] - y[3]) ** 2 / 4


def sq_mean_kernel(y):
    return y[0] * y[1]


def min_observations():
    """Degree of each functional in F = minimal sample size of an unbiased kernel (Halmos 1946)."""
    return {"mean": 1, "second moment": 1, "mean^2": 2, "variance": 2, "third central moment": 3, "variance^2": 4}


def score(r, kernel, y):
    return (r - kernel(y)) ** 2


def expected_kernel(kernel, support, probs, m):
    """Exact E h(y_1..y_m) over i.i.d. draws from a finite distribution (Fractions in, Fraction out)."""
    tot = Fraction(0)
    for idx in product(range(len(support)), repeat=m):
        p = Fraction(1)
        for i in idx:
            p *= probs[i]
        tot += p * kernel([support[i] for i in idx])
    return tot


def expected_score(r, kernel, support, probs, m):
    return sum(_p * (r - kernel(ys)) ** 2 for ys, _p in _tuples(support, probs, m))


def _tuples(support, probs, m):
    for idx in product(range(len(support)), repeat=m):
        p = Fraction(1)
        for i in idx:
            p *= probs[i]
        yield [support[i] for i in idx], p


def moments(support, probs):
    mu = sum(p * y for y, p in zip(support, probs))
    s2 = sum(p * (y - mu) ** 2 for y, p in zip(support, probs))
    m4 = sum(p * (y - mu) ** 4 for y, p in zip(support, probs))
    return mu, s2, m4


def var_sample_variance(mu4, s2, m):
    """Var of the unbiased sample variance of m i.i.d. draws."""
    return mu4 / m - (m - 3) * s2 ** 2 / (m * (m - 1))


def var_pair_kernel(mu4, s2):
    return (mu4 + s2 ** 2) / 2


def detection_pairs(rho, kappa, alpha=0.05, beta=0.2):
    """Disjoint pairs needed to catch a verifier who under-reports sigma^2 by the relative amount rho, one-sided test at
    level alpha with power 1-beta: N = ((z_a+z_b)/rho)^2 (kappa+1)/2, kappa the kurtosis."""
    z = NormalDist().inv_cdf
    return ((z(1 - alpha) + z(1 - beta)) / rho) ** 2 * (kappa + 1) / 2


def sd_rel_sigma_variance(kappa):
    """Relative sd of the sigma estimate (delta method) from one pair kernel: sqrt((kappa+1)/2)/2."""
    return sqrt((kappa + 1) / 2) / 2


def sd_rel_sigma_gini(mean_abs_d, mean_d2):
    """Relative sd of scale estimated from |y1-y2| (Gini mean difference): sigma is proportional to E|d|."""
    return sqrt(mean_d2 - mean_abs_d ** 2) / mean_abs_d


def pooled_vs_disjoint_ratio(kappa):
    """Variance ratio, disjoint pairs / all pairs of the same pool, for large pools: (kappa+1)/(kappa-1)."""
    return (kappa + 1) / (kappa - 1)


def biased_target(sigma2, rho):
    """If the two 'independent' draws are actually correlated with coefficient rho, E (y1-y2)^2/2 = sigma^2 (1-rho)."""
    return sigma2 * (1 - rho)


def draw_normal(rng, s=1.0):
    return rng.gauss(0, s)


def draw_laplace(rng, b=1.0):
    return b * (rng.expovariate(1) - rng.expovariate(1))


def draw_t(rng, nu):
    return rng.gauss(0, 1) / sqrt(rng.gammavariate(nu / 2, 2) / nu)


def sample_variance(ys):
    n = len(ys)
    mu = sum(ys) / n
    return sum((y - mu) ** 2 for y in ys) / (n - 1)


def pooled_pair_score(ys):
    """Mean of the pair kernel over all pairs of a pool = the unbiased sample variance."""
    return sample_variance(ys)


def disjoint_pair_score(ys):
    """Mean of the pair kernel over disjoint pairs (ys has even length)."""
    return sum((ys[i] - ys[i + 1]) ** 2 / 2 for i in range(0, len(ys) - 1, 2)) / (len(ys) // 2)
