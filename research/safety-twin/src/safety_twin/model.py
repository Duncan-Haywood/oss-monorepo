"""Corridor keeping under a stabilising controller: x_{t+1} = a x_t + w_t, safe iff |x_t| <= L for t = 1..T.
The Gaussian twin draws w ~ N(0, s^2).  The real disturbance is a Student-t with nu degrees of freedom rescaled to
the SAME variance s^2, so one-step variance (and any moment fit) cannot tell them apart; only the tail differs."""
import math, random

__all__ = ["BURN", "Phi", "Phi_inv", "t_cdf", "t_sf", "sample_w", "episode_max", "max_sample", "fail_frac", "stat_sd",
           "twin_margin", "bigjump_tail", "real_margin", "conformal_margin", "hill_alpha", "pareto_margin"]

BURN = 40


def Phi(x):
    return 0.5 * (1.0 + math.erf(x / math.sqrt(2.0)))


def Phi_inv(p):
    lo, hi = -12.0, 12.0
    for _ in range(200):
        mid = 0.5 * (lo + hi)
        if Phi(mid) < p:
            lo = mid
        else:
            hi = mid
    return 0.5 * (lo + hi)


def t_cdf(x, nu):
    """Student-t CDF for integer nu >= 1 (finite closed forms in theta = atan(x/sqrt(nu)))."""
    th = math.atan(x / math.sqrt(nu))
    c, s = math.cos(th), math.sin(th)
    if nu % 2 == 1:
        acc, term = c, c
        for k in range(1, (nu - 1) // 2):
            term *= c * c * (2.0 * k) / (2.0 * k + 1.0)
            acc += term
        body = th + s * acc if nu > 1 else th
        return 0.5 + body / math.pi
    acc, term = 1.0, 1.0
    for k in range(1, nu // 2):
        term *= c * c * (2.0 * k - 1.0) / (2.0 * k)
        acc += term
    return 0.5 + 0.5 * s * acc


def t_sf(x, nu):
    """Upper tail 1 - F(x), computed as F(-x) to avoid cancellation."""
    return t_cdf(-x, nu)


def sample_w(kind, s, rng, nu=3):
    """kind 'gauss' or 't'; both have variance s^2 (nu > 2)."""
    if kind == "gauss":
        return s * rng.gauss(0.0, 1.0)
    chi2 = 2.0 * rng.gammavariate(nu / 2.0, 1.0)
    return s * rng.gauss(0.0, 1.0) / math.sqrt(chi2 / nu) / math.sqrt(nu / (nu - 2.0))


def episode_max(a, T, s, kind, rng, nu=3):
    x = 0.0
    m = 0.0
    for t in range(BURN + T):
        x = a * x + sample_w(kind, s, rng, nu)
        if t >= BURN and abs(x) > m:
            m = abs(x)
    return m


def max_sample(n, a, T, s, kind, rng, nu=3):
    return sorted(episode_max(a, T, s, kind, rng, nu) for _ in range(n))


def fail_frac(sorted_max, L):
    """Fraction of episodes whose max |x| exceeds L."""
    lo, hi = 0, len(sorted_max)
    while lo < hi:
        mid = (lo + hi) // 2
        if sorted_max[mid] <= L:
            lo = mid + 1
        else:
            hi = mid
    return (len(sorted_max) - lo) / len(sorted_max)


def stat_sd(a, s):
    return s / math.sqrt(1.0 - a * a)


def twin_margin(a, T, s, delta):
    """Twin certificate: union bound T * P(|x| > L) <= delta with Gaussian stationary x ~ N(0, stat_sd^2).
    An upper bound on the twin's own failure probability, so the twin 'certifies' P_fail <= delta."""
    return stat_sd(a, s) * Phi_inv(1.0 - delta / (2.0 * T))


def bigjump_tail(L, a, s, nu, K=80):
    """Single-big-jump approximation of P(|x| > L) for x = sum a^k w_k with t_nu noise (unit-variance scaled):
    sum_k P(|w| > L / a^k).  Asymptotically exact as L -> infinity for regularly varying tails."""
    scale = s / math.sqrt(nu / (nu - 2.0))
    return sum(2.0 * t_sf(L / (a ** k) / scale, nu) for k in range(K))


def real_margin(a, T, s, nu, delta):
    """Margin L with T * bigjump_tail(L) = delta (bisection on the tail)."""
    lo, hi = 1e-9, 1e6
    for _ in range(200):
        mid = math.sqrt(lo * hi)
        if T * bigjump_tail(mid, a, s, nu) > delta:
            lo = mid
        else:
            hi = mid
    return hi


def conformal_margin(sorted_max, delta):
    """Split-conformal margin from n real episode maxima: the ceil((n+1)(1-delta))-th order statistic, so a fresh
    episode exceeds it with probability <= delta (exchangeable episodes).  inf if n < 1/delta - 1."""
    n = len(sorted_max)
    k = math.ceil((n + 1) * (1.0 - delta))
    return sorted_max[k - 1] if k <= n else float("inf")


def hill_alpha(ws, k):
    """Hill estimator of the tail index from the k largest |w|."""
    a = sorted((abs(w) for w in ws), reverse=True)
    xk = a[k]
    return k / sum(math.log(a[i] / xk) for i in range(k)), xk


def pareto_margin(a, T, n, k, alpha, xk, delta, K=80):
    """Margin from a Pareto tail fitted to the top k of n one-step |w|: P(|w|>y) = (k/n)(y/xk)^-alpha, y >= xk.
    Big-jump sum over the AR(1) filter, union bound over T steps."""
    def tail(L):
        return sum(min(1.0, (k / n) * (L / a ** j / xk) ** (-alpha)) for j in range(K))
    lo, hi = xk, 1e9
    for _ in range(200):
        mid = math.sqrt(lo * hi)
        if T * tail(mid) > delta:
            lo = mid
        else:
            hi = mid
    return hi
