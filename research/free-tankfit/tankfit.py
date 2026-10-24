"""Fit variance for the Cascaded Tanks twin-vs-ARX comparison (follow-up to free-tankci).

Refits the overflow twin and linear ARX 4/4 on random contiguous windows of the training
trace and scores each refit on the fixed test trace exactly as free-tanktwin does.
"""
import os, sys
import numpy as np
from scipy.optimize import least_squares

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "free-tanktwin"))
from tanktwin import twin_sim, fit_twin, fit_narx, narx_sim, rmse  # noqa: E402


def windows(n, length, k, rng):
    """k random contiguous windows [s, s+length) inside range(n), start uniform."""
    s = rng.integers(0, n - length + 1, size=k)
    return [(int(a), int(a) + length) for a in s]


def score_twin(th, ue, ye, W):
    """Keep physics, re-estimate the two initial states on the init window (as free-tanktwin)."""
    g = lambda s: twin_sim(np.r_[th[:4], s, th[6:]], ue, True)[:W] - ye[:W]
    s = least_squares(g, th[4:6], bounds=([0, 0], [30, 30])).x
    p = twin_sim(np.r_[th[:4], s, th[6:]], ue, True)
    return rmse(p[W:], ye[W:])


def score_arx(m, ue, ye, W):
    return rmse(narx_sim(m, ue, ye)[W:], ye[W:])


def summarize(x):
    x = np.asarray(x, float)
    return dict(mean=float(x.mean()), sd=float(x.std(ddof=1)), lo=float(np.percentile(x, 2.5)),
                hi=float(np.percentile(x, 97.5)))
