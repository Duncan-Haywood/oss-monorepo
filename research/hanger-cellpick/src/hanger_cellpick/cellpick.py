"""The hanger-cell discrete-event model with its assumed pick replaced by the hanger-pick pile model.

Stylised, stdlib only. For each dryer load, a fresh pile is made and emptied by a hanger-pick policy; each pick's
seconds and outcome (a garment whose opening was never found goes aside) are handed to hanger-cell in order.
Both sibling models are imported unchanged. Cell garment kinds (tee, shirt, ...) and pile kinds differ and are not
linked: pick time here does not depend on which cell archetype a garment is.
"""
import random
import statistics
import sys
from dataclasses import replace
from pathlib import Path

RESEARCH = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(RESEARCH / "hanger-pick" / "src"))
sys.path.insert(0, str(RESEARCH / "hanger-cell" / "src"))
from hanger_cell.model import Params as CellParams, bottleneck, hang_share, insertion_table, run_once  # noqa: E402
from hanger_pick.pile import Params as PickParams, make_pile, pick  # noqa: E402

POLICIES = ("pinch", "see", "sweep")


def pick_sequence(n, policy, pp, seed):
    """Empty a fresh pile of n garments; return [(seconds, ok)] in pick order."""
    rng = random.Random(seed)
    pile = make_pile(n, rng, pp.p_hidden)
    out = []
    while pile:
        t, info = pick(pile, policy, pp, rng)
        out.append((t, bool(info["ok"])))
    return out


def replicate(cp, policy, pp, reps=200, seed=0):
    """Mean cell metrics over `reps` loads. policy 'assumed' keeps hanger-cell's own 8 s / 0.85 pick."""
    table, share = insertion_table(), hang_share()
    runs = []
    for i in range(reps):
        s = seed * 100003 + i
        picks = None if policy == "assumed" else pick_sequence(cp.load, policy, pp, s)
        runs.append(run_once(cp, s, table, share, picks=picks))
    for r in runs:                      # set-aside garments are cleared but not handled: count only hung + folded
        r["done_per_hour"] = (r["hung"] + r["folded"]) / r["makespan"] * 3600.0
    out = {}
    for k in runs[0]:
        xs = [r[k] for r in runs]
        out[k] = statistics.fmean(xs)
    out["_runs"] = runs
    return out


def per_hour_ci(runs, boot=1000, seed=1):
    """95% percentile bootstrap interval on mean garments hung or folded per hour."""
    rng = random.Random(seed)
    xs = [r["done_per_hour"] for r in runs]
    ms = sorted(statistics.fmean(rng.choices(xs, k=len(xs))) for _ in range(boot))
    return ms[int(0.025 * boot)], ms[int(0.975 * boot)]


def dryers_served(items_per_hour, dryer_min=45.0, load=25):
    """Dryers one cell keeps up with: a dryer yields `load` garments per `dryer_min` minutes."""
    return items_per_hour / (load * 60.0 / dryer_min)


__all__ = ["CellParams", "PickParams", "replace", "bottleneck", "pick_sequence", "replicate", "per_hour_ci",
           "dryers_served", "POLICIES"]
