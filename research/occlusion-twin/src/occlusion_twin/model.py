"""Beam visibility through a Poisson field of occluders (foliage, crowd, rubble), stylised and one-dimensional.

Occluder centres projected onto the lateral axis form a Poisson process of intensity mu per unit length (mu = areal density x beam
depth, for beams long compared with the occluder radius rho). A beam at lateral position y is blocked iff a centre lies within rho of y.
Hence for a set S of beams
    P(all of S clear) = exp(-mu |union_{k in S} (y_k - rho, y_k + rho)|)                                  (1)
In particular one beam is clear with probability p = exp(-2 rho mu), and two beams a distance s apart are both clear with
probability exp(-mu (2 rho + min(s, 2 rho))), which equals p^2 iff s >= 2 rho: beams closer than an occluder diameter share occluders.
The "independent-beam twin" gives every beam visibility p independently (or, equivalently, thins a point cloud i.i.d.).
"""
import math
import random
from itertools import combinations


def p_clear(rho, mu):
    return math.exp(-2.0 * rho * mu)


def union_length(ys, rho):
    """Length of the union of the intervals (y - rho, y + rho)."""
    ys = sorted(ys)
    total = 2.0 * rho
    for a, b in zip(ys, ys[1:]):
        total += min(b - a, 2.0 * rho)
    return total


def p_all_clear(ys, rho, mu):
    return math.exp(-mu * union_length(ys, rho))


def p_pair_clear(s, rho, mu):
    return math.exp(-mu * (2.0 * rho + min(abs(s), 2.0 * rho)))


def p_blind_exact(ys, rho, mu):
    """P(every beam blocked) by inclusion-exclusion over subsets of beams being clear: sum_S (-1)^|S| P(S clear). Use for len(ys) <= ~16."""
    n = len(ys)
    if n > 18:
        raise ValueError("too many beams for inclusion-exclusion")
    total = 1.0
    for k in range(1, n + 1):
        sgn = -1.0 if k % 2 else 1.0
        for idx in combinations(range(n), k):
            total += sgn * p_all_clear([ys[i] for i in idx], rho, mu)
    return max(total, 0.0)


def p_blind_indep(n, rho, mu):
    """Independent-beam twin: (1 - p)^n."""
    return (1.0 - p_clear(rho, mu)) ** n


def beams(n, s):
    return [k * s for k in range(n)]


def var_clear_count(ys, rho, mu):
    """Exact variance of the number of clear beams: sum over ordered pairs of P(both clear) - p^2 (diagonal gives p - p^2)."""
    p = p_clear(rho, mu)
    v = 0.0
    for i, a in enumerate(ys):
        for j, b in enumerate(ys):
            v += (p if i == j else p_pair_clear(a - b, rho, mu)) - p * p
    return v


def var_clear_count_indep(n, rho, mu):
    p = p_clear(rho, mu)
    return n * p * (1.0 - p)


def sample_blocked(ys, rho, mu, rng):
    """Ensemble twin: draw an occluder field covering the beams and return the blocked flags."""
    lo, hi = min(ys) - rho, max(ys) + rho
    lam = mu * (hi - lo)
    n = _poisson(lam, rng)
    cs = [rng.uniform(lo, hi) for _ in range(n)]
    return [any(abs(c - y) < rho for c in cs) for y in ys]


def _poisson(lam, rng):
    if lam > 30:
        return max(0, int(round(rng.gauss(lam, math.sqrt(lam)))))
    L, k, t = math.exp(-lam), 0, 1.0
    while True:
        t *= rng.random()
        if t <= L:
            return k
        k += 1


def beams_needed(eps, s, rho, mu, exact=True, nmax=16):
    """Smallest number of beams at spacing s whose blind probability is <= eps (None if > nmax). exact=False: independent-beam twin."""
    for n in range(1, nmax + 1):
        pb = p_blind_exact(beams(n, s), rho, mu) if exact else p_blind_indep(n, rho, mu)
        if pb <= eps:
            return n
    return None
