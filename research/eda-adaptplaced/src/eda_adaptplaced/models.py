"""Surrogates and error metrics, copied unchanged from research/eda-surrogate (original code, MIT). Targets are modelled in log space."""
import math

import numpy as np
from sklearn.ensemble import GradientBoostingRegressor
from sklearn.linear_model import LinearRegression, Ridge

FEATURES = None  # set from the dataset's feature names by `matrix`


def load(path):
    import json
    return [json.loads(l) for l in open(path) if l.strip()]


def matrix(rows):
    names = sorted(rows[0]["features"])
    X = np.array([[r["features"][n] for n in names] for r in rows], dtype=float)
    y = np.array([r["cells"] for r in rows], dtype=float)
    return X, y, names


class Model:
    """kind: 'mean' (geometric mean of the training cells), 'linear' (non-negative least squares on raw features, the classic
    word-level cost model), 'ridge' (ridge on log1p features), 'gbr' (gradient boosting on raw features)."""

    def __init__(self, kind, seed=0):
        self.kind, self.seed = kind, seed

    def fit(self, X, y):
        ly = np.log(y)
        if self.kind == "mean":
            self.c = ly.mean()
        elif self.kind == "linear":
            self.m = LinearRegression(positive=True).fit(X, y)
        elif self.kind == "ridge":
            self.mu, self.sd = np.log1p(X).mean(0), np.log1p(X).std(0) + 1e-9
            self.m = Ridge(alpha=1.0).fit((np.log1p(X) - self.mu) / self.sd, ly)
        elif self.kind == "gbr":
            self.m = GradientBoostingRegressor(n_estimators=200, max_depth=3, learning_rate=0.05, subsample=0.8,
                                               random_state=self.seed).fit(X, ly)
        else:
            raise ValueError(self.kind)
        return self

    def predict(self, X):
        """Predicted cells (always positive)."""
        if self.kind == "mean":
            return np.full(len(X), math.exp(self.c))
        if self.kind == "linear":
            return np.maximum(self.m.predict(X), 1.0)
        if self.kind == "ridge":
            return np.exp(self.m.predict((np.log1p(X) - self.mu) / self.sd))
        return np.exp(self.m.predict(X))


KINDS = ("mean", "linear", "ridge", "gbr")


def ape(pred, y):
    """Absolute percentage error per design."""
    return np.abs(pred - y) / y


def ranks(a):
    a = np.asarray(a, float)
    order = a.argsort(kind="mergesort")
    r = np.empty(len(a))
    r[order] = np.arange(len(a))
    for v in np.unique(a):  # average ranks over ties
        idx = np.where(a == v)[0]
        r[idx] = r[idx].mean()
    return r


def spearman(a, b):
    ra, rb = ranks(a), ranks(b)
    if ra.std() == 0 or rb.std() == 0:
        return float("nan")
    return float(np.corrcoef(ra, rb)[0, 1])


def kfold_indices(n, k, seed):
    perm = np.random.RandomState(seed).permutation(n)
    return [perm[i::k] for i in range(k)]


def oof_predictions(X, y, kind, k=5, seed=0):
    """Out-of-fold predictions: each design is predicted by a model that never saw it."""
    out = np.zeros(len(y))
    for te in kfold_indices(len(y), k, seed):
        tr = np.setdiff1d(np.arange(len(y)), te)
        out[te] = Model(kind, seed).fit(X[tr], y[tr]).predict(X[te])
    return out


def lofo_predictions(X, y, fam, kind, seed=0):
    """Leave-one-family-out: each design is predicted by a model trained only on the other families."""
    out = np.zeros(len(y))
    fam = np.asarray(fam)
    for f in sorted(set(fam)):
        te = np.where(fam == f)[0]
        tr = np.where(fam != f)[0]
        out[te] = Model(kind, seed).fit(X[tr], y[tr]).predict(X[te])
    return out


def evals_to_good(order, truth_obj, tol=0.02):
    """Number of designs synthesised, following `order` (indices into the pool), until one is within `tol` of the best."""
    best = truth_obj.min()
    for i, j in enumerate(order, 1):
        if truth_obj[j] <= best * (1 + tol):
            return i
    return len(order)


def random_evals_to_good(truth_obj, tol=0.02, trials=2000, seed=0):
    rs = np.random.RandomState(seed)
    n = len(truth_obj)
    return np.array([evals_to_good(rs.permutation(n), truth_obj, tol) for _ in range(trials)])
