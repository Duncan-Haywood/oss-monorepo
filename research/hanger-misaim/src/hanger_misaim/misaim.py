"""Aiming with an error-prone opening detector on the hanger-pick pile model.

Stylised, stdlib only. The `see` policy of hanger-pick, except that when it aims at a visible opening the
detector is wrong with probability `e`: the gripper closes on the garment away from its opening (one wasted
`t_grasp`), and the robot then hunts for the opening by regrasping exactly as a blind pinch does. With
e = 0 this reproduces hanger-pick's `see` bit for bit (tested); e = 1 means every aim is wasted.
Pinch pays no look (it needs no detector), so break-even is measured against `pinch` at t_see = 0.
"""
import random
import statistics
import sys
from dataclasses import replace
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3] / "hanger-pick" / "src"))
from hanger_pick.pile import Params, _lift, _pinch_top, make_pile, pick, unload, visible  # noqa: E402,F401


def _hunt(g, pile, p, rng):
    """Regrasp hunt on a garment already held (as _pinch_top, on g instead of the top garment)."""
    t, tries, found = 0.0, 0, False
    while tries < p.max_regrasp and not found:
        tries += 1
        t += p.t_regrasp
        found = rng.random() < p.q_find
    dt, dbl = _lift(g, pile, p, rng)
    return t + dt, dict(direct=False, regrasps=tries, double=dbl, ok=found, sweeps=0)


def pick_err(pile, p, e, rng):
    g = max(pile, key=lambda h: visible(h, pile))
    if visible(g, pile) < p.theta:
        g, t, info = _pinch_top(pile, p, rng)
        info["sweeps"] = 0
        pile.remove(g)
        return t, info
    t = p.t_see + p.t_grasp
    if e > 0 and rng.random() < e:
        th, info = _hunt(g, pile, p, rng)
        info["wrong"] = True
        pile.remove(g)
        return t + th, info
    while rng.random() >= p.p_direct:
        t += p.t_grasp
    dt, dbl = _lift(g, pile, p, rng)
    pile.remove(g)
    return t + dt, dict(direct=True, regrasps=0, double=dbl, ok=True, sweeps=0)


def unload_err(n, p, e, seed):
    """Seconds per garment emptying a fresh pile (seed) with a detector of error e."""
    rng = random.Random(seed)
    pile = make_pile(n, rng, p.p_hidden)
    total = 0.0
    for _ in range(n):
        t, _info = pick_err(pile, p, e, rng)
        total += t
    return total / n


def per_pile(n, p, e, reps):
    return [unload_err(n, p, e, s) for s in range(reps)]


def blind(n, p, reps):
    q = replace(p, t_see=0.0)
    return [unload(n, "pinch", q, s)["per_item"] for s in range(reps)]


def mean_ci(xs, boots=1000, seed=7):
    rng = random.Random(seed)
    m = len(xs)
    means = sorted(statistics.fmean(rng.choices(xs, k=m)) for _ in range(boots))
    return statistics.fmean(xs), means[int(0.025 * boots)], means[int(0.975 * boots) - 1]


def breakeven_look(n, p, e, reps):
    """T*(e): look seconds per pick at which an error-e detector ties blind pinching, mean gap at t_see = 0."""
    b = blind(n, p, reps)
    a = per_pile(n, replace(p, t_see=0.0), e, reps)
    return mean_ci([x - y for x, y in zip(b, a)])


def breakeven_error(n, p, reps, lo=0.0, hi=1.0, iters=12):
    """Largest error e at which the detector, at p.t_see, is still no slower than blind pinching (mean over
    piles, bisection; the gap is monotone in e). Returns None if even e = 0 loses, 1.0 if e = 1 still wins."""
    b = statistics.fmean(blind(n, p, reps))

    def gap(e):
        return b - statistics.fmean(per_pile(n, p, e, reps))
    if gap(lo) < 0:
        return None
    if gap(hi) >= 0:
        return 1.0
    for _ in range(iters):
        mid = (lo + hi) / 2
        lo, hi = (mid, hi) if gap(mid) >= 0 else (lo, mid)
    return (lo + hi) / 2
