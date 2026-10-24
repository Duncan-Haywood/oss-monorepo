"""Failure-rate certification from real trials (twin-certification): certify "p < eps" iff k <= c failures in n trials.
For k ~ Bin(n, p) the worst-case false-certification probability of any threshold rule is exactly P(Bin(n, eps) <= c)."""
import math

__all__ = ["binom_cdf", "c_freq", "n_zero_freq", "false_cert", "power"]


def binom_cdf(k, n, p):
    if k < 0: return 0.0
    if k >= n: return 1.0
    if p <= 0: return 1.0
    if p >= 1: return 0.0
    lp, lq = math.log(p), math.log1p(-p)
    t = [math.lgamma(n + 1) - math.lgamma(j + 1) - math.lgamma(n - j + 1) + j * lp + (n - j) * lq for j in range(k + 1)]
    m = max(t)
    return min(1.0, math.exp(m) * sum(math.exp(x - m) for x in t))


def c_freq(n, eps, delta):
    """Largest c with P(Bin(n, eps) <= c) <= delta (-1 if none): the exact size-delta (Clopper-Pearson) test."""
    if binom_cdf(0, n, eps) > delta: return -1
    lo, hi = 0, n
    while lo < hi:
        mid = (lo + hi + 1) // 2
        lo, hi = (mid, hi) if binom_cdf(mid, n, eps) <= delta else (lo, mid - 1)
    return lo


def n_zero_freq(eps, delta):
    return math.ceil(math.log(delta) / math.log1p(-eps))


def false_cert(n, c, eps):
    return binom_cdf(c, n, eps)


def power(n, c, p):
    return binom_cdf(c, n, p)
