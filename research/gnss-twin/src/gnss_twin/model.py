"""GNSS-style 2-D positioning: white-noise twin vs a real receiver with correlated multipath.

Unknowns (x, y, clock b); satellite i at azimuth th_i gives the linearised pseudorange row h_i = (cos th_i, sin th_i, 1)
and residual z_i = h_i . (dx, dy, db) + e_i.  Twin: e_i iid N(0, sigma^2).  Real: e_i adds a multipath term m_i, either a
persistent bias on a subset of satellites or an AR(1) process in time.  Pure Python, no dependencies.
"""
import math
import random


def sats(n, start=0.0, span=2 * math.pi):
    """n azimuths evenly spaced over `span` (span = 2 pi gives the symmetric constellation)."""
    return [start + span * i / n for i in range(n)]


def design(az):
    return [(math.cos(t), math.sin(t), 1.0) for t in az]


def normal(az):
    H = design(az)
    return [[sum(r[i] * r[j] for r in H) for j in range(3)] for i in range(3)]


def inv3(M):
    a, b, c = M[0]
    d, e, f = M[1]
    g, h, i = M[2]
    A, B, C = e * i - f * h, f * g - d * i, d * h - e * g
    det = a * A + b * B + c * C
    return [[A / det, (c * h - b * i) / det, (b * f - c * e) / det],
            [B / det, (a * i - c * g) / det, (c * d - a * f) / det],
            [C / det, (b * g - a * h) / det, (a * e - b * d) / det]]


def hdop(az):
    """sqrt(Qxx + Qyy) with Q = (H'H)^-1; horizontal rms error is sigma * hdop."""
    Q = inv3(normal(az))
    return math.sqrt(Q[0][0] + Q[1][1])


def solve(az, e):
    """Least-squares (dx, dy, db) for measurement errors e (the estimate error, since truth is 0)."""
    H, Q = design(az), inv3(normal(az))
    Hte = [sum(r[j] * ei for r, ei in zip(H, e)) for j in range(3)]
    return tuple(sum(Q[i][j] * Hte[j] for j in range(3)) for i in range(3))


def residual_stat(az, e):
    """||(I - P) e||^2, the sum of squared post-fit residuals used by a residual-based integrity test."""
    est = solve(az, e)
    return sum((ei - (r[0] * est[0] + r[1] * est[1] + r[2] * est[2])) ** 2 for r, ei in zip(design(az), e))


def ar1(rng, T, rho, s):
    """Stationary AR(1) with marginal std s and lag-1 correlation rho."""
    x = rng.gauss(0, s)
    out = [x]
    k = s * math.sqrt(1 - rho * rho)
    for _ in range(T - 1):
        x = rho * x + rng.gauss(0, k)
        out.append(x)
    return out


def mean_var_factor(T, rho):
    """Var of the T-sample mean of a unit-variance AR(1): (1/T^2)[T + 2 sum_{k<T} (T-k) rho^k]."""
    return (T + 2 * sum((T - k) * rho ** k for k in range(1, T))) / T ** 2


def chi2_sf_even(x, dof):
    """P(chi^2_dof > x) for even dof: exp(-x/2) sum_{j<dof/2} (x/2)^j / j!."""
    assert dof % 2 == 0
    t, s = 1.0, 1.0
    for j in range(1, dof // 2):
        t *= (x / 2) / j
        s += t
    return math.exp(-x / 2) * s


def chi2_isf_even(p, dof):
    lo, hi = 0.0, 200.0
    for _ in range(200):
        mid = (lo + hi) / 2
        lo, hi = (mid, hi) if chi2_sf_even(mid, dof) > p else (lo, mid)
    return (lo + hi) / 2


def coverage_of_claim(var_claimed, var_real, p=0.05):
    """Coverage of the radius that holds 1-p of a circular Gaussian of variance var_claimed, when the truth has var_real."""
    return 1 - p ** (var_claimed / var_real)
