"""Exact coverage of one-sided upper confidence bounds on a failure rate.

Pure standard library. For a bound U(k, n) computed from k failures in n iid
rollouts, coverage at true rate p is P_p(U(K, n) >= p) with K ~ Bin(n, p),
summed exactly over k = 0..n. Nothing is sampled.
"""
import math

Z95 = 1.6448536269514722  # one-sided 95% normal quantile


def binom_pmf(n, p):
    """List of P(K = k) for k = 0..n, via log-gamma (stable for n up to ~1e4)."""
    if p <= 0:
        return [1.0] + [0.0] * n
    if p >= 1:
        return [0.0] * n + [1.0]
    lp, lq = math.log(p), math.log1p(-p)
    return [math.exp(math.lgamma(n + 1) - math.lgamma(k + 1) - math.lgamma(n - k + 1)
                     + k * lp + (n - k) * lq) for k in range(n + 1)]


def _betacf(a, b, x):
    tiny = 1e-300
    qab, qap, qam = a + b, a + 1, a - 1
    c, d = 1.0, 1 - qab * x / qap
    d = 1 / (d if abs(d) > tiny else tiny)
    h = d
    for m in range(1, 400):
        m2 = 2 * m
        aa = m * (b - m) * x / ((qam + m2) * (a + m2))
        d = 1 + aa * d; d = 1 / (d if abs(d) > tiny else tiny)
        c = 1 + aa / c; c = c if abs(c) > tiny else tiny
        h *= d * c
        aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2))
        d = 1 + aa * d; d = 1 / (d if abs(d) > tiny else tiny)
        c = 1 + aa / c; c = c if abs(c) > tiny else tiny
        delta = d * c
        h *= delta
        if abs(delta - 1) < 1e-14:
            break
    return h


def beta_cdf(x, a, b):
    """Regularised incomplete beta I_x(a, b)."""
    if x <= 0:
        return 0.0
    if x >= 1:
        return 1.0
    lbt = (math.lgamma(a + b) - math.lgamma(a) - math.lgamma(b)
           + a * math.log(x) + b * math.log1p(-x))
    if x < (a + 1) / (a + b + 2):
        return math.exp(lbt) * _betacf(a, b, x) / a
    return 1 - math.exp(lbt) * _betacf(b, a, 1 - x) / b


def beta_ppf(q, a, b):
    lo, hi = 0.0, 1.0
    for _ in range(80):
        mid = (lo + hi) / 2
        if beta_cdf(mid, a, b) < q:
            lo = mid
        else:
            hi = mid
    return (lo + hi) / 2


def cp_upper(k, n, alpha=0.05):
    """Clopper-Pearson: the p solving P(Bin(n,p) <= k) = alpha."""
    if k >= n:
        return 1.0
    return beta_ppf(1 - alpha, k + 1, n - k)


def jeffreys_upper(k, n, alpha=0.05):
    return beta_ppf(1 - alpha, k + 0.5, n - k + 0.5)


def wilson_upper(k, n, alpha=0.05, z=Z95):
    ph = k / n
    d = 1 + z * z / n
    c = ph + z * z / (2 * n)
    return min(1.0, (c + z * math.sqrt(ph * (1 - ph) / n + z * z / (4 * n * n))) / d)


def agresti_coull_upper(k, n, alpha=0.05, z=Z95):
    nt = n + z * z
    pt = (k + z * z / 2) / nt
    return min(1.0, pt + z * math.sqrt(pt * (1 - pt) / nt))


def wald_upper(k, n, alpha=0.05, z=Z95):
    ph = k / n
    return min(1.0, ph + z * math.sqrt(ph * (1 - ph) / n))


def rule_of_three_upper(k, n, alpha=0.05):
    """3/n at k = 0 (the 'rule of three'); it says nothing for k > 0, so use Wald there."""
    if k == 0:
        return min(1.0, 3.0 / n)
    return wald_upper(k, n, alpha)


METHODS = {
    "clopper-pearson": cp_upper,
    "jeffreys": jeffreys_upper,
    "wilson": wilson_upper,
    "agresti-coull": agresti_coull_upper,
    "wald": wald_upper,
    "rule-of-three+wald": rule_of_three_upper,
}


def coverage(method, n, p, alpha=0.05, bounds=None):
    """Exact P_p(U(K, n) >= p)."""
    if bounds is None:
        bounds = [method(k, n, alpha) for k in range(n + 1)]
    pm = binom_pmf(n, p)
    return sum(w for w, u in zip(pm, bounds) if u >= p)


def rate_grid(lo, hi, m):
    """m log-spaced rates in [lo, hi]."""
    return [lo * (hi / lo) ** (i / (m - 1)) for i in range(m)]


def coverage_profile(method, n, grid, alpha=0.05):
    bounds = [method(k, n, alpha) for k in range(n + 1)]
    return [coverage(method, n, p, alpha, bounds) for p in grid]


def zero_failure_n(method, target, alpha=0.05, nmax=100000):
    """Smallest n whose k = 0 upper bound is at most target."""
    lo, hi = 1, nmax
    while lo < hi:
        mid = (lo + hi) // 2
        if method(0, mid, alpha) <= target:
            hi = mid
        else:
            lo = mid + 1
    return lo
