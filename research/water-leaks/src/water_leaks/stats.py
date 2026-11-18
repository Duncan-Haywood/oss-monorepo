"""Small exact tests for comparing detectors on the same leaks (step 9). Stdlib and numpy only."""
from __future__ import annotations

from math import comb

import numpy as np


def sign_test(b, c):
    """Exact two-sided McNemar (sign) test on b and c discordant pairs: P(|X - n/2| >= |b - n/2|),
    X ~ Binomial(b + c, 1/2). Returns 1.0 when there are no discordant pairs."""
    n = b + c
    if n == 0:
        return 1.0
    k = min(b, c)
    tail = sum(comb(n, i) for i in range(k + 1)) / 2 ** n
    return min(1.0, 2 * tail)


def holm(pvals):
    """Holm step-down adjusted p-values, in the input order."""
    p = np.asarray(pvals, float)
    order = np.argsort(p)
    m = len(p)
    adj = np.empty(m)
    run = 0.0
    for rank, i in enumerate(order):
        run = max(run, (m - rank) * p[i])
        adj[i] = min(1.0, run)
    return adj


def paired_bootstrap(a, b, draws=2000, seed=9):
    """Bootstrap over items of sum(a) - sum(b) for paired 0/1 vectors: (point, 2.5%, 97.5%)."""
    a, b = np.asarray(a, int), np.asarray(b, int)
    rng = np.random.default_rng(seed)
    d = np.array([(a[ix] - b[ix]).sum() for ix in (rng.integers(0, len(a), len(a)) for _ in range(draws))])
    return int((a - b).sum()), float(np.percentile(d, 2.5)), float(np.percentile(d, 97.5))
