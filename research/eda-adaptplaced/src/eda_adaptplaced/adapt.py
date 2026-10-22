"""Few-shot adaptation of a cell-count surrogate to a design family it has not seen.

For a held-out family F and a budget k of synthesised designs from F, compare three surrogates on the rest of F:
  zero    trained on the other families only (k is ignored)
  scratch trained on the k designs from F only (needs k >= 2)
  pooled  trained on the other families plus the k designs from F
"""
import numpy as np

from .models import Model, ape, spearman

K_GRID = (0, 1, 2, 3, 5, 8, 12, 16)


def one_draw(X, y, fam, held, kind, k, rs, seed=0):
    """Returns {method: (median APE, Spearman)} on the held-out designs not drawn into the training set."""
    te_all = np.where(fam == held)[0]
    other = np.where(fam != held)[0]
    pick = rs.choice(te_all, size=k, replace=False) if k else np.array([], int)
    rest = np.setdiff1d(te_all, pick)
    res = {}
    for name, tr in (("zero", other), ("scratch", pick), ("pooled", np.concatenate([other, pick]))):
        if len(tr) == 0 or (name == "scratch" and k < 2):
            continue
        p = Model(kind, seed).fit(X[tr], y[tr]).predict(X[rest])
        res[name] = (float(np.median(ape(p, y[rest]))), spearman(p, y[rest]))
    return res


def curve(X, y, fam, held, kind, draws, seed=0):
    """For each k in K_GRID: per-method list of (median APE, Spearman) over `draws` random choices of the k designs."""
    out = {}
    for k in K_GRID:
        rs = np.random.RandomState(1000 * seed + k)
        acc = {}
        for d in range(draws if k else 1):  # k=0 has nothing random in it
            for m, v in one_draw(X, y, fam, held, kind, k, rs, seed + d).items():
                acc.setdefault(m, []).append(v)
        out[k] = {m: np.array(v) for m, v in acc.items()}
    return out


def break_even(cv, method="pooled", tol=0.20):
    """Smallest k whose median-over-draws median APE is at most `tol`, or None."""
    for k in K_GRID:
        if method in cv[k] and np.median(cv[k][method][:, 0]) <= tol:
            return k
    return None
