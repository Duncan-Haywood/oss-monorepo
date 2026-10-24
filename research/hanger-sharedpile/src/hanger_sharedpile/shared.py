"""Two (or more) arms emptying ONE hanger-pick pile, blocking each other, feeding the hanger-cell model.

Stylised, stdlib only. hanger-cellpick drew one pick sequence per load and let arms take picks in turn, so arms
never met on the pile. Here arms act on the same pile in time order. An arm that starts a pick while another is
still mid-pick waits until that pick ends if the two target garments' centres are closer than `sep` metres (the
clearance two grippers need; assumed and swept, no datasheet applies). Each arm's cycle is its pick plus a
fixed `downstream` time standing in for sensing and hang/fold hand-off; the full cell model then re-times it.
"""
import math
import random
import sys
from pathlib import Path

RESEARCH = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(RESEARCH / "hanger-cellpick" / "src"))
from hanger_cellpick.cellpick import (CellParams, PickParams, bottleneck, dryers_served,  # noqa: E402,F401
                                      per_hour_ci, replace)
from hanger_cell.model import hang_share, insertion_table, run_once  # noqa: E402
from hanger_pick.pile import make_pile, pick  # noqa: E402
import statistics  # noqa: E402


def shared_sequence(n, policy, pp, seed, arms=2, sep=0.0, downstream=14.0):
    """Empty one pile with `arms` arms. Returns ([(seconds, ok)] in pick-start order, number of blocked picks,
    total seconds waited)."""
    rng = random.Random(seed)
    pile = make_pile(n, rng, pp.p_hidden)
    free = [0.0] * arms
    active = [None] * arms              # (start, end, garment) of each arm's latest pick
    out, blocked, waited = [], 0, 0.0
    while pile:
        a = min(range(arms), key=lambda i: free[i])
        start = free[a]
        before = list(pile)
        t, info = pick(pile, policy, pp, rng)
        g = next(h for h in before if h not in pile)
        wait = 0.0
        if sep > 0:
            for b in range(arms):
                if b != a and active[b] and active[b][0] <= start < active[b][1] \
                        and math.hypot(g.x - active[b][2].x, g.y - active[b][2].y) < sep:
                    wait = max(wait, active[b][1] - start)
        if wait:
            blocked += 1
            waited += wait
        t += wait
        active[a] = (start, start + t, g)
        free[a] = start + t + downstream
        out.append((t, bool(info["ok"])))
    return out, blocked, waited


def replicate(cp, policy, pp, reps=200, seed=0, sep=0.0, downstream=14.0):
    table, share = insertion_table(), hang_share()
    runs, blk, wt = [], [], []
    for i in range(reps):
        s = seed * 100003 + i
        picks, b, w = shared_sequence(cp.load, policy, pp, s, cp.arms, sep, downstream)
        r = run_once(cp, s, table, share, picks=picks)
        r["done_per_hour"] = (r["hung"] + r["folded"]) / r["makespan"] * 3600.0
        runs.append(r)
        blk.append(b)
        wt.append(w)
    out = {k: statistics.fmean(r[k] for r in runs) for k in runs[0]}
    out.update(_runs=runs, blocked=statistics.fmean(blk), waited=statistics.fmean(wt))
    return out
