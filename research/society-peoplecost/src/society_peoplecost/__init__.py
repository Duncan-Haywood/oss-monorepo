"""Who does a signal-reading door fleet help? Cost to people only, and to a planner who weights urgent waiting.

`society-cheapcue` found the crowd average (robots counted as agents) is worse off under a reading fleet than
under yield-all in all 35 cells tried, because robots that go against non-signallers collide more. Its first
next step: score people alone, and a planner who weights urgent people's cost by `lam` (1 = plain average).
Everything is imported from `society-cheapcue`; only the aggregation differs.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3] / "society-cheapcue" / "src"))
from society_cheapcue import DEF, reader, yield_all  # noqa: E402,F401


def people_cost(s, u=DEF["u"], lam=1.0):
    """Planner cost over people only: urgent weighted by `lam`, normal by 1, normalised by total weight."""
    return (lam * u * s["cU"] + (1 - u) * s["cN"]) / (lam * u + (1 - u))


def planner_gain(r, rho, cN, lam=1.0, e=0.0, **kw):
    """Yield-all people cost minus reader people cost (positive = the fleet helps people)."""
    u = {**DEF, **kw}["u"]
    return people_cost(yield_all(r, e, **kw), u, lam) - people_cost(reader(r, rho * cN, cN, e, **kw), u, lam)


def breakeven_lambda(r, rho, cN, e=0.0, **kw):
    """Smallest urgent weight at which a people-only planner prefers the reader fleet (None if never below 50)."""
    lo, hi = 0.0, 50.0
    if planner_gain(r, rho, cN, hi, e, **kw) <= 0:
        return None
    if planner_gain(r, rho, cN, lo, e, **kw) > 0:
        return 0.0
    for _ in range(50):
        mid = 0.5 * (lo + hi)
        lo, hi = (mid, hi) if planner_gain(r, rho, cN, mid, e, **kw) <= 0 else (lo, mid)
    return hi
