"""Lidar detection through an attenuating medium (fog, rain, dust), stylised.

Return power from an extended Lambertian target at range r is P0 rho exp(-2 tau(r)) / r^2 with optical depth tau(r) = int_0^r alpha.
Detection is deterministic: P >= P_min. The clear-air range r0 (alpha = 0) absorbs P0, rho and P_min, so the target is detected iff
    ln(r / r0) + tau(r) <= 0                                  (1)
(r^2 exp(2 tau) <= r0^2). Target reflectivity enters only through r0 (r0 ~ sqrt(rho)).
Uniform extinction: tau = alpha r, so the detection range solves r exp(alpha r) = r0, i.e. r = W(alpha r0) / alpha (Lambert W).
Koschmieder: alpha = 3.912 / V for meteorological visibility V (2% contrast threshold).
"""
import math

KOSCHMIEDER = 3.912


def lambertw(x, tol=1e-14):
    """Principal branch for x >= 0: solve w exp(w) = x by Newton/Halley."""
    if x < 0:
        raise ValueError("x >= 0 required")
    if x == 0:
        return 0.0
    w = math.log1p(x) if x < 3 else math.log(x) - math.log(math.log(x))
    for _ in range(100):
        e = math.exp(w)
        f = w * e - x
        wn = w - f / (e * (w + 1) - (w + 2) * f / (2 * w + 2))
        if abs(wn - w) < tol * (1 + abs(wn)):
            return wn
        w = wn
    return w


def alpha_of_visibility(v):
    return KOSCHMIEDER / v


def range_uniform(alpha, r0):
    """Detection range in uniform extinction: r exp(alpha r) = r0."""
    if alpha <= 0:
        return r0
    return lambertw(alpha * r0) / alpha


def elasticity(alpha, r0):
    """-d ln r / d ln alpha = W/(1+W) with W = W(alpha r0): a relative extinction error moves the range by strictly less."""
    w = lambertw(alpha * r0)
    return w / (1 + w)


def alpha_from_range(r, r0):
    """Invert (1): the extinction a twin must use to reproduce a measured detection range r of a target with clear-air range r0."""
    if r >= r0:
        return 0.0
    return math.log(r0 / r) / r


def range_bank(alpha_b, bank_start, r0, tol=1e-10):
    """Detection range when extinction is 0 before `bank_start` and alpha_b beyond it: root of ln(r/r0) + alpha_b (r-b)+ = 0."""
    if r0 <= bank_start:
        return r0
    lo, hi = bank_start, r0
    while hi - lo > tol * r0:
        m = 0.5 * (lo + hi)
        if math.log(m / r0) + alpha_b * (m - bank_start) > 0:
            hi = m
        else:
            lo = m
    return 0.5 * (lo + hi)


def lognormal_quantile_alpha(median, sigma, q):
    """q-quantile of alpha ~ LogNormal(ln median, sigma)."""
    return median * math.exp(sigma * _norm_ppf(q))


def _norm_cdf(x):
    return 0.5 * math.erfc(-x / math.sqrt(2))


def _norm_ppf(p):
    lo, hi = -10.0, 10.0
    for _ in range(200):
        m = 0.5 * (lo + hi)
        if _norm_cdf(m) < p:
            lo = m
        else:
            hi = m
    return 0.5 * (lo + hi)


def range_quantile(median, sigma, r0, q):
    """q-quantile of the detection range when alpha ~ LogNormal: range is decreasing in alpha, so it is range(alpha_{1-q}) exactly."""
    return range_uniform(lognormal_quantile_alpha(median, sigma, 1 - q), r0)


def stopping_distance(v, decel, t_react):
    return v * t_react + v * v / (2 * decel)


def safe_speed(d, decel, t_react):
    """Largest speed whose stopping distance is <= d."""
    return decel * (-t_react + math.sqrt(t_react ** 2 + 2 * d / decel))


def p_unsafe(speed, r0, median, sigma, decel, t_react):
    """P(detection range < stopping distance at `speed`) for alpha ~ LogNormal(median, sigma): alpha > alpha* = ln(r0/d)/d."""
    d = stopping_distance(speed, decel, t_react)
    if d >= r0:
        return 1.0
    a_star = alpha_from_range(d, r0)
    return 1 - _norm_cdf((math.log(a_star) - math.log(median)) / sigma)
