"""Scalar plant x' = a x + b u + w, w ~ N(0, s^2), logged under u = -k x + e, e ~ N(0, tau^2).

The twin is the least-squares fit (a_hat, b_hat) of x_{t+1} on (x_t, u_t). Under a new gain k2 the
twin predicts closed-loop pole a_hat - b_hat k2; the real pole is a - b k2.
"""
import math, random

__all__ = ["pole", "stationary_var", "log_data", "fit", "twin_pole", "pred_var", "pred_sd",
           "heldout_mse", "minnorm_fit", "tau_required", "ols_pole_bound"]


def pole(a, b, k):
    return a - b * k


def stationary_var(a, b, k, s, tau):
    """Variance of x under the logging controller."""
    rho = a - b * k
    return (s * s + b * b * tau * tau) / (1 - rho * rho)


def log_data(rng, a, b, k, tau, s, n):
    """n transitions (x_t, u_t, x_{t+1}) from a stationary start."""
    x = rng.gauss(0, math.sqrt(stationary_var(a, b, k, s, tau)))
    rows = []
    for _ in range(n):
        u = -k * x + tau * rng.gauss(0, 1)
        y = a * x + b * u + s * rng.gauss(0, 1)
        rows.append((x, u, y))
        x = y
    return rows


def _gram(rows):
    sxx = sum(x * x for x, u, y in rows)
    sxu = sum(x * u for x, u, y in rows)
    suu = sum(u * u for x, u, y in rows)
    sxy = sum(x * y for x, u, y in rows)
    suy = sum(u * y for x, u, y in rows)
    syy = sum(y * y for x, u, y in rows)
    return sxx, sxu, suu, sxy, suy, syy


def fit(rows, ridge=0.0):
    """Least squares (a_hat, b_hat, s2_hat, Sinv) with optional relative ridge ridge*trace(S)/2 on the diagonal."""
    sxx, sxu, suu, sxy, suy, syy = _gram(rows)
    lam = ridge * (sxx + suu) / 2
    p, q, r = sxx + lam, sxu, suu + lam
    det = p * r - q * q
    inv = (r / det, -q / det, p / det)  # symmetric inverse entries (00, 01, 11)
    a = inv[0] * sxy + inv[1] * suy
    b = inv[1] * sxy + inv[2] * suy
    sse = sum((y - a * x - b * u) ** 2 for x, u, y in rows)
    return a, b, sse / max(len(rows) - 2, 1), inv


def minnorm_fit(rows):
    """Minimum-norm least squares: the ridge limit, which is what a regulariser or pseudo-inverse returns when u is a function of x."""
    return fit(rows, ridge=1e-9)


def twin_pole(a_hat, b_hat, k2):
    return a_hat - b_hat * k2


def pred_var(rho, b, k, k2, s, tau, n):
    """Asymptotic variance of the twin's predicted pole under gain k2 (sigma^2/n) [ (k-k2)^2/tau^2 + 1/v ], v = Var x under logging."""
    v = (s * s + b * b * tau * tau) / (1 - rho * rho)
    return s * s / n * ((k - k2) ** 2 / tau ** 2 + 1 / v)


def pred_sd(rho, b, k, k2, s, tau, n):
    return math.sqrt(pred_var(rho, b, k, k2, s, tau, n))


def heldout_mse(rng, a, b, k, tau, s, a_hat, b_hat, m=20000):
    """One-step prediction MSE of the twin on fresh logs of the same controller."""
    rows = log_data(rng, a, b, k, tau, s, m)
    return sum((y - a_hat * x - b_hat * u) ** 2 for x, u, y in rows) / m


def tau_required(rho, b, k, k2, s, n, delta):
    """Dither sd that gives predicted-pole sd delta at gain k2 (ignores the 1/v term, exact as tau grows small): |k-k2| s /(delta sqrt(n)) when the 1/v term is negligible; solved exactly here."""
    lo, hi = 1e-6, 1e6
    for _ in range(200):
        mid = math.sqrt(lo * hi)
        if pred_sd(rho, b, k, k2, s, mid, n) > delta:
            lo = mid
        else:
            hi = mid
    return hi


def ols_pole_bound(a_hat, b_hat, s2_hat, inv, k2, z=1.645):
    """Upper bound on the pole under k2 from the usual OLS covariance of the contrast (1,-k2)."""
    c0, c1 = 1.0, -k2
    var = s2_hat * (c0 * c0 * inv[0] + 2 * c0 * c1 * inv[1] + c1 * c1 * inv[2])
    return a_hat - b_hat * k2 + z * math.sqrt(var)
