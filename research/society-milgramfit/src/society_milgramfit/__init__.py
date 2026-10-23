"""Fit the society-enforcers human-objection input to Milgram et al.'s (1986) line-intrusion rates.

Reuses the society-enforcers model unchanged (imported from its src). New here: p_star, the
least lone-cut stopping chance p0 at which a crowd of people alone (no cutter robots, no
enforcers) keeps a queueing norm, and the independence check on the two-intruder rate.
"""
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3] / "society-enforcers" / "src"))
from society_enforcers import critical_share, human_cut_share, min_enforcers  # noqa: E402,F401


def p_star(m=9, k=1.0, eps=0.02, e=0.0, q=0.5, view=10, tol=1e-4):
    """Least p0 at which people alone (rho=0) end below a 0.5 cut share, starting from a norm."""
    lo, hi = 0.0, 1.0
    if human_cut_share(0.0, m, 1.0, k, eps, e, q, view) >= 0.5:
        return float("nan")
    while hi - lo > tol:
        mid = (lo + hi) / 2
        if human_cut_share(0.0, m, mid, k, eps, e, q, view) < 0.5:
            hi = mid
        else:
            lo = mid
    return hi


def per_viewer(any_react, view):
    """r such that 1-(1-r)**view = any_react: independent viewers, `view` in sight of the intruder."""
    return 1.0 - (1.0 - any_react) ** (1.0 / view)


def independent_two(p):
    """P(at least one of two intruders is objected to) if each is objected to independently."""
    return 1.0 - (1.0 - p) ** 2


def contagion_any(r0, n_viewers, c):
    """P(at least one of n_viewers reacts) when each viewer reacts with min(1, r0 + c*k), k = reactions so far.
    Exactly (1-r0)**n for every c >= 0: influence acts only after a first reaction, so it cannot move this rate."""
    none = 1.0
    state = {0: 1.0}  # reactions so far -> probability, tracked to show the identity numerically
    for _ in range(n_viewers):
        nxt = {}
        for k, pr in state.items():
            p = min(1.0, r0 + c * k)
            nxt[k + 1] = nxt.get(k + 1, 0.0) + pr * p
            nxt[k] = nxt.get(k, 0.0) + pr * (1 - p)
        state = nxt
    return 1.0 - state.get(0, 0.0)


def hazard_exponent(p_one, p_two):
    """a with 1-(1-p_one)**(2**a) = p_two: how fast the reaction hazard grows with the number of intruders (n**a)."""
    return math.log(math.log(1 - p_two) / math.log(1 - p_one), 2)
