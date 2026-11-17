"""Reference scores from scikit-learn's IsolationForest, for engine.test.mjs.

The two implementations use different random number generators, so a forest
of 100 trees cannot match tree for tree. What must match is the expected
score of each row: averaged over a very large forest, both converge to the
same E[h(x)] if they grow trees by the same rules. So this script fits
20,000 trees per dataset and stores each row's score, plus the AUC against
the dataset's labels and the spread of AUC over 50 seeds at the default
100 trees.

Run from the repository root:
    python3 ventures/isolation-forest/eval/reference.py
It rewrites ventures/isolation-forest/eval/reference.json.
"""

import json
import pathlib

import numpy as np
import sklearn
from sklearn.ensemble import IsolationForest
from sklearn.ensemble._iforest import _average_path_length
from sklearn.metrics import roc_auc_score

HERE = pathlib.Path(__file__).resolve().parent
DATA = HERE.parent / "data"
BIG = 20000


def median_fill(x):
    x = x.astype(float)
    for j in range(x.shape[1]):
        col = x[:, j]
        m = np.median(col[~np.isnan(col)])
        col[np.isnan(col)] = m
    return x


def load_wholesale():
    rows = (DATA / "wholesale-customers.csv").read_text().strip().splitlines()
    header = rows[0].strip().split(",")
    vals = np.array([[float(v) for v in r.strip().split(",")] for r in rows[1:]])
    keep = [header.index(c) for c in ["Fresh", "Milk", "Grocery", "Frozen", "Detergents_Paper", "Delicassen"]]
    return vals[:, keep], None


def load_ionosphere():
    rows = [r.split(",") for r in (DATA / "ionosphere.data").read_text().strip().splitlines()]
    x = np.array([[float(v) for v in r[:-1]] for r in rows])
    y = np.array([1 if r[-1].strip() == "b" else 0 for r in rows])
    return x, y


def load_breast():
    rows = [r.split(",") for r in (DATA / "breast-cancer-wisconsin.data").read_text().strip().splitlines()]
    x = np.array([[np.nan if v.strip() == "?" else float(v) for v in r[1:-1]] for r in rows])
    y = np.array([1 if r[-1].strip() == "4" else 0 for r in rows])
    return median_fill(x), y


def main():
    out = {
        "sklearn": sklearn.__version__,
        "numpy": np.__version__,
        "big_forest_trees": BIG,
        "c": {str(n): float(_average_path_length(np.array([n]))[0]) for n in [1, 2, 3, 4, 10, 100, 256, 1000]},
        "datasets": {},
    }
    for name, loader in [("wholesale", load_wholesale), ("ionosphere", load_ionosphere), ("breast", load_breast)]:
        x, y = loader()
        big = IsolationForest(n_estimators=BIG, max_samples=256, random_state=0).fit(x)
        scores = -big.score_samples(x)
        entry = {"n": int(x.shape[0]), "d": int(x.shape[1]), "scores": [round(float(s), 6) for s in scores]}
        if y is not None:
            entry["auc_big"] = float(roc_auc_score(y, scores))
            aucs = [roc_auc_score(y, -IsolationForest(n_estimators=100, max_samples=256, random_state=s).fit(x).score_samples(x)) for s in range(50)]
            entry["auc_default_mean"] = float(np.mean(aucs))
            entry["auc_default_sd"] = float(np.std(aucs, ddof=1))
        out["datasets"][name] = entry
        print(name, {k: v for k, v in entry.items() if k != "scores"})
    (HERE / "reference.json").write_text(json.dumps(out, indent=1) + "\n")


if __name__ == "__main__":
    main()
