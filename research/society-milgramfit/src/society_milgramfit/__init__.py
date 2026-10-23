"""Fit the society-enforcers human-objection input to Milgram et al.'s (1986) line-intrusion rates.

Reuses the society-enforcers model unchanged (imported from its src). New here: p_star, the
least lone-cut stopping chance p0 at which a crowd of people alone (no cutter robots, no
enforcers) keeps a queueing norm, and the independence check on the two-intruder rate.
"""
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
