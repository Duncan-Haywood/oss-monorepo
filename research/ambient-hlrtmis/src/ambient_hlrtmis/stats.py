"""Exact (Clopper-Pearson) binomial interval, no scipy: bisection on the binomial cdf."""
from math import comb


def _cdf(k, n, p):
    return sum(comb(n, i) * p**i * (1 - p) ** (n - i) for i in range(k + 1))


def clopper_pearson(k, n, alpha=0.05):
    def solve(f):
        lo, hi = 0.0, 1.0
        for _ in range(60):
            mid = (lo + hi) / 2
            lo, hi = (mid, hi) if f(mid) else (lo, mid)
        return (lo + hi) / 2
    lower = 0.0 if k == 0 else solve(lambda p: 1 - _cdf(k - 1, n, p) < alpha / 2)
    upper = 1.0 if k == n else solve(lambda p: _cdf(k, n, p) > alpha / 2)
    return lower, upper
