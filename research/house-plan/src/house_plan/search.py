"""Search over plan parameters for the least framing lumber per square foot of floor.

Objective: net framing board feet per sq ft of floor (`takeoff` total_bf over W x D), a lumber proxy
for cost: it carries no prices (those belong to `house-cost`) and ignores sheathing, which is
reported separately. A plan is feasible when the floor area is from `min_area` to 1.15 x `min_area` (so the search cannot win by building bigger) and it has at least `min_bed` bedrooms, `takeoff` reports
no failed member, and `check_layout` reports no rule violation. Infeasible plans score
PENALTY + violations + area shortfall (sq ft / 100), so search is pushed toward feasible ones.

Three searchers share an evaluation budget: random search, a (1+1) local search with restarts (move one
parameter to a neighbouring value; keep it if no worse), and exhaustive enumeration (the truth, since the
grid is finite).
"""
import itertools
import random
from functools import lru_cache

from .plan import Params, make_plan
from .rules import check_layout
from .takeoff import takeoff

PENALTY = 100.0
AREA_BAND = 1.15  # a plan is for a target size: floor area from min_area to 1.15 x min_area
GRID = dict(
    width=[float(v) for v in range(16, 42, 2)],
    depth=[float(v) for v in range(16, 42, 2)],
    n_bed=[1, 2, 3],
    bed_depth=[10.0, 11.0, 12.0, 13.0, 14.0],
    win_w=[3.0, 4.0, 5.0],
    pitch=[4, 6, 8],
    stud_oc=[16, 24],
    joist_oc=[16, 24],
    rafter_oc=[16, 24],
)
KEYS = list(GRID)


def size_of_grid():
    n = 1
    for v in GRID.values():
        n *= len(v)
    return n


@lru_cache(maxsize=None)
def _base(values):
    """The takeoff and rule checks for a tuple of parameter values (in KEYS order); they do not depend on min_area."""
    p = Params(**dict(zip(KEYS, values)))
    plan = make_plan(p)
    t = takeoff(plan)
    bad = tuple(t["failures"]) + tuple(check_layout(plan))
    return bad, p.width * p.depth, t["total_bf"], t["sizes"], t["sheets"], t["central_wall"]


def evaluate(values, min_area, min_bed=1):
    """Score for a tuple of parameter values. Returns (score, detail dict)."""
    bad, area, bf, sizes, sheets, central = _base(values)
    short = max(0.0, min_area - area, area - AREA_BAND * min_area) + 100.0 * max(0, min_bed - values[KEYS.index("n_bed")])
    if bad or short:
        return PENALTY + len(bad) + short / 100.0, dict(feasible=False, bad=list(bad), area=area)
    return bf / area, dict(feasible=True, area=area, bf=bf, sizes=sizes, sheets=sheets, central_wall=central)


def random_search(budget, min_area, rng, min_bed=1):
    best = (float("inf"), None)
    for _ in range(budget):
        v = tuple(rng.choice(GRID[k]) for k in KEYS)
        s = evaluate(v, min_area, min_bed)[0]
        if s < best[0]:
            best = (s, v)
    return best


def local_search(budget, min_area, rng, restart_after=40, min_bed=1):
    """(1+1) search: from a random start, move one parameter one step along its grid; restart when stuck."""
    best = (float("inf"), None)
    used = 0
    while used < budget:
        cur = tuple(rng.choice(GRID[k]) for k in KEYS)
        cs = evaluate(cur, min_area, min_bed)[0]
        used += 1
        stuck = 0
        while used < budget and stuck < restart_after:
            i = rng.randrange(len(KEYS))
            g = GRID[KEYS[i]]
            j = g.index(cur[i]) + rng.choice((-1, 1))
            if not 0 <= j < len(g):
                stuck += 1
                continue
            cand = cur[:i] + (g[j],) + cur[i + 1:]
            s = evaluate(cand, min_area, min_bed)[0]
            used += 1
            if s <= cs:
                stuck = 0 if s < cs else stuck + 1
                cur, cs = cand, s
            else:
                stuck += 1
        if cs < best[0]:
            best = (cs, cur)
    return best


def exhaustive(min_area, min_bed=1):
    best = (float("inf"), None)
    n = 0
    for v in itertools.product(*(GRID[k] for k in KEYS)):
        s = evaluate(v, min_area, min_bed)[0]
        n += 1
        if s < best[0]:
            best = (s, v)
    return best, n
