"""Worst-case bias of aggregating scalar verifier reports when a fraction beta is Byzantine.

Honest reports ~ N(0, sigma^2). Byzantine reports are placed by the adversary (the worst case is all mass at +B).
"""
import math
import random
from statistics import NormalDist

N = NormalDist()


def mean_bias(beta, B):
    """Mean of the mixture: beta * B (unbounded in B)."""
    return beta * B


def median_bias(beta, sigma=1.0):
    """Population median of (1-beta) N(0,s^2) + beta delta_{+inf}: honest quantile with (1-beta) F = 1/2."""
    if not 0 <= beta < 0.5:
        return math.inf
    return sigma * N.inv_cdf(1.0 / (2.0 * (1.0 - beta)))


def trimmed_mean_bias(beta, tau, sigma=1.0):
    """Population tau-trimmed mean under worst-case mass beta at +inf (needs beta <= tau < 1/2).

    Keeps honest quantiles [a, b] with a = tau/(1-beta), b = 1-(tau-beta)/(1-beta); result
    (1-beta) * sigma * (phi(z_a) - phi(z_b)) / (1-2 tau).
    """
    if beta > tau:
        return math.inf
    if tau == 0:
        return 0.0
    a = tau / (1.0 - beta)
    b = 1.0 - (tau - beta) / (1.0 - beta)
    pb = N.pdf(N.inv_cdf(b)) if b < 1.0 - 1e-15 else 0.0
    return (1.0 - beta) * sigma * (N.pdf(N.inv_cdf(a)) - pb) / (1.0 - 2.0 * tau)


def aggregate(reports, kind, tau=0.0):
    r = sorted(reports)
    n = len(r)
    if kind == "mean":
        return sum(r) / n
    if kind == "median":
        return r[n // 2] if n % 2 else 0.5 * (r[n // 2 - 1] + r[n // 2])
    if kind == "trimmed":
        k = int(math.floor(tau * n))
        return sum(r[k:n - k]) / (n - 2 * k)
    raise ValueError(kind)


def simulate(n, beta, kind, B=1e6, tau=0.0, reps=300, seed=0):
    """Average aggregate over reps of n reports, round(beta n) of them at +B, rest N(0,1)."""
    rng = random.Random(seed)
    f = int(round(beta * n))
    tot = 0.0
    for _ in range(reps):
        rep = [rng.gauss(0, 1) for _ in range(n - f)] + [B] * f
        tot += aggregate(rep, kind, tau)
    return tot / reps


def median_rank_bracket(honest, f, adv):
    """Median of honest+adv (odd total n) must lie in [h_(k-f), h_(k)], k=(n+1)/2, 1-indexed honest order stats."""
    h = sorted(honest)
    n = len(h) + f
    k = (n + 1) // 2
    med = aggregate(h + list(adv), "median")
    lo = h[max(k - f, 1) - 1]
    hi = h[min(k, len(h)) - 1]
    return lo <= med <= hi


def mad_scale_bias(beta):
    """Ratio of worst-case median bias to sigma (breakdown at 1/2)."""
    return median_bias(beta, 1.0)
