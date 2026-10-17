"""Sampled audits of a committed T-step trace.

A solver corrupts j of T steps (each corruption is worth g to it and exceeds the tolerance, so it is
caught whenever that step is audited). The verifier audits k steps uniformly without replacement. If h
corrupted steps are audited the solver is slashed S(h) = min(F, f*h) (F=inf: proportional; f=inf: flat).
"""
from dataclasses import dataclass
from math import comb, inf


@dataclass(frozen=True)
class Params:
    T: int          # trace length
    g: float        # gain per corrupted step
    F: float = inf  # slash cap (stake)
    f: float = inf  # slash per detected step


def hyper_pmf(T, j, k):
    """P(H=h) for H = #corrupted among k audited steps, j corrupted of T."""
    tot = comb(T, k)
    lo, hi = max(0, k - (T - j)), min(j, k)
    return {h: comb(j, h) * comb(T - j, k - h) / tot for h in range(lo, hi + 1)}


def slash(p, h):
    if h == 0:
        return 0.0
    return min(p.F, p.f * h)


def expected_slash(p, j, k):
    return sum(pr * slash(p, h) for h, pr in hyper_pmf(p.T, j, k).items())


def payoff(p, j, k):
    return j * p.g - expected_slash(p, j, k)


def best_response(p, k):
    """(j*, payoff) maximising the solver's payoff over j in 0..T (ties -> smaller j)."""
    best = (0, 0.0)
    for j in range(1, p.T + 1):
        v = payoff(p, j, k)
        if v > best[1] + 1e-12:
            best = (j, v)
    return best


def deters(p, k):
    return best_response(p, k)[0] == 0


def min_samples(p, kmax=None):
    """Smallest k in 1..kmax (default T) that makes cheating unprofitable, else None."""
    for k in range(1, (kmax or p.T) + 1):
        if deters(p, k):
            return k
    return None


def frontier(T, g, f, Fs):
    """For each stake cap F, the least audit count k deterring cheating (None if infeasible)."""
    return [(F, min_samples(Params(T, g, F, f))) for F in Fs]


def cheapest_point(T, g, f, Fs, capital_rate, audit_cost):
    """Minimise capital_rate*F + audit_cost*k over the grid of stakes."""
    best = None
    for F, k in frontier(T, g, f, Fs):
        if k is None:
            continue
        c = capital_rate * F + audit_cost * k
        if best is None or c < best[0]:
            best = (c, F, k)
    return best


def is_convex(vals, tol=1e-9):
    return all(vals[i - 1] - 2 * vals[i] + vals[i + 1] >= -tol for i in range(1, len(vals) - 1))
