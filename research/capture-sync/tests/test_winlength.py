"""Step 4b: the session-bootstrap gap is the best baseline's sum minus fn's, and its interval brackets it."""
import os
import sys

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "experiments", "baselines"))
import winlength as WL  # noqa: E402


def _counts(rates):
    """bad counts [method, sess, type] with 10 windows per (sess, type) and the given share per method."""
    nm, ns, nt = len(WL.METHODS), WL.NT.N_SESS, len(WL.TYPES)
    nn = np.full((ns, nt), 10.0)
    nb = np.zeros((nm, ns, nt))
    for k, r in enumerate(rates):
        nb[k] = r * 10
    return nb, nn


def test_gap_is_best_baseline_minus_fn():
    rates = [0.5, 0.1, 0.4, 0.3, 0.6, 0.9, 0.2]  # METHODS order: plain fn kflat kenergy kzcr wang hk
    nb, nn = _counts(rates)
    pt, (lo, hi) = WL.boot_gap(nb, nn, n_boot=200)
    # best baseline is hk at 0.2 per type, fn 0.1 per type: (0.2 - 0.1) * 10 types
    assert abs(pt - 1.0) < 1e-9
    assert abs(lo - 1.0) < 1e-9 and abs(hi - 1.0) < 1e-9  # identical sessions: no spread


def test_interval_brackets_point_when_sessions_differ():
    nb, nn = _counts([0.5, 0.1, 0.4, 0.3, 0.6, 0.9, 0.2])
    nb[WL.METHODS.index("hk"), :5] = 0.0  # hk perfect on half the sessions
    pt, (lo, hi) = WL.boot_gap(nb, nn, n_boot=500)
    assert lo < pt < hi


def test_lengths_fit_the_shortest_noise():
    # a window plus its +-1.5 s search must fit inside VacuumCleaner's 17.3 s per device
    assert max(WL.LENGTHS) + 2 * NT_SEARCH() < 17.3


def NT_SEARCH():
    return WL.NT.SEARCH
