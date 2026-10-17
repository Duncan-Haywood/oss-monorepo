"""Committing one occupancy-grid cell with log-odds tuned in a sensor twin. A binary beam model returns 'hit' with probability
p1 if the cell is occupied and p0 if free (real sensor); the twin believes q1, q0. The mapper adds the twin's log-likelihood ratio per
observation (+a on a hit, -b on a miss) from a flat prior and commits when the log-odds reach +-A. Real error rates follow from
the walk under the REAL sensor."""
import math
import random

__all__ = ["llr", "reflect", "theta_star", "error_bounds", "exact_error", "mc_error", "threshold", "drift", "tempered_threshold",
           "theta_delta_sd", "plugin_theta"]


def llr(q1, q0):
    """Twin log-likelihood ratios: a = ln(q1/q0) added on a hit, b = ln((1-q0)/(1-q1)) subtracted on a miss."""
    return math.log(q1 / q0), math.log((1 - q0) / (1 - q1))


def reflect(p, a, b):
    """Occupied-cell view: mirror the walk so that a wrong commit is always the upper barrier."""
    return 1 - p, b, a


def drift(p, a, b):
    return p * a - (1 - p) * b


def theta_star(p, a, b):
    """Adjustment coefficient: the positive root of p e^{ta} + (1-p) e^{-tb} = 1 (needs negative drift). Equals 1 for a correct twin."""
    if drift(p, a, b) >= 0:
        return 0.0
    f = lambda t: p * math.exp(t * a) + (1 - p) * math.exp(-t * b) - 1
    lo, hi = 1e-12, 1.0
    while f(hi) < 0:
        hi *= 2
    for _ in range(200):
        mid = (lo + hi) / 2
        lo, hi = (mid, hi) if f(mid) < 0 else (lo, mid)
    return (lo + hi) / 2


def threshold(eps):
    """Symmetric log-odds threshold that a twin-calibrated mapper uses for a target error eps."""
    return math.log((1 - eps) / eps)


def error_bounds(p, a, b, A):
    """Rigorous optional-stopping sandwich on P(commit wrongly), from martingale exp(theta* S)."""
    t = theta_star(p, a, b)
    lo = (1 - math.exp(-t * A)) / (math.exp(t * (A + a)) - math.exp(-t * A))
    hi = (1 - math.exp(-t * (A + b))) / (math.exp(t * A) - math.exp(-t * (A + b)))
    return lo, hi


def exact_error(p, a, b, A, nmax=20000):
    """Exact P(hit +A first), E[stop time] and unresolved mass, by dynamic programming over hit counts."""
    layer = {0: 1.0}
    wrong = et = 0.0
    for n in range(nmax):
        if not layer:
            break
        nxt = {}
        for h, w in layer.items():
            m = n - h
            for dh, pr in ((1, p), (0, 1 - p)):
                h2, m2 = h + dh, m + 1 - dh
                s = h2 * a - m2 * b
                mass = w * pr
                if s >= A:
                    wrong += mass
                    et += mass * (n + 1)
                elif s <= -A:
                    et += mass * (n + 1)
                else:
                    nxt[h2] = nxt.get(h2, 0.0) + mass
        layer = nxt
    return wrong, et, sum(layer.values())


def mc_error(p, a, b, A, rng, runs=20000):
    wrong = 0
    for _ in range(runs):
        s = 0.0
        while -A < s < A:
            s += a if rng.random() < p else -b
        wrong += s >= A
    return wrong / runs


def tempered_threshold(p, a, b, eps):
    """Threshold making the Lundberg exponent hit the target: exp(-theta* A) = eps, i.e. A = ln(1/eps)/theta*."""
    return math.log(1 / eps) / theta_star(p, a, b)


def plugin_theta(phat, a, b):
    return theta_star(min(max(phat, 1e-9), 1 - 1e-9), a, b)


def theta_delta_sd(p, a, b, n):
    """Delta-method sd of the plug-in theta* from n real samples of the cell's hit rate p (a, b fixed by the twin)."""
    t = theta_star(p, a, b)
    dfdp = math.exp(t * a) - math.exp(-t * b)
    dfdt = p * a * math.exp(t * a) - (1 - p) * b * math.exp(-t * b)
    return abs(dfdp / dfdt) * math.sqrt(p * (1 - p) / n)
