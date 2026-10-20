"""Paired comparisons of hanger-pick policies and the look time at which aiming stops paying.

Stylised, stdlib only. Every policy is run on the same seeded pile (seed = pile index), so the per-pile
difference removes pile-to-pile noise; intervals are percentile bootstraps over piles.

In hanger-pick each pick pays `t_see` exactly once, whatever the policy does after looking, and the random
draws never depend on any time, so the per-garment time of `see` is linear in `t_see` with slope 1. The
blind `pinch` policy needs no opening detector, so its look is set to 0 here. The break-even detector time
T* is then the per-pick gap `pinch(t_see=0) - see(t_see=0)`: above T* a blind pinch is faster.
"""
import random
import statistics
import sys
from dataclasses import replace
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3] / "hanger-pick" / "src"))
from hanger_pick.pile import Params, unload  # noqa: E402,F401


def per_pile(n, policy, p, reps):
    """Seconds per garment on piles seed 0..reps-1."""
    return [unload(n, policy, p, s)["per_item"] for s in range(reps)]


def mean_ci(xs, boots=1000, seed=7):
    """Mean and 95% percentile bootstrap interval, as (mean, lo, hi)."""
    rng = random.Random(seed)
    m = len(xs)
    means = sorted(statistics.fmean(rng.choices(xs, k=m)) for _ in range(boots))
    return statistics.fmean(xs), means[int(0.025 * boots)], means[int(0.975 * boots) - 1]


def breakeven_look(n, p, reps):
    """T*: extra seconds per pick the opening detector may cost before blind pinching is faster.
    Returns ((T*, lo, hi), paired per-pile gaps)."""
    blind = per_pile(n, "pinch", replace(p, t_see=0.0), reps)
    aim = per_pile(n, "see", replace(p, t_see=0.0), reps)
    gaps = [b - a for b, a in zip(blind, aim)]
    return mean_ci(gaps), gaps


def sweep_minus_see(n, p, reps):
    """Paired gap see - sweep per garment as (mean, lo, hi); positive means sweeping wins."""
    a = per_pile(n, "see", p, reps)
    b = per_pile(n, "sweep", p, reps)
    return mean_ci([x - y for x, y in zip(a, b)])
