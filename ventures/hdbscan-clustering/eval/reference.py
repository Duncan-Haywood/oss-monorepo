"""Reference clusterings from scikit-learn's HDBSCAN and the hdbscan package, for engine.test.mjs.

HDBSCAN is deterministic up to one thing: the order in which spanning-tree
edges of equal weight are merged. Mutual reachability makes such ties common
(an edge weighs max(core(a), core(b), d(a, b)), so every edge out of a sparse
row weighs that row's core distance), and scikit-learn sorts the edges with
numpy's default, unstable argsort. The engine sorts stably. So the script
runs scikit-learn twice:

- "labels"/"probabilities": scikit-learn's HDBSCAN with one change, its
  `_process_mst` sorting with kind="stable". Everything else (k-d tree core
  distances, Prim's spanning tree, condensing, stability, selection,
  labelling) is scikit-learn's own code, and the engine must match it row
  for row.
- "publicLabels": the unmodified public estimator, to measure how much the
  tie order alone moves the answer (adjusted Rand index in the tests).

GLOSH outlier scores (which scikit-learn does not expose) come from the
hdbscan package's `outlier_scores` applied to the patched scikit-learn
condensed tree, converted to that package's field names.

Features are standardised with StandardScaler (population SD), as the
engine's default scale="standard" does.

Run from the repository root (needs scikit-learn, hdbscan, numpy):
    python3 ventures/hdbscan-clustering/eval/reference.py
It rewrites eval/blobs.csv, eval/moons.csv and eval/reference.json.
"""

import csv
import json
import pathlib
import warnings

import numpy as np
import sklearn
import sklearn.cluster._hdbscan.hdbscan as skh
from hdbscan._hdbscan_tree import outlier_scores
from sklearn.cluster import HDBSCAN
from sklearn.cluster._hdbscan._linkage import make_single_linkage
from sklearn.cluster._hdbscan._tree import _condense_tree
from sklearn.datasets import make_moons
from sklearn.preprocessing import StandardScaler

warnings.filterwarnings("ignore")
HERE = pathlib.Path(__file__).resolve().parent
DATA = HERE.parent / "data"
PENGUIN_COLS = ["bill_length_mm", "bill_depth_mm", "flipper_length_mm", "body_mass_g"]


def write_csv(path, header, rows):
    with open(path, "w", newline="") as f:
        w = csv.writer(f, lineterminator="\n")
        w.writerow(header)
        for r in rows:
            w.writerow([f"{v:.6f}" if isinstance(v, float) else v for v in r])


def make_blobs_table():
    # Three blobs of different density plus uniform background noise.
    rng = np.random.default_rng(20261116)
    a = rng.normal([0, 0], 1.0, (150, 2))
    b = rng.normal([7, 6], 0.5, (80, 2))
    c = rng.normal([-5, 7], 0.25, (40, 2))
    noise = rng.uniform([-8, -4], [10, 10], (40, 2))
    x = np.vstack([a, b, c, noise])
    truth = [0] * 150 + [1] * 80 + [2] * 40 + [-1] * 40
    write_csv(HERE / "blobs.csv", ["x", "y", "truth"], [[float(p[0]), float(p[1]), t] for p, t in zip(x, truth)])


def make_moons_table():
    x, y = make_moons(n_samples=300, noise=0.06, random_state=7)
    rng = np.random.default_rng(7)
    z = rng.normal(0, 0.05, (300, 1))
    write_csv(HERE / "moons.csv", ["u", "v", "w", "truth"], [[float(p[0]), float(p[1]), float(q[0]), int(t)] for p, q, t in zip(x, z, y)])


UNSTABLE = skh._process_mst


def stable_process_mst(mst):
    return make_single_linkage(mst[np.argsort(mst["distance"], kind="stable")])


def glosh(single_linkage_tree, min_cluster_size):
    ct = _condense_tree(single_linkage_tree, min_cluster_size)
    tree = np.empty(len(ct), dtype=[("parent", np.intp), ("child", np.intp), ("lambda_val", float), ("child_size", np.intp)])
    tree["parent"], tree["child"], tree["lambda_val"], tree["child_size"] = ct["parent"], ct["child"], ct["value"], ct["cluster_size"]
    return outlier_scores(tree)


def load(path, cols):
    rows = list(csv.DictReader(open(path)))
    rows = [r for r in rows if all(r[c] not in ("", "NA") for c in cols)]
    return np.array([[float(r[c]) for c in cols] for r in rows])


GRID = [
    {"minClusterSize": 5, "minSamples": None, "method": "eom"},
    {"minClusterSize": 5, "minSamples": None, "method": "leaf"},
    {"minClusterSize": 10, "minSamples": 3, "method": "eom"},
    {"minClusterSize": 15, "minSamples": 5, "method": "leaf"},
    {"minClusterSize": 15, "minSamples": None, "method": "eom"},
    {"minClusterSize": 30, "minSamples": 10, "method": "eom"},
]


def main():
    make_blobs_table()
    make_moons_table()
    sets = {
        "penguins": (DATA / "penguins.csv", PENGUIN_COLS),
        "blobs": (HERE / "blobs.csv", ["x", "y"]),
        "moons": (HERE / "moons.csv", ["u", "v", "w"]),
    }
    out = {"sklearn": sklearn.__version__, "hdbscan": "0.8.44", "numpy": np.__version__, "cases": []}
    for name, (path, cols) in sets.items():
        z = StandardScaler().fit_transform(load(path, cols))
        for g in GRID:
            ms = g["minSamples"] or g["minClusterSize"]
            kw = dict(min_cluster_size=g["minClusterSize"], min_samples=ms, cluster_selection_method=g["method"], copy=True)
            skh._process_mst = UNSTABLE
            public = HDBSCAN(**kw).fit(z)
            skh._process_mst = stable_process_mst
            sk = HDBSCAN(**kw).fit(z)
            skh._process_mst = UNSTABLE
            out["cases"].append({
                "dataset": name,
                "columns": cols,
                **g,
                "labels": sk.labels_.tolist(),
                "probabilities": [round(float(p), 10) for p in sk.probabilities_],
                "outlierScores": [round(float(p), 10) for p in glosh(sk._single_linkage_tree_, g["minClusterSize"])],
                "publicLabels": public.labels_.tolist(),
            })
            moved = int((public.labels_ != sk.labels_).sum())
            print(name, g, "clusters", int(sk.labels_.max()) + 1, "noise", int((sk.labels_ < 0).sum()), f"tie order moves {moved} labels" if moved else "")
    (HERE / "reference.json").write_text(json.dumps(out, separators=(",", ":")) + "\n")


if __name__ == "__main__":
    main()
