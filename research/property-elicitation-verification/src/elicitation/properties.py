"""Finite-support distributions, properties, and numerical elicitation checks."""
import math


class Dist:
    def __init__(self, support, probs):
        z = float(sum(probs))
        self.support = list(support)
        self.probs = [p / z for p in probs]

    def mix(self, other, w=0.5):
        return Dist(self.support + other.support,
                    [w * p for p in self.probs] + [(1 - w) * p for p in other.probs])


def mean(d):
    return sum(p * y for y, p in zip(d.support, d.probs))


def variance(d):
    m = mean(d)
    return sum(p * (y - m) ** 2 for y, p in zip(d.support, d.probs))


def quantile(d, tau):
    """Smallest y with F(y) >= tau (a minimiser of expected pinball loss)."""
    acc = 0.0
    for y, p in sorted(zip(d.support, d.probs)):
        acc += p
        if acc >= tau - 1e-12:
            return y
    return max(d.support)


def expectile(d, tau, iters=200):
    """Solve E[|tau - 1(y<r)| (y - r)] = 0 by bisection."""
    lo, hi = min(d.support), max(d.support)
    for _ in range(iters):
        r = 0.5 * (lo + hi)
        g = sum(p * ((1 - tau) if y < r else tau) * (y - r)
                for y, p in zip(d.support, d.probs))
        lo, hi = (r, hi) if g > 0 else (lo, r)
    return 0.5 * (lo + hi)


def expected_score(d, score, r):
    return sum(p * score(r, y) for y, p in zip(d.support, d.probs))


def argmin_report(d, score, grid=801, refine=60):
    """Minimise expected score over reports in the support hull: coarse grid
    then golden-section refinement around the best cell."""
    lo, hi = min(d.support), max(d.support)
    if lo == hi:
        return lo
    pts = [lo + (hi - lo) * i / (grid - 1) for i in range(grid)]
    vals = [expected_score(d, score, r) for r in pts]
    i = min(range(grid), key=vals.__getitem__)
    a, b = pts[max(i - 1, 0)], pts[min(i + 1, grid - 1)]
    g = (math.sqrt(5) - 1) / 2
    c, e = b - g * (b - a), a + g * (b - a)
    for _ in range(refine):
        if expected_score(d, score, c) < expected_score(d, score, e):
            b = e
        else:
            a = c
        c, e = b - g * (b - a), a + g * (b - a)
    return 0.5 * (a + b)


def level_set_is_convex_counterexample(prop, p, q, tol=1e-9):
    """Necessary condition for elicitability (Osband 1985; Lambert, Pennock &
    Shoham 2008): if prop(p) == prop(q), then prop(w p + (1-w) q) must equal it.
    Returns (True, None) if the condition holds on this pair, else (False, value)."""
    a, b = prop(p), prop(q)
    if abs(a - b) > tol:
        raise ValueError("p and q must have the same property value")
    v = prop(p.mix(q, 0.5))
    return (abs(v - a) <= tol), v
