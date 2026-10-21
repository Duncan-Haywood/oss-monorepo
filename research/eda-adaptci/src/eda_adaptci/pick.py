"""Choosers of adaptation designs, scored on one fixed test set per family.

eda-adaptpick scored each chooser on the designs it had not chosen, so the test sets differed and a chooser that removes
unusual designs from its own test set could look better. Here each family is split once (seeded) into a pool and a fixed
test set; every chooser picks k designs from the pool by features only, and every chooser is scored on the same test set.
The choosers are those of eda-adaptpick, imported by copy (original code, MIT).
"""
import numpy as np

from .models import Model, ape

K_GRID = (2, 3, 5, 8)
STRATEGIES = ("random", "smallest", "spread", "extremes")
WEIGHTS = (1.0, 5.0)
TEST_FRACTION = 0.4


def size_proxy(X, names):
    return X[:, [i for i, n in enumerate(names) if n.startswith("bits_")]].sum(1)


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
    """Indices (into the rows given) of the k designs to synthesise. Features only: there is no label argument."""
    if strategy == "random":
        return [int(i) for i in rs.choice(len(Xf), size=k, replace=False)]
    order = np.argsort(size_proxy(Xf, names), kind="mergesort")
    if strategy == "smallest":
        return [int(i) for i in order[:k]]
    Z = _space(Xf)
    if strategy == "spread":
        return _farthest(Z, [int(np.argmin(((Z - Z.mean(0)) ** 2).sum(1)))], k)
    if strategy == "extremes":
        return _farthest(Z, [int(order[0]), int(order[-1])], k)
    raise ValueError(strategy)


def split(fam, held, seed, fraction=TEST_FRACTION):
    """(pool, test) row indices of the held-out family; the test set is fixed by `seed` alone."""
    idx = np.where(fam == held)[0]
    perm = np.random.RandomState(seed).permutation(len(idx))
    nt = int(round(fraction * len(idx)))
    return np.sort(idx[perm[nt:]]), np.sort(idx[perm[:nt]])


def score(X, y, fam, names, held, kind, strategy, k, w, split_seed, rs=None, seed=0):
    """Median APE on the fixed test set of the surrogate trained on the other families plus k chosen pool designs (weight w)."""
    pool, test = split(fam, held, split_seed)
    pick = pool[np.array(choose(strategy, X[pool], names, k, rs), int)]
    other = np.where(fam != held)[0]
    tr = np.concatenate([other, pick])
    wt = np.concatenate([np.ones(len(other)), np.full(len(pick), w)])
    p = Model(kind, seed).fit(X[tr], y[tr], wt).predict(X[test])
    return float(np.median(ape(p, y[test])))
