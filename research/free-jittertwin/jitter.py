"""Sampled-data stabilisation of x' = a x with random sampling intervals.

Control u = -k x(t_j) held over interval h_j, so x(t_{j+1}) = g(h_j) x(t_j) with
g(h) = e^{a h} - (k/a)(e^{a h} - 1).  Nominal interval h0; the gain k is chosen
so the *fixed-interval* twin has contraction factor rho0 = g(h0).
Stdlib only.
"""
import math
import random


def gain_for(a, h0, rho0):
    """Gain k with g(h0) = rho0."""
    e = math.exp(a * h0)
    return a * (e - rho0) / (e - 1.0)


def g(a, k, h):
    e = math.exp(a * h)
    return e - (k / a) * (e - 1.0)


def uniform_nodes(h0, j, n=2001):
    """Midpoint quadrature nodes (equal weights) for h ~ U[h0(1-j), h0(1+j)]."""
    lo, hi = h0 * (1 - j), h0 * (1 + j)
    return [lo + (hi - lo) * (i + 0.5) / n for i in range(n)]


def moments(a, k, nodes, weights=None):
    """(E ln|g|, E g^2) over the discrete law (nodes, weights)."""
    if weights is None:
        weights = [1.0 / len(nodes)] * len(nodes)
    lyap = m2 = 0.0
    for h, w in zip(nodes, weights):
        v = g(a, k, h)
        m2 += w * v * v
        lyap += w * (math.log(abs(v)) if v != 0 else -1e9)
    return lyap, m2


def drop_law(h0, p):
    """Interval h0, or 2*h0 with probability p (a missed sample)."""
    return [h0, 2 * h0], [1 - p, p]


def threshold(f, lo, hi, it=60):
    """Largest x in [lo,hi] with f(x) true, f monotone true then false; None if f(lo) false."""
    if not f(lo):
        return None
    if f(hi):
        return hi
    for _ in range(it):
        mid = 0.5 * (lo + hi)
        if f(mid):
            lo = mid
        else:
            hi = mid
    return lo


def simulate(a, k, sampler, steps, runs, rng, blow=1e6):
    """Fraction of runs whose |x| exceeds blow*|x0| within `steps` samples,
    and the median log-growth rate per step."""
    bad, rates = 0, []
    for _ in range(runs):
        lx = 0.0
        for _ in range(steps):
            lx += math.log(abs(g(a, k, sampler(rng))) + 1e-300)
            if lx > math.log(blow):
                break
        if lx > math.log(blow):
            bad += 1
        rates.append(lx / steps)
    rates.sort()
    return bad / runs, rates[len(rates) // 2]
