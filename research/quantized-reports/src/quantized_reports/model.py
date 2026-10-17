"""Finite-precision reports under a proper scoring rule.

An agent with belief q must report r from a finite grid G subset of [0,1]. Under a proper scoring rule the
expected-score regret of reporting r is the Bregman divergence D(q, r): (q-r)^2 for Brier, KL(q||r) for log.
The agent reports argmin_r D(q, r) (for log this is *not* the nearest point). Mean regret is averaged over a
prior on q, represented by equal-weight quantile points.
"""
from bisect import bisect_left
from math import log, sin, pi, inf, ldexp, frexp
import struct


def brier_div(q, r):
    return (q - r) ** 2


def log_div(q, r):
    """KL(q||r) for Bernoulli; +inf if r rules out an outcome q gives mass to."""
    s = 0.0
    if q > 0:
        if r <= 0:
            return inf
        s += q * log(q / r)
    if q < 1:
        if r >= 1:
            return inf
        s += (1 - q) * log((1 - q) / (1 - r))
    return s


def _best_regret(q, grid, div):
    # D(q, .) is unimodal with minimum at q, so the optimum is one of the two bracketing grid points.
    i = bisect_left(grid, q)
    cands = []
    if i < len(grid):
        cands.append(grid[i])
    if i > 0:
        cands.append(grid[i - 1])
    return min(div(q, r) for r in cands)


def mean_regret(grid, div, qs):
    grid = sorted(grid)
    return sum(_best_regret(q, grid, div) for q in qs) / len(qs)


def prior_quantiles(name, M=100000):
    """M equal-weight quantile points of the prior: 'uniform' or 'arcsine' (Beta(1/2,1/2), confident agents)."""
    us = [(i + 0.5) / M for i in range(M)]
    if name == "uniform":
        return us
    if name == "arcsine":
        return [sin(pi * u / 2) ** 2 for u in us]
    raise ValueError(name)


def uniform_grid(N):
    """N cell-midpoint reports (i+1/2)/N."""
    return [(i + 0.5) / N for i in range(N)]


def compander_grid(N, density, M=400000):
    """N points at the (i+1/2)/N quantiles of the point density `density(q)` (need not be normalised)."""
    qs = [(j + 0.5) / M for j in range(M)]
    cdf, acc = [], 0.0
    for q in qs:
        acc += density(q)
        cdf.append(acc)
    tot = cdf[-1]
    out, j = [], 0
    for i in range(N):
        target = (i + 0.5) / N * tot
        while cdf[j] < target:
            j += 1
        out.append(qs[j])
    return sorted(set(out))


def minifloat_grid(exp_bits, man_bits, bias=None):
    """All representable values in (0,1] of an unsigned minifloat (subnormals included), plus 0.
    Values above 1 are dropped. Default bias makes 1.0 representable with the top exponent unused for inf/nan."""
    if bias is None:
        bias = 2 ** (exp_bits - 1) - 1
    vals = {0.0}
    for e in range(2 ** exp_bits):
        for m in range(2 ** man_bits):
            if e == 0:
                v = (m / 2 ** man_bits) * 2.0 ** (1 - bias)
            else:
                v = (1 + m / 2 ** man_bits) * 2.0 ** (e - bias)
            if v <= 1.0:
                vals.add(v)
    return sorted(vals)


def symmetrized(grid):
    """Represent min(p, 1-p) in the format: reports are g and 1-g, so precision is fine near both 0 and 1."""
    half = [g for g in grid if g <= 0.5]
    return sorted(set(half) | {1 - g for g in half})


def predicted_regret(N, div_name, prior, M=400000):
    """High-resolution prediction of the optimal-grid mean regret: (1/(24 N^2)) (int (pi*I)^(1/3) dq)^3,
    Fisher weight I = 2 (Brier, D=(q-r)^2) or 1/(q(1-q)) (log)."""
    def pi_(q):
        return 1.0 if prior == "uniform" else 1.0 / (pi * (q * (1 - q)) ** 0.5)
    def fisher(q):
        return 2.0 if div_name == "brier" else 1.0 / (q * (1 - q))
    s = sum((pi_((j + .5) / M) * fisher((j + .5) / M)) ** (1 / 3) for j in range(M)) / M
    return s ** 3 / (24 * N * N)


def optimal_density(div_name, prior):
    def d(q):
        p = 1.0 if prior == "uniform" else 1.0 / (q * (1 - q)) ** 0.5
        I = 2.0 if div_name == "brier" else 1.0 / (q * (1 - q))
        return (p * I) ** (1 / 3)
    return d
