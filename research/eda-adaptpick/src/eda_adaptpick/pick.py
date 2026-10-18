"""Which k designs of a new family to synthesise, and how much to trust them, when adapting a cell-count surrogate.

Selection sees only the features of the new family (never its cells: those are what the synthesis buys), so every
strategy is usable before any synthesis. Strategies:
  random    uniform draw (the baseline of eda-adapt)
  smallest  the k designs with the fewest estimated cells (cheapest to synthesise)
  spread    greedy farthest-point (k-centre) in standardised log1p feature space, started from the point nearest the centroid
  extremes  the smallest and the largest design by estimated cells, then farthest-point for the rest
"cells" estimate for ordering is the sum of the bits_* features, a label-free size proxy.
"""
import numpy as np

from .models import Model, ape, spearman

K_GRID = (2, 3, 5, 8, 12)
STRATEGIES = ("random", "smallest", "spread", "extremes")
WEIGHTS = (1.0, 5.0, 20.0)


def size_proxy(X, names):
    cols = [i for i, n in enumerate(names) if n.startswith("bits_")]
    return X[:, cols].sum(1)


def _space(X):
    Z = np.log1p(X)
    sd = Z.std(0)
    keep = sd > 1e-9
    return (Z[:, keep] - Z[:, keep].mean(0)) / sd[keep]


def _farthest(Z, chosen, k):
    chosen = list(chosen)
    d = np.min(((Z[:, None, :] - Z[chosen][None]) ** 2).sum(2), axis=1)
    while len(chosen) < k:
        j = int(np.argmax(d))
        chosen.append(j)
        d = np.minimum(d, ((Z - Z[j]) ** 2).sum(1))
    return chosen


def choose(strategy, Xf, names, k, rs=None):
    """Indices (into the family's rows) of the k designs to synthesise."""
    n = len(Xf)
    if strategy == "random":
        return list(rs.choice(n, size=k, replace=False))
    size = size_proxy(Xf, names)
    order = np.argsort(size, kind="mergesort")
    if strategy == "smallest":
        return [int(i) for i in order[:k]]
    Z = _space(Xf)
    if strategy == "spread":
        first = int(np.argmin(((Z - Z.mean(0)) ** 2).sum(1)))
        return _farthest(Z, [first], k)
    if strategy == "extremes":
        return _farthest(Z, [int(order[0]), int(order[-1])], k)
    raise ValueError(strategy)


def score(X, y, fam, names, held, kind, strategy, k, w, rs=None, seed=0):
    """(median APE, Spearman) of the pooled surrogate on the held-out designs not chosen; new-family points weigh `w`."""
    te_all = np.where(fam == held)[0]
    other = np.where(fam != held)[0]
    pick = te_all[np.array(choose(strategy, X[te_all], names, k, rs), int)]
    rest = np.setdiff1d(te_all, pick)
    tr = np.concatenate([other, pick])
    wt = np.concatenate([np.ones(len(other)), np.full(len(pick), w)])
    p = Model(kind, seed).fit(X[tr], y[tr], wt).predict(X[rest])
    return float(np.median(ape(p, y[rest]))), spearman(p, y[rest])
