"""Where does a door stop being a dilemma for robots? Sweeping the door's cost ratios.

Builds on `society-doorway` (same go-or-yield game, same people, same mean field) and
varies the collision cost `k` and the dithering cost `d` against the waiting cost `w = 1`.
For a fleet share `r` of robots that all go with probability `g`:

* *individual test* - a single robot (negligible share) compares going with yielding
  against the partners' go share `q` the fleet produces; it gains by going when
  `k q < w q + d (1 - q)`.
* *crowd test* - the `g` on a grid that minimises the whole crowd's mean cost.

A **dilemma cell** is one where the fleet rule that is best for the crowd is not one that
survives the individual test (a robot gains by deviating from it).
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3] / "society-doorway" / "src"))
from society_doorway import cost_go, cost_yield, costs, equilibrium  # noqa: E402

GRID = [i / 50 for i in range(51)]


def deviation_gain(r, g, k, w=1.0, d=1.0, m=9, beta=8.0):
    """Cost of yielding minus cost of going for one robot in a fleet playing g.
    Positive: that robot gains by going. Negative: it gains by yielding."""
    q, _ = equilibrium(r, g, m, beta, k=k, w=w, d=d)
    return cost_yield(q, k, w, d) - cost_go(q, k, w, d)


def crowd_best(r, k, w=1.0, d=1.0, m=9, beta=8.0):
    """Grid go probability minimising the whole crowd's mean cost, and that cost."""
    best = min(GRID, key=lambda g: costs(r, g, m, beta, k, w, d)["cost_all"])
    return best, costs(r, best, m, beta, k, w, d)["cost_all"]


def stable(r, g, k, w=1.0, d=1.0, tol=1e-9, **kw):
    """No single robot gains by deviating from a fleet playing g (pure rule g=0 or 1,
    or a mixed g at which going and yielding cost the same)."""
    gain = deviation_gain(r, g, k, w, d, **kw)
    if g <= 0.0:
        return gain <= tol      # going must not pay
    if g >= 1.0:
        return gain >= -tol     # yielding must not pay
    return abs(gain) <= 1e-3


def cell(r, k, w=1.0, d=1.0, m=9, beta=8.0):
    """Summary for one (k, d) pair at robot share r."""
    gc, call = crowd_best(r, k, w, d, m, beta)
    c0, c1 = (costs(r, g, m, beta, k, w, d)["cost_all"] for g in (0.0, 1.0))
    # Individually stable fleet rules among pure yield / pure go
    pure = [g for g in (0.0, 1.0) if stable(r, g, k, w, d, m=m, beta=beta)]
    return {"crowd_g": gc, "crowd_cost": call, "cost_g0": c0, "cost_g1": c1,
            "gain_at_g0": deviation_gain(r, 0.0, k, w, d, m, beta),
            "gain_at_g1": deviation_gain(r, 1.0, k, w, d, m, beta),
            "stable_pure": pure,
            "dilemma": gc not in pure and not stable(r, gc, k, w, d, m=m, beta=beta)}


def threshold_k(r, d=1.0, w=1.0, m=9, beta=8.0, lo=0.6, hi=40.0):
    """Smallest collision cost k at which a yielding fleet (g = 0) is individually stable,
    i.e. one robot no longer gains by going. Found by bisection on the sign of
    deviation_gain; the gain falls as k rises. None if it is already stable at lo, and
    None if still unstable at hi."""
    if deviation_gain(r, 0.0, lo, w, d, m, beta) <= 0 or deviation_gain(r, 0.0, hi, w, d, m, beta) > 0:
        return None
    for _ in range(50):
        mid = (lo + hi) / 2
        if deviation_gain(r, 0.0, mid, w, d, m, beta) > 0:
            lo = mid
        else:
            hi = mid
    return (lo + hi) / 2
