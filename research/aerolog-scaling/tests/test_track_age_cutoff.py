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


tc = _mod("track_age_cutoff_test", "track_age_cutoff.py")
bl = _mod("burst_loss_for_tc_test", "burst_loss.py")


def test_lomax_scale_gives_the_mean_burst_and_closed_forms_match_direct_sums():
    for a in (2.5, 4.0):
        for B in tc.BS:
            lw = tc.Law(a, B)
            k = np.arange(1, 400001, dtype=float)
            assert abs(lw.surv(k).sum() + lw.S(400001.0) - B) < 1e-6 * B
            assert abs(lw.S(1.0) - B) < 1e-8 * B
            n = 7.0
            ii = np.arange(n, 400001, dtype=float)
            N = 400001.0
            direct = ((ii - n + 1) * lw.surv(ii)).sum()          # the rest: SS(N) + (N - n) S(N)
            assert abs(lw.SS(n) - direct - lw.SS(N) - (N - n) * lw.S(N)) < 1e-7 * lw.SS(n)
            assert lw.SS(N) + (N - n) * lw.S(N) < 0.05 * lw.SS(n)


def test_age_law_is_a_distribution_and_geometric_matches_11bj():
    for law in tc.LAWS:
        A, W = tc.ages(0.5, tc.Law(law, 10.0))
        assert abs(W.sum() - 1.0) < 1e-9
    A, W = tc.ages(0.5, tc.Law("geom", 10.0))
    ref = bl.ages(0.5, 10.0)
    assert abs(float(A @ W) - sum(a * w for a, w in ref)) < 1e-6


def test_geometric_wait_is_outage_probability_times_mean_residual_burst():
    for B in tc.BS:
        c = tc.Cell("geom", B, 0.5, 1.0)
        for k in (0, 3, 30):
            assert abs(c.wait(k) - c.p_out(k) * (B - 0.5)) < 1e-9 * max(1.0, c.wait(k))


def test_heavier_tail_waits_longer_and_cutoff_radius_meets_the_budget_at_its_worst_age():
    g = tc.Cell("geom", 10.0, 0.5, 1.0)
    p = tc.Cell(2.5, 10.0, 0.5, 1.0)
    assert p.wait(28) > g.wait(28)
    b = 6e-4
    for k in (1, 8, 58):
        r = tc.oc_radius(k, b, 1.0)
        A = tc.st.LAT + (k + 1) * tc.st.PERIOD
        assert abs(tc.ph_curve(r, np.array([A]), np.array([1.0]), 1.0) - b) < 1e-6 * b
        # every admissible age (K <= k) misses with at most b
        for kk in range(k + 1):
            assert tc.ph_curve(r, np.array([tc.st.LAT + (kk + 0.9375) * tc.st.PERIOD]), np.array([1.0]), 1.0) <= b
