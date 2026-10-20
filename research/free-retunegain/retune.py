"""Retuning the gain of x' = a x on the sampling-interval law instead of the fixed-period twin.

x(t_{j+1}) = g(h_j) x(t_j), g(h) = e^{a h} - kappa (e^{a h} - 1), kappa = k/a.
For a discrete law (nodes h_i, weights w_i) E g^2 is a convex quadratic in kappa, so its
minimiser is closed form: kappa* = sum w E(E-1) / sum w (E-1)^2 with E = e^{a h}.
Stdlib only.
"""
import math


def g(a, kappa, h):
    e = math.exp(a * h)
    return e - kappa * (e - 1.0)


def kappa_twin(a, h0, rho0):
    """kappa with g(h0) = rho0 (the gain a fixed-period twin would give)."""
    e = math.exp(a * h0)
    return (e - rho0) / (e - 1.0)


def kappa_ms(a, nodes, weights):
    """kappa minimising E g^2 over the law."""
    num = den = 0.0
    for h, w in zip(nodes, weights):
        e = math.exp(a * h)
        num += w * e * (e - 1.0)
        den += w * (e - 1.0) ** 2
    return num / den


def ms(a, kappa, nodes, weights):
    return sum(w * g(a, kappa, h) ** 2 for h, w in zip(nodes, weights))


def lyap(a, kappa, nodes, weights):
    return sum(w * (math.log(abs(v)) if (v := g(a, kappa, h)) != 0 else -1e9)
               for h, w in zip(nodes, weights))


def kappa_as(a, nodes, weights, lo=0.0, hi=3.0, n=3001):
    """kappa minimising E ln|g| by grid scan then golden refinement (non-convex)."""
    best = min((lyap(a, lo + (hi - lo) * i / n, nodes, weights), lo + (hi - lo) * i / n) for i in range(n + 1))
    k0 = best[1]
    step = (hi - lo) / n
    a_, b_ = k0 - step, k0 + step
    for _ in range(60):
        m1, m2 = a_ + (b_ - a_) / 3, b_ - (b_ - a_) / 3
        if lyap(a, m1, nodes, weights) < lyap(a, m2, nodes, weights):
            b_ = m2
        else:
            a_ = m1
    return 0.5 * (a_ + b_)


def miss_law(h0, q):
    return [h0, 2 * h0], [1 - q, q]


def uniform_law(h0, j, n=2001):
    lo, hi = h0 * (1 - j), h0 * (1 + j)
    return [lo + (hi - lo) * (i + 0.5) / n for i in range(n)], [1.0 / n] * n


def largest(f, lo, hi, it=60):
    """Largest x in [lo,hi] with f true (f true then false); None if f(lo) false; hi if f(hi)."""
    if not f(lo):
        return None
    if f(hi):
        return hi
    for _ in range(it):
        mid = 0.5 * (lo + hi)
        lo, hi = (mid, hi) if f(mid) else (lo, mid)
    return lo
