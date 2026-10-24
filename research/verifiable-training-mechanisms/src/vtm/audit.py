"""Deterrence by audit across jobs: the threshold, and a numeric best response to test it."""

__all__ = ["threshold", "cheats", "numeric_threshold", "full_cost"]


def cheats(p, g, S):
    """Worker's best response on one job audited w.p. p: cheat iff (1-p) g - p S > 0 (ties honest)."""
    return (1 - p) * g - p * S > 0


def threshold(g, S):
    """Smallest audit probability that deters: g / (g + S)."""
    return g / (g + S)


def numeric_threshold(g, S, iters=200):
    """The same threshold by bisection on the best response, with no formula used."""
    lo, hi = 0.0, 1.0
    for _ in range(iters):
        mid = (lo + hi) / 2
        if cheats(mid, g, S):
            lo = mid
        else:
            hi = mid
    return hi


def full_cost(gs, S):
    """Expected audits to deter every job."""
    return sum(threshold(g, S) for g in gs)
