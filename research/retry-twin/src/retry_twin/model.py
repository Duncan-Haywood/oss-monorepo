"""Retry budgets for a manipulation skill: independent-attempt twin vs object-level difficulty.

Real: each object has a latent per-attempt success probability P ~ Beta(a, b); attempts on one object are
i.i.d. Bernoulli(P) given P.  Twin: every attempt succeeds independently with the same marginal p = a/(a+b).
"""
import math, random

MAXK = 10 ** 8


def beta_params(p, rho):
    """Beta(a, b) with mean p and intra-object correlation rho = 1/(a+b+1) of two attempts' outcomes."""
    s = 1.0 / rho - 1.0
    return p * s, (1 - p) * s


def twin_fail(p, k):
    """P(all k attempts fail) when attempts are independent."""
    return (1 - p) ** k


def real_fail(a, b, k):
    """E[(1-P)^k] = B(a, b+k)/B(a, b) = prod_{j<k} (b+j)/(a+b+j)."""
    return math.exp(math.lgamma(a + b) - math.lgamma(b) + math.lgamma(b + k) - math.lgamma(a + b + k))


def tail_const(a, b):
    """real_fail(a,b,k) ~ tail_const * k^(-a) as k -> infinity."""
    return math.exp(math.lgamma(a + b) - math.lgamma(b))


def twin_budget(p, delta):
    return max(0, math.ceil(math.log(delta) / math.log(1 - p)))


def real_budget(a, b, delta):
    """Smallest k with real_fail <= delta (bisection; None if above MAXK)."""
    if real_fail(a, b, 0) <= delta:
        return 0
    hi = 1
    while real_fail(a, b, hi) > delta:
        hi *= 2
        if hi > MAXK:
            return None
    lo = hi // 2
    while hi - lo > 1:
        mid = (lo + hi) // 2
        if real_fail(a, b, mid) > delta:
            lo = mid
        else:
            hi = mid
    return hi


def asym_budget(a, b, delta):
    """Budget from the power-law tail: (tail_const/delta)^(1/a)."""
    return (tail_const(a, b) / delta) ** (1.0 / a)


def expected_attempts(a, b, K):
    """E[number of attempts] under a cap of K: sum_{k<K} s_k, closed form for a != 1."""
    if abs(a - 1) < 1e-12:
        return sum(real_fail(a, b, k) for k in range(K))
    return ((a + b - 1) - real_fail(a, b, K) * (a + b + K - 1)) / (a - 1)


def value(a, b, K, w, c):
    """Expected payoff w*P(success within K) - c*E[attempts] for a cap of K attempts."""
    return w * (1 - real_fail(a, b, K)) - c * expected_attempts(a, b, K)


def twin_value(p, K, w, c):
    s = (1 - p) ** K
    return w * (1 - s) - c * (1 - s) / p


def best_cap(a, b, w, c):
    """Attempt k+1 is worth making iff w*a/(a+b+k) >= c (posterior success prob after k failures is a/(a+b+k))."""
    x = w * a / c - a - b
    return 0 if x < 0 else int(math.floor(x)) + 1


def fit_pair_moments(pairs):
    """pairs: list of (x1, x2) outcomes of two attempts per object. Returns (p_hat, rho_hat) with rho clipped to [0, 0.95]."""
    n = len(pairs)
    p = sum(x1 + x2 for x1, x2 in pairs) / (2.0 * n)
    q = sum(x1 * x2 for x1, x2 in pairs) / float(n)
    v = p * (1 - p)
    rho = 0.0 if v <= 0 else (q - p * p) / v
    return p, min(max(rho, 0.0), 0.95)


def repaired_budget(p, rho, delta):
    if rho < 1e-9:
        return twin_budget(p, delta)
    a, b = beta_params(p, rho)
    return real_budget(a, b, delta)


def sample_attempts(a, b, rng, cap):
    """Number of attempts used by an object (first success), capped at `cap`; returns cap+1 if all cap attempts fail."""
    P = rng.betavariate(a, b)
    for k in range(1, cap + 1):
        if rng.random() < P:
            return k
    return cap + 1


def sample_pair(a, b, rng):
    P = rng.betavariate(a, b)
    return (int(rng.random() < P), int(rng.random() < P))
