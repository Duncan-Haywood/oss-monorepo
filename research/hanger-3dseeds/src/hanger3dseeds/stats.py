"""Unpaired comparison of two seed groups: difference of means with a bootstrap interval and an exact permutation p-value."""
import itertools

import numpy as np


def perm_p(a, b):
    """Exact two-sided permutation p-value for the difference of means (all C(n+m, n) splits)."""
    x = np.array(list(a) + list(b), float)
    n = len(a)
    obs = abs(np.mean(a) - np.mean(b))
    hits = tot = 0
    for idx in itertools.combinations(range(len(x)), n):
        m = np.zeros(len(x), bool)
        m[list(idx)] = True
        tot += 1
        hits += abs(x[m].mean() - x[~m].mean()) >= obs - 1e-12
    return hits / tot


def boot_ci(a, b, n=4000, seed=0):
    rng = np.random.default_rng(seed)
    a, b = np.asarray(a, float), np.asarray(b, float)
    d = [rng.choice(a, len(a)).mean() - rng.choice(b, len(b)).mean() for _ in range(n)]
    return float(np.percentile(d, 2.5)), float(np.percentile(d, 97.5))


def paired_summary(a, b):
    lo, hi = boot_ci(a, b)
    return (f"n={len(a)} vs {len(b)}  mean3d={np.mean(a):.3f} sd={np.std(a, ddof=1):.3f}  mean2d={np.mean(b):.3f} sd={np.std(b, ddof=1):.3f}  "
            f"diff={np.mean(a) - np.mean(b):+.3f}  95% bootstrap CI [{lo:+.3f}, {hi:+.3f}]  permutation p={perm_p(a, b):.3f}")
