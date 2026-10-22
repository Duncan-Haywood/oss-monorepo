"""hanger-cell with its fold station timed from a published robot instead of an assumed 25 s.

Sources for the fold station (Avigal, Berscheid, Asfour, Kroger, Goldberg, "SpeedFolding: Learning Efficient Bimanual
Folding of Garments", 2022, Table I; 15 trials per row, ABB YuMi, crumpled start). Cycle time includes smoothing and is
averaged over successful and failed folds; success is the fold success rate. The 3 and 6 folds-per-hour rows are the
"prior work" range the same paper quotes (1200 s and 600 s per fold; no success rate is given, so 1.0 is an upper bound).
"""
import sys
from dataclasses import replace
from pathlib import Path

RESEARCH = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(RESEARCH / "hanger-cell" / "src"))
from hanger_cell.model import Params, bottleneck, replicate  # noqa: E402

# label: (cycle time s, fold success)
FOLD_SOURCES = {
    "assumed (hanger-cell)": (25.0, 1.0),
    "SpeedFolding towel": (68.1, 0.87),
    "SpeedFolding fling-to-fold": (87.9, 0.93),
    "SpeedFolding t-shirt": (116.9, 0.93),
    "SpeedFolding max-value map": (167.4, 0.80),
    "prior work 6 FPH": (600.0, 1.0),
    "prior work 3 FPH": (1200.0, 1.0),
}
DRYER_PER_HOUR = 25 / 0.75      # 25 garments per 45 min cycle (hanger-cell's assumption)


def run(label, arms, tables, policy="learned", reps=200):
    t, p_ok = FOLD_SOURCES[label]
    r = replicate(replace(Params(), arms=arms, fold_tables=tables, t_fold=t, policy=policy), reps)
    good = r["per_hour"] * (r["hung"] + p_ok * r["folded"]) / Params().load
    return dict(per_hour=r["per_hour"], good=good, dryers=good / DRYER_PER_HOUR, u_fold=r["u_fold"],
                u_arms=r["u_arms"], bottleneck=bottleneck(r), folded=r["folded"], hung=r["hung"])


def tables_for(label, arms, target_dryers, max_tables=40, reps=200):
    """Fewest fold tables whose cell serves `target_dryers`, or None."""
    for k in range(1, max_tables + 1):
        if run(label, arms, k, reps=reps)["dryers"] >= target_dryers:
            return k
    return None
