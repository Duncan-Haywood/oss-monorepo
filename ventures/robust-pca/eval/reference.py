"""Reference split for the tests, from TensorLy's robust_pca (BSD-3-Clause), an
independent ALM implementation of the same convex problem.

For a matrix, TensorLy minimises reg_J (||D||_* + ||D^T||_*) + reg_E ||E||_1
subject to X = D + E on the observed cells, so reg_J = 0.5 and reg_E = lambda
is principal component pursuit (Candes et al. 2011). Its tolerance is absolute,
so each case is divided by its largest |value| first and scaled back after
(PCP is scale-equivariant: lambda does not change).

Run from the repository root:
  python3 platform/ci/pyenv.py numpy tensorly -- ventures/robust-pca/eval/reference.py
Writes ventures/robust-pca/eval/reference.json. Nothing here is imported by the tool.
"""
import csv
import json
import math
from pathlib import Path

import numpy as np
import tensorly
from tensorly.decomposition import robust_pca

HERE = Path(__file__).resolve().parent


def rpca(M, mask, lam):
    scale = float(np.max(np.abs(M[mask > 0])))
    X = np.where(mask > 0, M / scale, 0.0)
    D, E = robust_pca(X, mask=mask, reg_E=lam, reg_J=0.5, tol=1e-12, mu_init=1e-3,
                      mu_max=1e12, learning_rate=1.05, n_iter_max=5000, verbose=0)
    D, E = np.asarray(D) * scale, np.asarray(E) * scale
    E = np.where(mask > 0, E, 0.0)
    return D, E


def synthetic():
    rng = np.random.default_rng(20111)
    m, n, r = 60, 40, 3
    L0 = rng.standard_normal((m, r)) @ rng.standard_normal((r, n)) / math.sqrt(n)
    S0 = np.where(rng.random((m, n)) < 0.05, rng.choice([-1.0, 1.0], size=(m, n)), 0.0)
    M = L0 + S0
    mask = np.ones((m, n))
    mask[rng.random((m, n)) < 0.02] = 0
    lam = 1 / math.sqrt(max(m, n))
    D, E = rpca(M, mask, lam)
    return {"m": m, "n": n, "lambda": lam,
            "M": [round(v, 12) for v in M.ravel().tolist()],
            "observed": mask.astype(int).ravel().tolist(),
            "L": [round(v, 10) for v in D.ravel().tolist()],
            "S": [round(v, 10) for v in E.ravel().tolist()],
            "rank": int(np.sum(np.linalg.svd(D, compute_uv=False) > 1e-6))}


def aep():
    rows = list(csv.reader((HERE.parent / "data/aep-2017-day-by-hour.csv").open()))[1:]
    M = np.array([[float(v) if v else 0.0 for v in r[1:]] for r in rows])
    mask = np.array([[1.0 if v else 0.0 for v in r[1:]] for r in rows])
    m, n = M.shape
    lam = 1 / math.sqrt(max(m, n))
    D, E = rpca(M, mask, lam)
    return {"m": m, "n": n, "lambda": lam,
            "S": [round(v, 4) for v in E.ravel().tolist()],
            "filled": round(float(D[mask == 0][0]), 4),
            "singular_values": [round(v, 4) for v in np.linalg.svd(D, compute_uv=False)[:6].tolist()]}


out = {"versions": {"tensorly": tensorly.__version__, "numpy": np.__version__},
       "synthetic": synthetic(), "aep": aep()}
(HERE / "reference.json").write_text(json.dumps(out, separators=(",", ":")) + "\n")
print("wrote", HERE / "reference.json", out["versions"], "synthetic rank", out["synthetic"]["rank"])
