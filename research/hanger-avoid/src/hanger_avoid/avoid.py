"""Two (or more) arms on ONE pile; an arm whose chosen garment would clash with the other arm's current pick may
choose a different garment instead of waiting.

Stylised, stdlib only. hanger-sharedpile made the later arm wait whenever its garment's centre lay within `sep`
of the garment the other arm was mid-pick on. Here, with `avoid=True`, the arm first restricts its choice to
garments farther than `sep` from every active pick (the policy's own rule, applied to the allowed set; occlusion
still counts every garment, so a hidden garment stays hidden). Only if nothing is allowed does it wait, as
before. With `avoid=False` the result is identical to hanger-sharedpile (test). Clearance and spacing are assumed.
"""
import copy
import math
import random
import statistics
import sys
from pathlib import Path

RESEARCH = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(RESEARCH / "hanger-sharedpile" / "src"))
from hanger_sharedpile.shared import (CellParams, PickParams, bottleneck, dryers_served,  # noqa: E402,F401
                                      per_hour_ci, replace, shared_sequence)
from hanger_cell.model import hang_share, insertion_table, run_once  # noqa: E402
from hanger_pick.pile import _lift, _pinch_top, make_pile, sweep_top, visible  # noqa: E402


def _pinch_allowed(pile, allowed, p, rng):
    g = max(allowed, key=lambda h: h.z)
    t = p.t_see + p.t_grasp
    tries, found = 0, False
    while tries < p.max_regrasp and not found:
        tries += 1
        t += p.t_regrasp
        found = rng.random() < p.q_find
    dt, dbl = _lift(g, pile, p, rng)
    return g, t + dt, dict(direct=False, regrasps=tries, double=dbl, ok=found)


def pick_allowed(pile, allowed_ids, policy, p, rng):
    """hanger-pick's `pick`, choosing only among garments whose id() is in `allowed_ids`. Returns (garment, time,
    info); the garment is removed from `pile`. With every garment allowed it consumes `rng` exactly as `pick`."""
    def allowed():
        return [h for h in pile if id(h) in allowed_ids]

    sweeps = 0
    if policy == "pinch":
        g, t, info = _pinch_allowed(pile, allowed(), p, rng)
    else:
        while True:
            g = max(allowed(), key=lambda h: visible(h, pile))
            if visible(g, pile) >= p.theta:
                break
            if policy == "sweep" and sweeps < p.max_sweeps and sweep_top(pile, sweeps, rng):
                sweeps += 1
                continue
            g, t, info = _pinch_allowed(pile, allowed(), p, rng)
            t += sweeps * p.t_sweep
            info["sweeps"] = sweeps
            pile.remove(g)
            return g, t, info
        t = p.t_see + sweeps * p.t_sweep + p.t_grasp
        while rng.random() >= p.p_direct:
            t += p.t_grasp
        dt, dbl = _lift(g, pile, p, rng)
        info = dict(direct=True, regrasps=0, double=dbl, ok=True, sweeps=sweeps)
        t += dt
    info.setdefault("sweeps", 0)
    pile.remove(g)
    return g, t, info


def shared_sequence_avoid(n, policy, pp, seed, arms=2, sep=0.0, downstream=14.0, avoid=True):
    """As hanger-sharedpile's `shared_sequence`, with the choice to avoid. Returns ([(seconds, ok)], number of
    picks that waited, total seconds waited, number of picks redirected to a free garment)."""
    rng = random.Random(seed)
    pile = make_pile(n, rng, pp.p_hidden)
    free = [0.0] * arms
    active = [None] * arms
    out, blocked, waited, redirected = [], 0, 0.0, 0
    while pile:
        a = min(range(arms), key=lambda i: free[i])
        start = free[a]
        live = [active[b][2] for b in range(arms)
                if b != a and active[b] and active[b][0] <= start < active[b][1]]

        def clash(h, live=live):
            return sep > 0 and any(math.hypot(h.x - o.x, h.y - o.y) < sep for o in live)

        ids = {id(h) for h in pile}
        if avoid and live:
            ok_ids = {id(h) for h in pile if not clash(h)}
            if ok_ids and ok_ids != ids:
                # redirect only when the unrestricted choice would clash; probe a copy to find out
                probe_rng = random.Random()
                probe_rng.setstate(rng.getstate())
                probe_pile = copy.deepcopy(pile)
                g0, _, _ = pick_allowed(probe_pile, {id(h) for h in probe_pile}, policy, pp, probe_rng)
                if clash(g0):
                    ids = ok_ids
                    redirected += 1
        g, t, info = pick_allowed(pile, ids, policy, pp, rng)
        wait = 0.0
        for o in range(arms):
            if o != a and active[o] and active[o][0] <= start < active[o][1] \
                    and math.hypot(g.x - active[o][2].x, g.y - active[o][2].y) < sep and sep > 0:
                wait = max(wait, active[o][1] - start)
        if wait:
            blocked += 1
            waited += wait
        t += wait
        active[a] = (start, start + t, g)
        free[a] = start + t + downstream
        out.append((t, bool(info["ok"])))
    return out, blocked, waited, redirected


def replicate(cp, policy, pp, reps=200, seed=0, sep=0.0, downstream=14.0, avoid=True):
    table, share = insertion_table(), hang_share()
    runs, blk, wt, red = [], [], [], []
    for i in range(reps):
        s = seed * 100003 + i
        picks, b, w, r_ = shared_sequence_avoid(cp.load, policy, pp, s, cp.arms, sep, downstream, avoid)
        r = run_once(cp, s, table, share, picks=picks)
        r["done_per_hour"] = (r["hung"] + r["folded"]) / r["makespan"] * 3600.0
        runs.append(r)
        blk.append(b)
        wt.append(w)
        red.append(r_)
    out = {k: statistics.fmean(r[k] for r in runs) for k in runs[0]}
    out.update(_runs=runs, blocked=statistics.fmean(blk), waited=statistics.fmean(wt), redirected=statistics.fmean(red))
    return out
