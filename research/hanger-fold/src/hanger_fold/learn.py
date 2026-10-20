"""A synthetic laundry population, noisy robot sensing, and small learners for hang-or-fold."""
import math

import numpy as np

from .model import ARCHETYPES, make
from hanger_fit.model import SIZES  # noqa: E402 (model.py puts hanger-fit on sys.path)

NAMES = list(ARCHETYPES)
FEATURE_SETS = {
    "size": ["half_shoulder"],
    "size+mass": ["half_shoulder", "mass"],
    "size+mass+stretch": ["half_shoulder", "mass", "stretch"],
    "all + fabric class": ["half_shoulder", "mass", "stretch", "class"],
}


def sample_population(n, seed=0, spread=0.25, set_spread=0.35):
    """n fabrics: an archetype and a size, with lognormal spread on every constant."""
    rng = np.random.default_rng(seed)
    out = []
    for _ in range(n):
        a = NAMES[rng.integers(len(NAMES))]
        size = list(SIZES)[rng.integers(len(SIZES))]
        ln = lambda sd: float(np.exp(rng.normal(0.0, sd)))
        w = ln(spread)
        scale = dict(B=ln(spread), EA=ln(spread), body=w, sleeve=w, lump=w, thick=math.sqrt(w) * ln(0.1),
                     set_gain=ln(set_spread), eps_y=ln(set_spread))
        out.append(make(size, a, scale))
    return out


def sense(fabrics, sims, seed=0, mass_sd=0.05, stretch_sd=0.10, stretch_floor=0.002, size_sd=1.0):
    """What a robot can measure: shoulder width, mass, stretch when lifted (all noisy), and a class."""
    rng = np.random.default_rng(seed)
    n = len(fabrics)
    X = np.zeros((n, 4))
    for i, (f, s) in enumerate(zip(fabrics, sims)):
        X[i, 0] = f.garment.half_shoulder + rng.normal(0, size_sd)
        X[i, 1] = f.mass * (1 + rng.normal(0, mass_sd))
        X[i, 2] = max(0.0, s["shoulder_strain"] * (1 + rng.normal(0, stretch_sd)) + rng.normal(0, stretch_floor))
        X[i, 3] = NAMES.index(f.name)
    return X


class Tree:
    """Depth-limited CART on binary labels (1 = hang), Gini splits on numeric columns."""

    def __init__(self, depth=3, min_leaf=5):
        self.depth, self.min_leaf = depth, min_leaf

    def fit(self, X, y, cols=None):
        self.cols = list(range(X.shape[1])) if cols is None else cols
        self.root = self._grow(X, y, self.depth)
        return self

    @staticmethod
    def _gini(y):
        p = y.mean() if len(y) else 0.0
        return 2 * p * (1 - p)

    def _grow(self, X, y, d):
        if d == 0 or len(y) < 2 * self.min_leaf or y.min() == y.max():
            return float(y.mean() >= 0.5) if len(y) else 0.0
        best = None
        for c in self.cols:
            vals = np.unique(X[:, c])
            for t in (vals[:-1] + vals[1:]) / 2:
                m = X[:, c] <= t
                if m.sum() < self.min_leaf or (~m).sum() < self.min_leaf:
                    continue
                g = (m.sum() * self._gini(y[m]) + (~m).sum() * self._gini(y[~m])) / len(y)
                if best is None or g < best[0]:
                    best = (g, c, t)
        if best is None:
            return float(y.mean() >= 0.5)
        _, c, t = best
        m = X[:, c] <= t
        return (c, t, self._grow(X[m], y[m], d - 1), self._grow(X[~m], y[~m], d - 1))

    def predict(self, X):
        def one(x, node):
            while isinstance(node, tuple):
                c, t, l, r = node
                node = l if x[c] <= t else r
            return node
        return np.array([one(x, self.root) for x in X])

    def describe(self, names, node=None, ind=0):
        node = self.root if node is None else node
        pad = "  " * ind
        if not isinstance(node, tuple):
            return f"{pad}-> {'hang' if node else 'fold'}\n"
        c, t, l, r = node
        return (f"{pad}if {names[c]} <= {t:.4g}:\n" + self.describe(names, l, ind + 1)
                + f"{pad}else:\n" + self.describe(names, r, ind + 1))


class Logistic:
    """L2-regularised logistic regression on standardised features, by Newton steps."""

    def __init__(self, l2=1e-2):
        self.l2 = l2

    def fit(self, X, y):
        self.mu, self.sd = X.mean(0), X.std(0) + 1e-12
        Z = np.hstack([np.ones((len(X), 1)), (X - self.mu) / self.sd])
        w = np.zeros(Z.shape[1])
        R = self.l2 * np.eye(Z.shape[1]); R[0, 0] = 0
        for _ in range(50):
            p = 1 / (1 + np.exp(-np.clip(Z @ w, -30, 30)))
            H = Z.T @ (Z * (p * (1 - p))[:, None]) + R + 1e-8 * np.eye(len(w))
            step = np.linalg.solve(H, Z.T @ (p - y) + R @ w)
            w -= step
            if np.abs(step).max() < 1e-8:
                break
        self.w = w
        return self

    def predict(self, X):
        Z = np.hstack([np.ones((len(X), 1)), (X - self.mu) / self.sd])
        return (Z @ self.w > 0).astype(float)


def cross_validate(make_model, X, y, hang_cost, fold_cost, k=5, seed=0):
    """k-fold CV. Returns accuracy and mean regret (cost of the chosen action minus the better one)."""
    rng = np.random.default_rng(seed)
    idx = rng.permutation(len(y))
    pred = np.zeros(len(y))
    for f in range(k):
        te = idx[f::k]
        tr = np.setdiff1d(idx, te)
        pred[te] = make_model().fit(X[tr], y[tr]).predict(X[te])
    return score_choice(pred, y, hang_cost, fold_cost)


def score_choice(pred, y, hang_cost, fold_cost):
    chosen = np.where(pred > 0.5, hang_cost, fold_cost)
    best = np.minimum(hang_cost, fold_cost)
    return dict(acc=float((pred == y).mean()), regret=float((chosen - best).mean()),
                cost=float(chosen.mean()))
