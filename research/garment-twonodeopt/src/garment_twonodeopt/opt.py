"""Optimal open/closed switching-time oracle (grid search) for the stepped-room scenarios of
../garment-twonodestep, against that project's gate and fixed states."""
import itertools, os, sys
_here = os.path.dirname(__file__)
sys.path.insert(0, os.path.join(_here, "..", "..", "..", "garment-twonodestep", "src"))
from garment_twonodestep import step as st  # noqa: E402

CLOSED, OPEN, OURS, REF, SCENARIOS = st.CLOSED, st.OPEN, st.OURS, st.REF, st.SCENARIOS


def piecewise(first, times):
    """Gate that starts in state `first` and toggles at each minute in `times` (sorted)."""
    ts = tuple(times)
    def g(m, tsk, tcr):
        n = sum(1 for t in ts if m >= t)
        return first if n % 2 == 0 else (OPEN if first == CLOSED else CLOSED)
    return g


def best_schedule(ta0, ta1, opts, max_switches=2, grid=10, minutes=180):
    """Exhaustive search over schedules with <= max_switches toggles on a `grid`-minute grid and either
    start state. Returns (discomfort, first state, switch minutes)."""
    pts = range(grid, minutes, grid)
    best = None
    for k in range(max_switches + 1):
        for times in itertools.combinations(pts, k):
            for first in (CLOSED, OPEN):
                d = st.discomfort(st.simulate(ta0, ta1, opts, piecewise(first, times), minutes=minutes)[1])
                if best is None or d < best[0] - 1e-12:
                    best = (d, first, times)
    return best
