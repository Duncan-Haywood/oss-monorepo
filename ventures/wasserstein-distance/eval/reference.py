"""Reference values from POT (Python Optimal Transport) and SciPy, for engine.test.mjs.

Run from the repository root with numpy, scipy and pot installed:
    python3 ventures/wasserstein-distance/eval/reference.py
It rewrites ventures/wasserstein-distance/eval/reference.json.

What is pinned:
  * one dimension: scipy.stats.wasserstein_distance (W1, with weights),
    ot.wasserstein_1d with p=2 (W2), scipy.stats.energy_distance;
  * Sinkhorn: the entropic plan from ot.sinkhorn (log-domain, tight
    threshold) on small seeded point clouds, for two costs and two eps;
  * exact optimal transport: ot.emd2 (network simplex) on those clouds and
    on the page's example, which the tool's certified bracket must contain.
"""

import csv
import json
import pathlib

import numpy as np
import ot
import scipy
from scipy import stats

HERE = pathlib.Path(__file__).resolve().parent
DATA = HERE.parent / "data" / "central-park-july.csv"
rng = np.random.default_rng(20261114)


def r(x):
    return [float(v) for v in np.asarray(x).ravel()]


one_d = []
for k in range(6):
    n, m = int(rng.integers(5, 40)), int(rng.integers(5, 40))
    x = np.round(rng.normal(0, 1 + k, n), 3)
    y = np.round(rng.gamma(2.0, 1.5, m) - 1, 3)
    wx = np.round(rng.uniform(0.1, 2, n), 3) if k % 2 else None
    wy = np.round(rng.uniform(0.1, 2, m), 3) if k % 2 else None
    w1 = stats.wasserstein_distance(x, y, wx, wy)
    w2p = ot.wasserstein_1d(x, y, None if wx is None else wx / wx.sum(), None if wy is None else wy / wy.sum(), p=2)
    case = {"x": r(x), "y": r(y), "w1": float(w1), "w2": float(np.sqrt(w2p))}
    if wx is not None:
        case["wx"], case["wy"] = r(wx), r(wy)
    else:
        case["energy"] = float(stats.energy_distance(x, y) ** 2)
    one_d.append(case)

clouds = []
for k, (n, m) in enumerate([(30, 45), (40, 25)]):
    X = np.round(rng.normal(0, 1, (n, 2)), 4)
    Y = np.round(rng.normal(0.7, 1.3, (m, 2)), 4)
    a = np.full(n, 1 / n)
    b = np.full(m, 1 / m)
    for metric in ["euclidean", "sqeuclidean"]:
        M = ot.dist(X, Y, metric=metric)
        exact = float(ot.emd2(a, b, M, numItermax=10_000_000))
        for eps in [0.5, 0.05]:
            P = ot.sinkhorn(a, b, M, eps, method="sinkhorn_log", stopThr=1e-13, numItermax=200000)
            clouds.append({
                "X": X.tolist(), "Y": Y.tolist(), "cost": metric, "eps": eps,
                "plan": r(P), "sinkhornCost": float((P * M).sum()), "exact": exact,
            })

rows = list(csv.DictReader(DATA.open()))
A = np.array([[float(t["tmax_c"]), float(t["tmin_c"])] for t in rows if t["period"] == "1951-1980"])
B = np.array([[float(t["tmax_c"]), float(t["tmin_c"])] for t in rows if t["period"] == "1991-2020"])
a = np.full(len(A), 1 / len(A))
b = np.full(len(B), 1 / len(B))
sd = np.vstack([A, B]).std(axis=0)
example = {"columns": {}, "exact": {}}
for j, c in enumerate(["tmax_c", "tmin_c"]):
    example["columns"][c] = {
        "w1": float(stats.wasserstein_distance(A[:, j], B[:, j])),
        "w2": float(np.sqrt(ot.wasserstein_1d(A[:, j], B[:, j], p=2))),
    }
for scale in ["none", "sd"]:
    s = sd if scale == "sd" else np.ones(2)
    for metric in ["euclidean", "sqeuclidean"]:
        cost = float(ot.emd2(a, b, ot.dist(A / s, B / s, metric=metric), numItermax=10_000_000))
        example["exact"][f"{scale}-{metric}"] = cost if metric == "euclidean" else float(np.sqrt(cost))
# Energy distance (V-statistic) on the SD-scaled points, computed directly.
Z = np.vstack([A, B]) / sd
D = np.sqrt(((Z[:, None, :] - Z[None, :, :]) ** 2).sum(-1))
na = len(A)
example["energy"] = float(2 * D[:na, na:].mean() - D[:na, :na].mean() - D[na:, na:].mean())

out = {
    "versions": {"numpy": np.__version__, "scipy": scipy.__version__, "pot": ot.__version__},
    "oneD": one_d,
    "clouds": clouds,
    "example": example,
}
(HERE / "reference.json").write_text(json.dumps(out, indent=1) + "\n")
print(json.dumps({k: v for k, v in example.items()}, indent=1), out["versions"])
