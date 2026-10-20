"""Eliciting a drift tolerance interval [l, u] from a verifier.

Two paid losses for the interval report (l, u) against a realised drift y:
  * Winkler interval score  S = (u-l) + (2/a)[(l-y)+ + (y-u)+]. It is the sum of two pinball losses, so it elicits the
    equal-tailed (a/2, 1-a/2) quantile interval; exact regret (2/a)[PR(l,a/2)+PR(u,1-a/2)], where
    PR(r,t) = int_{q_t}^{r} (F(x)-t) dx is finite even when the mean does not exist. Payment is unbounded.
  * Width-plus-miss loss    H = (u-l) + lam*1[y not in [l,u]]. Payment lies in [0, width+lam]. Its optimum is the
    level set f(l)=f(u)=1/lam of a unimodal density, the shortest interval for its coverage (HPD).
Distributions are tuples (kind, loc, scale) with kind in {"normal", "lognormal", "cauchy"} (lognormal: loc, scale are
the parameters of log y).
"""
import math

__all__ = ["cdf", "pdf", "quantile", "integrate", "pinball_regret", "interval_regret", "interval_score", "expected_is_normal",
           "hpd_level", "hpd_interval", "hpd_loss", "hpd_expected", "hpd_regret", "coverage", "diff_moments", "hpd_diff_moments", "detection_n",
           "normal_scale_regret", "z_upper"]

SQ2 = math.sqrt(2.0)


def cdf(x, d):
    k, m, s = d
    if k == "normal":
        return 0.5 * (1 + math.erf((x - m) / (s * SQ2)))
    if k == "cauchy":
        return 0.5 + math.atan((x - m) / s) / math.pi
    return 0.0 if x <= 0 else 0.5 * (1 + math.erf((math.log(x) - m) / (s * SQ2)))


def pdf(x, d):
    k, m, s = d
    if k == "normal":
        return math.exp(-0.5 * ((x - m) / s) ** 2) / (s * math.sqrt(2 * math.pi))
    if k == "cauchy":
        return 1.0 / (math.pi * s * (1 + ((x - m) / s) ** 2))
    return 0.0 if x <= 0 else math.exp(-0.5 * ((math.log(x) - m) / s) ** 2) / (x * s * math.sqrt(2 * math.pi))


def quantile(t, d):
    k, m, s = d
    lo, hi = (0.0, 1.0) if k == "lognormal" else (m - 1.0, m + 1.0)
    if k != "lognormal":
        while cdf(lo, d) > t:
            lo = m - 2 * (m - lo)
        while cdf(hi, d) < t:
            hi = m + 2 * (hi - m)
    else:
        while cdf(hi, d) < t:
            hi *= 2
    for _ in range(200):
        mid = 0.5 * (lo + hi)
        if cdf(mid, d) < t:
            lo = mid
        else:
            hi = mid
    return 0.5 * (lo + hi)


def integrate(f, a, b, n=2000):
    """composite Simpson"""
    if a == b:
        return 0.0
    n += n % 2
    h = (b - a) / n
    t = f(a) + f(b) + sum((4 if i % 2 else 2) * f(a + i * h) for i in range(1, n))
    return t * h / 3


def pinball_regret(r, t, d):
    """regret of reporting r for the t-quantile under pinball loss: int_{q_t}^{r} (F-t) dx  (>= 0, needs no mean)"""
    q = quantile(t, d)
    return integrate(lambda x: cdf(x, d) - t, q, r)


def interval_regret(l, u, alpha, d):
    """exact regret of the Winkler interval score: (2/a)[PR(l,a/2) + PR(u,1-a/2)]"""
    return 2 / alpha * (pinball_regret(l, alpha / 2, d) + pinball_regret(u, 1 - alpha / 2, d))


def interval_score(l, u, y, alpha):
    return (u - l) + 2 / alpha * (max(l - y, 0.0) + max(y - u, 0.0))


def z_upper(alpha):
    """standard-normal quantile at 1-alpha/2"""
    return quantile(1 - alpha / 2, ("normal", 0.0, 1.0))


def expected_is_normal(l, u, alpha, mu=0.0, s=1.0):
    """closed-form expected interval score under N(mu, s^2), using E(y-u)+ = s[phi(z) - z(1-Phi(z))]"""
    g = lambda c: s * (pdf(c, ("normal", 0, 1)) - c * (1 - cdf(c, ("normal", 0, 1))))
    return (u - l) + 2 / alpha * (g((l - mu) / s * -1) + g((u - mu) / s))


def normal_scale_regret(lam, alpha):
    """N(0,1) truth, symmetric interval [-lam z, lam z] with z = z_{1-a/2}: regret g(lam z) - g(z) of the interval score,
    g(c) = 2c + (4/a)[phi(c) - c(1-Phi(c))]"""
    z = z_upper(alpha)
    N = ("normal", 0, 1)
    g = lambda c: 2 * c + 4 / alpha * (pdf(c, N) - c * (1 - cdf(c, N)))
    return g(lam * z) - g(z)


def hpd_level(l, u, d):
    return pdf(l, d), pdf(u, d)


def _mode(d):
    k, m, s = d
    if k != "lognormal":
        return m
    return math.exp(m - s * s)


def hpd_interval(lam, d):
    """level set {f >= 1/lam} of a unimodal density: the report minimising E[H]; (mode, mode) if max f <= 1/lam"""
    c = 1.0 / lam
    x0 = _mode(d)
    if pdf(x0, d) <= c:
        return x0, x0
    k = d[0]
    lo_lo = 0.0 if k == "lognormal" else x0 - 1.0
    a, b = lo_lo, x0
    if k != "lognormal":
        while pdf(a, d) > c:
            a = x0 - 2 * (x0 - a)
    for _ in range(200):
        mid = 0.5 * (a + b)
        if pdf(mid, d) < c:
            a = mid
        else:
            b = mid
    l = 0.5 * (a + b)
    a, b = x0, x0 + 1.0
    while pdf(b, d) > c:
        b = x0 + 2 * (b - x0)
    for _ in range(200):
        mid = 0.5 * (a + b)
        if pdf(mid, d) > c:
            a = mid
        else:
            b = mid
    return l, 0.5 * (a + b)


def coverage(l, u, d):
    return cdf(u, d) - cdf(l, d)


def hpd_loss(l, u, y, lam):
    return (u - l) + (lam if (y < l or y > u) else 0.0)


def hpd_expected(l, u, lam, d):
    return (u - l) + lam * (1 - coverage(l, u, d))


def hpd_regret(l, u, lam, d):
    l0, u0 = hpd_interval(lam, d)
    return hpd_expected(l, u, lam, d) - hpd_expected(l0, u0, lam, d)


def diff_moments(l2, u2, l1, u1, loss, d, lo, hi, n=200000):
    """exact (quadrature) mean and variance of the paired payment difference loss(l2,u2,y) - loss(l1,u1,y)"""
    f = lambda y: loss(l2, u2, y) - loss(l1, u1, y)
    m1 = integrate(lambda y: f(y) * pdf(y, d), lo, hi, n)
    m2 = integrate(lambda y: f(y) ** 2 * pdf(y, d), lo, hi, n)
    return m1, m2 - m1 * m1


def hpd_diff_moments(l2, u2, l1, u1, lam, d):
    """exact mean and variance of H(l2,u2,y) - H(l1,u1,y): width change plus lam*(miss2 - miss1), from interval masses"""
    m = lambda a, b: max(cdf(b, d) - cdf(a, d), 0.0) if b > a else 0.0
    ov = m(max(l1, l2), min(u1, u2))
    p1_only = m(l1, u1) - ov            # covered by 1 only: report 2 misses -> +lam
    p2_only = m(l2, u2) - ov            # covered by 2 only: -lam
    dw = (u2 - l2) - (u1 - l1)
    mean = dw + lam * (p1_only - p2_only)
    # distribution of D: dw+lam (only 1 covers), dw-lam (only 2 covers), dw otherwise
    ex2 = p1_only * (dw + lam) ** 2 + p2_only * (dw - lam) ** 2 + (1 - p1_only - p2_only) * dw ** 2
    return mean, ex2 - mean * mean


def detection_n(mean, var, z=1.645):
    return z * z * var / (mean * mean)
