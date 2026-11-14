"""Milestone 83's job-level forfeiture theory (experiments/job_level_forfeit/theory.py) against brute force."""
import importlib.util
import itertools
import os

import pytest

_spec = importlib.util.spec_from_file_location(
    "jlf_theory", os.path.join(os.path.dirname(__file__), "..", "experiments", "job_level_forfeit", "theory.py"))
TH = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(TH)


def _enumerate(N, k, m, d):
    """Catch probability by listing every k-subset: stalled segments are 0..m-1."""
    tot, miss = 0, 0.0
    for opened in itertools.combinations(range(N), k):
        x = sum(1 for j in opened if j < m)
        tot += 1
        miss += (1 - d) ** x
    return 1 - miss / tot


@pytest.mark.parametrize("N,k", [(6, 1), (6, 3), (7, 2), (8, 5)])
def test_p_srs_matches_enumeration(N, k):
    for m in range(N + 1):
        for d in (1.0, 0.4):
            assert TH.p_srs(N, k, m, d) == pytest.approx(_enumerate(N, k, m, d), abs=1e-12)


def test_p_srs_concave_small_grid():
    pts, worst = TH.concavity_check(Nmax=25, ds=(0.1, 0.5, 1.0))
    assert pts > 0 and worst <= 1e-12


def test_full_stall_caught_surely_at_d1():
    assert TH.p_srs(75, 5, 75, 1.0) == pytest.approx(1.0)
    assert TH.p_srs(75, 5, 71, 1.0) == pytest.approx(1.0)  # 4 honest segments cannot absorb 5 openings
    assert TH.p_srs(75, 5, 1, 1.0) == pytest.approx(5 / 75)


def test_best_response_is_all_or_nothing():
    N, k, d = 40, 4, 0.3
    th = TH.threshold_srs(N, k, d)
    assert TH.best_response(N, k, d, 0.99 * th)[0] == N
    assert TH.best_response(N, k, d, 1.01 * th)[0] == 0


def test_job_level_escrow_never_above_additive():
    for k in (1, 2, 5, 10):
        for d in (0.1, 0.5, 1.0):
            assert TH.threshold_srs(75, k, d) <= TH.escrow_additive(75, k, d) + 1e-9
    assert TH.threshold_srs(75, 1, 0.3) == pytest.approx(TH.escrow_additive(75, 1, 0.3))


def test_poisson_needs_more_than_srs():
    for k in (1, 5):
        for d in (0.2, 1.0):
            assert TH.threshold_poisson(75, k, d) >= TH.threshold_srs(75, k, d) - 1e-9
