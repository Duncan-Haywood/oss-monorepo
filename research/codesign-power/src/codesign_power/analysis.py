"""Pure statistics for re-scoring `codesign-headroom`'s final designs on a large scene set (no simulator needed)."""
import numpy as np


def best_design(recs, n):
    """The design a run would hand over after n evaluations: the feasible record with the highest test success among
    recs[:n] (first one on ties, as `codesign-headroom`'s curve does). None if nothing feasible was found."""
    feas = [r for r in recs[:n] if r["feasible"]]
    if not feas:
        return None
    return max(feas, key=lambda r: r["success"])


def boot_ci(v, n_boot=10000, seed=0, q=(2.5, 97.5)):
    """Percentile bootstrap interval of the mean of v (resampling runs)."""
    v = np.asarray(v, float)
    rng = np.random.default_rng(seed)
    m = v[rng.integers(0, len(v), (n_boot, len(v)))].mean(1)
    return float(v.mean()), float(np.percentile(m, q[0])), float(np.percentile(m, q[1]))


def diff_ci(a, b, n_boot=10000, seed=0, q=(2.5, 97.5)):
    """Mean(a) - mean(b) with a percentile bootstrap interval; a and b are resampled independently (different seeds
    give different designs, so the runs of two methods are not paired)."""
    a, b = np.asarray(a, float), np.asarray(b, float)
    rng = np.random.default_rng(seed)
    d = a[rng.integers(0, len(a), (n_boot, len(a)))].mean(1) - b[rng.integers(0, len(b), (n_boot, len(b)))].mean(1)
    return float(a.mean() - b.mean()), float(np.percentile(d, q[0])), float(np.percentile(d, q[1]))


def _rank(x):
    x = np.asarray(x, float)
    order = np.argsort(x, kind="mergesort")
    r = np.empty(len(x))
    r[order] = np.arange(len(x))
    for u in np.unique(x):   # average ranks over ties
        m = x == u
        r[m] = r[m].mean()
    return r


def spearman(x, y):
    rx, ry = _rank(x), _rank(y)
    if rx.std() == 0 or ry.std() == 0:
        return float("nan")
    return float(np.corrcoef(rx, ry)[0, 1])
