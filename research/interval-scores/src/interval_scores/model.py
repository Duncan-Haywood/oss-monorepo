"""Winkler interval score for a verifier's central (1-alpha) drift interval [l, u].

S(l,u;y) = (u-l) + (2/alpha)(l-y)+ + (2/alpha)(y-u)+.  Its derivative in l is -1+(2/alpha)F(l), in u is
1-(2/alpha)(1-F(u)), so the expected score is minimised at the alpha/2 and 1-alpha/2 quantiles and the regret
splits into two one-sided integrals of the cdf.  Laws are location-scale: kind "normal" or "cauchy", scale s.
"""
import math

__all__ = ["cdf", "pdf", "quantile", "int_cdf", "one_sided_regret", "regret", "scale_regret", "shift_regret",
           "optimal_score", "curvature", "score", "paired_moments", "detection_n", "coverage_n"]

SQ2 = math.sqrt(2.0)


def cdf(x, kind="normal", s=1.0):
    if kind == "normal":
        return 0.5 * (1 + math.erf(x / (s * SQ2)))
    return 0.5 + math.atan(x / s) / math.pi


def pdf(x, kind="normal", s=1.0):
    if kind == "normal":
        return math.exp(-0.5 * (x / s) ** 2) / (s * math.sqrt(2 * math.pi))
    return 1.0 / (math.pi * s * (1 + (x / s) ** 2))


def quantile(p, kind="normal", s=1.0):
    if kind == "cauchy":
        return s * math.tan(math.pi * (p - 0.5))
    lo, hi = -40.0, 40.0
    for _ in range(200):
        mid = 0.5 * (lo + hi)
        if cdf(mid) < p:
            lo = mid
        else:
            hi = mid
    return s * 0.5 * (lo + hi)


def int_cdf(x, kind="normal", s=1.0):
    """antiderivative of F: normal s*(z*Phi(z)+phi(z)); Cauchy x/2 + (x atan(x/s) - (s/2) ln(1+x^2/s^2))/pi"""
    if kind == "normal":
        z = x / s
        return s * (z * cdf(z) + pdf(z))
    return x / 2 + (x * math.atan(x / s) - 0.5 * s * math.log1p((x / s) ** 2)) / math.pi


def one_sided_regret(t, level, kind="normal", s=1.0):
    """(2/alpha) * int_{q}^{t} (F - level) dx with q = F^{-1}(level); level = alpha/2 (lower) or 1-alpha/2 (upper).
    Same closed form for both ends; >= 0 either side of the quantile."""
    alpha = 2 * min(level, 1 - level)
    q = quantile(level, kind, s)
    return (2 / alpha) * (int_cdf(t, kind, s) - int_cdf(q, kind, s) - level * (t - q))


def regret(l, u, alpha, kind="normal", s=1.0):
    return (one_sided_regret(l, alpha / 2, kind, s) + one_sided_regret(u, 1 - alpha / 2, kind, s))


def scale_regret(lam, alpha, kind="normal", s=1.0):
    """regret of the symmetric interval whose half-width is lam times the true one"""
    z = quantile(1 - alpha / 2, kind, s)
    return regret(-lam * z, lam * z, alpha, kind, s)


def shift_regret(delta, alpha, kind="normal", s=1.0):
    z = quantile(1 - alpha / 2, kind, s)
    return regret(-z + delta, z + delta, alpha, kind, s)


def optimal_score(alpha, s=1.0):
    """normal: expected score at the true quantiles = 4 s phi(z)/alpha, z = Phi^-1(1-alpha/2)"""
    z = quantile(1 - alpha / 2)
    return 4 * s * pdf(z) / alpha


def curvature(alpha, kind="normal", s=1.0):
    """regret ~ curvature * delta^2 for a common shift: 2 f(z)/alpha"""
    z = quantile(1 - alpha / 2, kind, s)
    return 2 * pdf(z, kind, s) / alpha


def score(l, u, y, alpha):
    return (u - l) + (2 / alpha) * max(l - y, 0.0) + (2 / alpha) * max(y - u, 0.0)


def paired_moments(iv, iv2, alpha, kind="normal", s=1.0, half=60.0, n=240000):
    """exact (quadrature) mean and variance of D = S(iv;y) - S(iv2;y), y ~ F.  Bounded by |width|+|edge shifts|*2/alpha
    even for the Cauchy law, so the variance is finite where the scores themselves have none."""
    lo, hi = -half * s, half * s
    h = (hi - lo) / n
    m1 = m2 = 0.0
    for i in range(n + 1):
        y = lo + i * h
        w = 1 if i in (0, n) else (4 if i % 2 else 2)
        d = score(iv[0], iv[1], y, alpha) - score(iv2[0], iv2[1], y, alpha)
        p = pdf(y, kind, s) * w
        m1 += p * d
        m2 += p * d * d
    m1 *= h / 3
    m2 *= h / 3
    for edge in (lo, hi):    # beyond +-half the difference is constant (both intervals are inside): add the tail mass
        d = score(iv[0], iv[1], edge, alpha) - score(iv2[0], iv2[1], edge, alpha)
        tail = cdf(lo, kind, s) if edge == lo else 1 - cdf(hi, kind, s)
        m1 += tail * d
        m2 += tail * d * d
    return m1, m2 - m1 * m1


def detection_n(mean, var, z=1.645):
    return z * z * var / (mean * mean)


def coverage_n(alpha, alpha_true, z=1.645):
    """tasks to tell a verifier whose interval misses with rate alpha_true from the claimed alpha (one-sided z test)"""
    a, b = alpha, alpha_true
    return (z * math.sqrt(a * (1 - a)) + z * math.sqrt(b * (1 - b))) ** 2 / (a - b) ** 2
