"""hanger-cellpick with the pile's garment kinds linked to the cell's archetypes (stdlib only, stylised).

In hanger-cellpick a pick takes the same time whatever the cell thinks the garment is, and the cell draws its own kind
mix independently of the pile. Here each picked garment hands its kind to the cell: the pile kind maps to a
hanger-cell archetype (KIND_TO_ARCH, an assumption), which then sets its hang-or-fold share (hanger-fold results) and
its insertion time (hanger-insert results). Optionally one pile kind hides its opening more often than the rest.
"""
import random
import statistics
import sys
from dataclasses import replace
from pathlib import Path

RESEARCH = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(RESEARCH / "hanger-pick" / "src"))
sys.path.insert(0, str(RESEARCH / "hanger-cell" / "src"))
from hanger_cell.model import Params as CellParams, hang_share, insertion_table, run_once  # noqa: E402
from hanger_pick.pile import KINDS, Params as PickParams, make_pile, pick  # noqa: E402

# pile kind -> hanger-cell archetype. Nearest-fabric guesses: the cell has no trousers, dress or kids archetype.
KIND_TO_ARCH = {"tee": "tee", "shirt": "shirt", "trousers": "linen", "dress": "shirt", "kids": "tee", "knit": "sweater"}


def pick_sequence(n, policy, pp, seed, hidden_by_kind=None, arch_map=None):
    """Empty a fresh pile of n garments; return [(seconds, ok, cell archetype)] in pick order."""
    rng = random.Random(seed)
    pile = make_pile(n, rng, pp.p_hidden, hidden_by_kind)
    out = []
    while pile:
        t, info = pick(pile, policy, pp, rng)
        out.append((t, bool(info["ok"]), (arch_map or KIND_TO_ARCH)[info["kind"]], info["kind"]))
    return out


def replicate(cp, policy, pp, reps=200, seed=0, hidden_by_kind=None, linked=True, arch_map=None):
    """Mean cell metrics over `reps` loads. linked=False reproduces hanger-cellpick (kinds drawn by the cell)."""
    table, share = insertion_table(), hang_share()
    runs = []
    for i in range(reps):
        s = seed * 100003 + i
        seq = pick_sequence(cp.load, policy, pp, s, hidden_by_kind, arch_map)
        picks = [(t, ok, a) if linked else (t, ok) for t, ok, a, _ in seq]
        r = run_once(cp, s, table, share, picks=picks)
        r["done_per_hour"] = (r["hung"] + r["folded"]) / r["makespan"] * 3600.0
        r["aside_knit"] = sum(1 for t, ok, a, k in seq if not ok and k == "knit")
        runs.append(r)
    out = {k: statistics.fmean(r[k] for r in runs) for k in runs[0]}
    out["_runs"] = runs
    return out


__all__ = ["CellParams", "PickParams", "replace", "replicate", "pick_sequence", "KIND_TO_ARCH", "KINDS"]
