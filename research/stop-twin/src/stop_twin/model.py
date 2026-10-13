"""Stopping rules for a twin run that estimates a rare failure probability p.  Fixed-n and sequential Wald stopping
(stop when the Wald half-width is small) vs inverse (negative-binomial) sampling: run until m failures, N = draws needed.
Exact facts: (m-1)/(N-1) is unbiased for p; m/N is biased up; an exact interval follows from the binomial identity
P(N <= n) = P(Bin(n,p) >= m)."""
import math, random

__all__ = ["nb_pmf", "haldane", "expected_haldane", "expected_naive", "var_haldane", "binom_cdf_lt", "exact_ci",
           "wald_half", "sequential_wald", "inverse_sample", "fixed_rel_halfwidth", "m_for_rel_sd", "Z"]

Z = 1.959964


def _lbinom(n, k):
    return math.lgamma(n + 1) - math.lgamma(k + 1) - math.lgamma(n - k + 1)


def nb_pmf(n, m, p):
    """P(N = n): the m-th failure arrives on draw n."""
    if n < m:
        return 0.0
    return math.exp(_lbinom(n - 1, m - 1) + m * math.log(p) + (n - m) * math.log1p(-p))


def haldane(m, n):
    """Unbiased estimator (m-1)/(N-1) of p under inverse sampling (Haldane 1945)."""
    return (m - 1.0) / (n - 1.0)


def _moments(m, p, f, tol=1e-13):
    """E f(N) by summing the pmf out to the point where the remaining tail is negligible."""
    tot = mass = 0.0
    n = m
    peak = m / p
    while True:
        w = nb_pmf(n, m, p)
        tot += w * f(n)
        mass += w
        if n > peak and (1.0 - mass < tol or w < 1e-18):
            break
        n += 1
    return tot / mass


def expected_haldane(m, p):
    return _moments(m, p, lambda n: haldane(m, n))


def expected_naive(m, p):
    return _moments(m, p, lambda n: m / n)


def var_haldane(m, p):
    e2 = _moments(m, p, lambda n: haldane(m, n) ** 2)
    return e2 - expected_haldane(m, p) ** 2


def binom_cdf_lt(m, n, p):
    """P(Bin(n, p) < m) = P(fewer than m failures in n draws)."""
    if n <= 0:
        return 1.0
    lp, lq = math.log(p), math.log1p(-p)
    s = 0.0
    for j in range(min(m, n + 1)):
        s += math.exp(_lbinom(n, j) + j * lp + (n - j) * lq)
    return min(s, 1.0)


def _bisect(f, lo, hi, it=60):
    for _ in range(it):
        mid = math.sqrt(lo * hi)
        if f(mid) > 0:
            hi = mid
        else:
            lo = mid
    return math.sqrt(lo * hi)


def exact_ci(m, n, alpha=0.05):
    """Conservative exact interval from N = n (m failures): lower solves P(Bin(n,p)>=m)=a/2, upper solves
    P(Bin(n-1,p)<=m-1)=a/2.  Guaranteed coverage >= 1-alpha for every p."""
    lo = _bisect(lambda p: (1.0 - binom_cdf_lt(m, n, p)) - alpha / 2.0, 1e-12, 0.999)
    hi = _bisect(lambda p: alpha / 2.0 - binom_cdf_lt(m, n - 1, p), 1e-12, 0.999)
    return lo, hi


def wald_half(k, n):
    ph = k / n
    return Z * math.sqrt(ph * (1.0 - ph) / n)


def sequential_wald(p, eps, n0, step, rng, min_fail=0, nmax=10 ** 7):
    """Draw Bernoulli(p); every `step` draws from n0 stop when the Wald half-width <= eps and failures >= min_fail.
    Returns (n, failures, half-width)."""
    k = n = 0
    while n < nmax:
        for _ in range(step if n else n0):
            k += rng.random() < p
            n += 1
        h = wald_half(k, n)
        if h <= eps and k >= min_fail:
            return n, k, h
    return n, k, wald_half(k, n)


def inverse_sample(p, m, rng):
    """Draws until the m-th failure (geometric gaps, so O(m) work)."""
    lq = math.log1p(-p)
    n = 0
    for _ in range(m):
        n += 1 + int(math.log(1.0 - rng.random()) / lq)
    return n


def fixed_rel_halfwidth(p, n):
    """Wald half-width / p when n draws are planned and the true rate is p (~ z / sqrt(n p))."""
    return Z * math.sqrt((1.0 - p) / (n * p))


def m_for_rel_sd(r):
    """Failures needed so the Haldane estimator has relative sd ~ r: Var ~ p^2/(m-2) => m = 2 + 1/r^2."""
    return int(math.ceil(2.0 + 1.0 / (r * r)))
