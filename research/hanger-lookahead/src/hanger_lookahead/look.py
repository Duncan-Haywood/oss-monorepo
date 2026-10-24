"""Two arms on one pile: does steering clear of the OTHER arm's predicted next pick beat only avoiding its current pick?

hanger-avoid lets an arm skip garments within `sep` of the other arm's pick in progress. Here, with `look=True`, the
arm also predicts the other arm's next target (its policy on a copy of the pile, after this arm's own unrestricted
choice is taken out, with a copy of the random stream) and drops garments within `sep` of that prediction from its
allowed set, when the other arm will start before `window` seconds have passed. The prediction is imperfect: the
real stream differs after this pick. With `look=False` the result is hanger-avoid's `avoid=True` (test). Stdlib only;
clearance and station times are the earlier placeholders.
"""
import copy
import math
import random
import statistics
import sys
from pathlib import Path

RESEARCH = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(RESEARCH / "hanger-avoid" / "src"))
from hanger_avoid.avoid import (CellParams, PickParams, insertion_table, hang_share, make_pile,  # noqa: E402,F401
                                pick_allowed, replace, run_once)


def sequence_look(n, policy, pp, seed, sep=0.0, downstream=14.0, look=True, window=1e9):
    """Two-arm sequence as hanger-avoid's `shared_sequence_avoid`, plus lookahead. Returns ([(seconds, ok)],
    picks redirected by the current-pick rule, picks redirected by the lookahead rule)."""
    arms = 2
    rng = random.Random(seed)
    pile = make_pile(n, rng, pp.p_hidden)
    free = [0.0] * arms
    active = [None] * arms
    out, red_live, red_look = [], 0, 0
    while pile:
        a = min(range(arms), key=lambda i: free[i])
        o = 1 - a
        start = free[a]
        live = [active[o][2]] if active[o] and active[o][0] <= start < active[o][1] else []

        def clash(h, pts):
            return sep > 0 and any(math.hypot(h.x - q.x, h.y - q.y) < sep for q in pts)

        ids = {id(h) for h in pile}
        if sep > 0 and (live or (look and free[o] - start < window)):
            probe_rng = random.Random()
            probe_rng.setstate(rng.getstate())
            probe = copy.deepcopy(pile)
            g0, _, _ = pick_allowed(probe, {id(h) for h in probe}, policy, pp, probe_rng)
            if live:
                ok = {id(h) for h in pile if not clash(h, live)}
                if ok and ok != ids and clash(g0, live):
                    ids, red_live = ok, red_live + 1
            if look and probe and free[o] - start < window and len(ids) > 1:
                gn, _, _ = pick_allowed(probe, {id(h) for h in probe}, policy, pp, probe_rng)
                # map the predicted target back to the real pile by position (the copy has other ids)
                near = {id(h) for h in ids_pile(pile, ids) if math.hypot(h.x - gn.x, h.y - gn.y) >= sep}
                if near and near != ids and clash(g0, [gn]):
                    ids, red_look = near, red_look + 1
        g, t, info = pick_allowed(pile, ids, policy, pp, rng)
        wait = 0.0
        if active[o] and active[o][0] <= start < active[o][1] and clash(g, [active[o][2]]):
            wait = active[o][1] - start
        t += wait
        active[a] = (start, start + t, g)
        free[a] = start + t + downstream
        out.append((t, bool(info["ok"])))
    return out, red_live, red_look


def ids_pile(pile, ids):
    return [h for h in pile if id(h) in ids]


def per_load(cp, policy, pp, reps, sep, look, window=1e9, seed=0, downstream=14.0):
    """done/h and (lookahead redirects) for `reps` loads; load i uses the same seed whether look is on or off."""
    table, share = insertion_table(), hang_share()
    done, reds = [], []
    for i in range(reps):
        s = seed * 100003 + i
        picks, _, rl = sequence_look(cp.load, policy, pp, s, sep, downstream, look, window)
        r = run_once(cp, s, table, share, picks=picks)
        done.append((r["hung"] + r["folded"]) / r["makespan"] * 3600.0)
        reds.append(rl)
    return done, reds
