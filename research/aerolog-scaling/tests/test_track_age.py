import importlib.util
import math
import os
import sys

import numpy as np

HERE = os.path.join(os.path.dirname(__file__), "..", "experiments", "hub_airspace")
sys.path.insert(0, HERE)


def _mod(name, fname):
    spec = importlib.util.spec_from_file_location(name, os.path.join(HERE, fname))
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


ta = _mod("track_age_test", "track_age.py")


def test_binned_age_law_is_a_distribution_and_never_younger():
    """Binning keeps the total weight and only moves weight to older ages (conservative for P_h)."""
    for q in ta.QS:
        for B in ta.BURSTS:
            if not ta.bl.valid(q, B):
                continue
            A, W, K, U = ta.rows(q, B)
            assert abs(W.sum() - 1.0) < 1e-12
            exact = ta.bl.ages(q, B)
            m_exact = sum(a * w for a, w in exact)
            assert float(A @ W) >= m_exact - 0.5 / ta.NU - 1e-9      # NU = 4 midpoints against bl's 8


def _toy():
    H = 0.01 * (ta.RGRID / 50.0) ** 2                     # an increasing hold curve, s per flight
    return H, 3.0


def test_or_matches_one_radius_when_there_is_one_age():
    """With every decision at one age the optimal schedule is the one radius meeting the target."""
    H, n = _toy()
    A = np.array([2.5])
    W = np.array([1.0])
    P = ta.ph_matrix(A, 1.0)
    b = 1e-3
    h, sw = ta.or_solve(H, n, P, W, np.array([np.inf]), b, False)
    j = int(np.argmax(P[0] <= b))                         # first grid radius meeting b
    assert sw == 0.0
    assert abs(h - H[j]) < 1e-12


def test_waiting_option_never_costs_more():
    H, n = _toy()
    A, W, K, U = ta.rows(0.5, 30.0)
    P = ta.ph_matrix(A, 1.0)
    waits = np.where(K >= 1, ta.wait_of(0.5, 30.0, U), np.inf)
    b = 1e-3
    h0, _ = ta.or_solve(H, n, P, W, waits, b, False)
    h1, _ = ta.or_solve(H, n, P, W, waits, b, True)
    assert h1 <= h0 * (1 + 1e-9)


def test_mean_wait_of_a_blind_decision():
    """Geometric bursts are memoryless: (1 - U) T + (B - 1) T."""
    assert abs(ta.wait_of(0.5, 30.0, 0.25) - (0.75 + 29.0)) < 1e-12
    assert abs(ta.wait_of(0.5, None, 0.5) - (0.5 + 1.0)) < 1e-12        # independent: B = 1 / (1 - q) = 2
    assert math.isinf(ta.burst(0.5, None)) is False
