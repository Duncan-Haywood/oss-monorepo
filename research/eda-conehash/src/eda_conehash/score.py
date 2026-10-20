"""Score fan-in cone features as predictors of 'Yosys proves this survivor equivalent'. Pure stdlib.

Reuses eda-conefeat's scoring (AUC, best one-split rule, leave-one-line-out) so the numbers are comparable with its
59.3% majority baseline and eda-equivpredict's 92.6% line rule; only the feature table differs."""
import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "..", "eda-conefeat", "src"))
from eda_conefeat.score import auc, best_split, loo_line, majority  # noqa: E402,F401

FEATS = os.path.join(os.path.dirname(__file__), "..", "..", "experiments", "features.jsonl")
NAMES = ("n_changed", "cone_gates", "cone_depth", "cone_leaves", "fwd_sinks", "reaches_out")


def load(path=FEATS):
    rows = [json.loads(l) for l in open(path) if l.strip()]
    for r in rows:
        r["line"] = int(r["id"].split("@")[1].split(":")[0])
        r["eq"] = r["formal"] == "equivalent"
    return rows
