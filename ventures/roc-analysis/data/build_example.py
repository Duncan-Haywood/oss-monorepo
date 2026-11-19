"""Build data/wdbc-markers.csv from the UCI Breast Cancer Wisconsin (Diagnostic) zip.

    python3 -I data/build_example.py /path/to/breast+cancer+wisconsin+diagnostic.zip

Needs numpy (2.5.3 was used) for the cross-validated logistic regression;
everything else is the standard library. See data/SOURCE.md.
"""
import csv
import hashlib
import io
import sys
import zipfile
from pathlib import Path

import numpy as np

# wdbc.data: id, diagnosis, then 10 features x (mean, SE, worst).
FEATURES = ["radius", "texture", "perimeter", "area", "smoothness", "compactness",
            "concavity", "concave_points", "symmetry", "fractal_dimension"]
NAMES = ["id", "diagnosis"] + [f"{k}_{f}" for k in ("mean", "se", "worst") for f in FEATURES]
KEEP = ["worst_concave_points", "worst_perimeter", "mean_texture", "mean_smoothness"]
MODEL = ["worst_concave_points", "worst_perimeter", "mean_texture"]
FOLDS = 10


def logistic(X, y, iters=50):
    """Unpenalised logistic regression by Newton-Raphson; X includes the intercept column."""
    b = np.zeros(X.shape[1])
    for _ in range(iters):
        p = 1 / (1 + np.exp(-X @ b))
        g = X.T @ (y - p)
        H = X.T @ (X * (p * (1 - p))[:, None])
        step = np.linalg.solve(H, g)
        b += step
        if np.max(np.abs(step)) < 1e-12:
            break
    return b


def main(zip_path):
    raw = Path(zip_path).read_bytes()
    print("zip sha256", hashlib.sha256(raw).hexdigest())
    with zipfile.ZipFile(io.BytesIO(raw)) as z:
        text = z.read("wdbc.data").decode("ascii")
    rows = [dict(zip(NAMES, r)) for r in csv.reader(io.StringIO(text)) if r]
    assert len(rows) == 569, len(rows)
    y = np.array([1.0 if r["diagnosis"] == "M" else 0.0 for r in rows])
    X = np.array([[float(r[c]) for c in MODEL] for r in rows])
    # Out-of-fold probabilities: fold = row position mod 10, standardised on the
    # training folds only, so no row's probability saw its own outcome.
    prob = np.empty(len(rows))
    for k in range(FOLDS):
        test = np.arange(len(rows)) % FOLDS == k
        mu, sd = X[~test].mean(0), X[~test].std(0)
        Z = lambda A: np.column_stack([np.ones(len(A)), (A - mu) / sd])
        b = logistic(Z(X[~test]), y[~test])
        prob[test] = 1 / (1 + np.exp(-Z(X[test]) @ b))
    out = io.StringIO()
    w = csv.writer(out, lineterminator="\n")
    w.writerow(["id", "diagnosis"] + KEEP + ["cv_probability"])
    for r, p in zip(rows, prob):
        w.writerow([r["id"], "malignant" if r["diagnosis"] == "M" else "benign"] + [r[c] for c in KEEP] + [f"{p:.6f}"])
    dest = Path(__file__).with_name("wdbc-markers.csv")
    dest.write_text(out.getvalue())
    print("wrote", dest, "sha256", hashlib.sha256(out.getvalue().encode()).hexdigest())
    print("malignant", int(y.sum()), "benign", int(len(y) - y.sum()))


if __name__ == "__main__":
    main(sys.argv[1])
