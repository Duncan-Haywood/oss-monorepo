"""Two arms on one pile: yield to the other arm's predicted next pick only when the predicted overlap is long.

hanger-lookahead redirects an arm whenever its choice lies within `sep` of the predicted next target of the other
arm, which started losing garments an hour. Its first next step: yield only when the clash would cost a wait longer
than the garment is worth. Here the arm computes the overlap it would cause, (end of its own unrestricted pick) minus
(the moment the other arm becomes free), and redirects only if that overlap is at least `tau` seconds. `tau=0` is
hanger-lookahead's rule; a huge `tau` is hanger-avoid (both are tests). Stdlib only; inputs are the earlier
placeholders.
"""
import copy
import math
import random
import sys
from pathlib import Path

RESEARCH = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(RESEARCH / "hanger-avoid" / "src"))
from hanger_avoid.avoid import (CellParams, PickParams, insertion_table, hang_share, make_pile,  # noqa: E402,F401
                                pick_allowed, replace, run_once)


def sequence_yield(n, policy, pp, seed, sep=0.0, downstream=14.0, tau=0.0, window=1e9):
    """As hanger-lookahead's `sequence_look` with the lookahead rule gated by predicted overlap >= tau.
    Returns ([(seconds, ok)], current-pick redirects, lookahead redirects)."""
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
        if sep > 0 and (live or free[o] - start < window):
            probe_rng = random.Random()
            probe_rng.setstate(rng.getstate())
            probe = copy.deepcopy(pile)
            g0, t0, _ = pick_allowed(probe, {id(h) for h in probe}, policy, pp, probe_rng)
            if live:
                ok = {id(h) for h in pile if not clash(h, live)}
                if ok and ok != ids and clash(g0, live):
                    ids, red_live = ok, red_live + 1
            if probe and free[o] - start < window and len(ids) > 1 and start + t0 - free[o] >= tau:
                gn, _, _ = pick_allowed(probe, {id(h) for h in probe}, policy, pp, probe_rng)
                near = {id(h) for h in pile if id(h) in ids and math.hypot(h.x - gn.x, h.y - gn.y) >= sep}
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


def per_load(cp, policy, pp, reps, sep, tau, window=1e9, seed=0, downstream=14.0):
    """done/h and lookahead redirects for `reps` loads; load i uses the same seed for every tau."""
    table, share = insertion_table(), hang_share()
    done, reds = [], []
    for i in range(reps):
        s = seed * 100003 + i
        picks, _, rl = sequence_yield(cp.load, policy, pp, s, sep, downstream, tau, window)
        r = run_once(cp, s, table, share, picks=picks)
        done.append((r["hung"] + r["folded"]) / r["makespan"] * 3600.0)
        reds.append(rl)
    return done, reds
