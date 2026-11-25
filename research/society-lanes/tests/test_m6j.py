"""Tests for milestone 6j's two-parameter fit (experiments/m6j_twofit.py, sftwin radius override)."""
import os
import sys

import pytest

np = pytest.importorskip("numpy")
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(HERE, "experiments"))
sys.path.insert(0, HERE)
import sftwin as S  # noqa: E402

M = pytest.importorskip("m6j_twofit")


def test_slope_score_zero_for_identical_curves_and_shift_invariant():
    c = np.array([5.0, 1.0, 0.5])
    assert M.slope_score(c, c, 0.4, 1.9) == 0.0
    # a level shift does not change the slope score
    assert M.slope_score(c + np.array([2.0, 0, 0]), c, 0.4, 1.9) == pytest.approx(0.0)
    # a constant slope error d gives STEP * d
    assert M.slope_score(c + np.array([0, 0.4, 0]), c, 0.4, 1.9) == pytest.approx(M.STEP * 0.4)
    assert np.isnan(M.slope_score(c, c, 1.0, 0.9))


def test_choose_takes_smallest_j_among_eligible_only():
    table = {(0.1, 0.2): dict(J=0.1, eligible=False), (0.3, 0.2): dict(J=0.5, eligible=True),
             (0.5, 0.25): dict(J=0.4, eligible=True), (0.8, 0.3): dict(J=float("nan"), eligible=True)}
    assert M.choose(table) == (0.5, 0.25)
    assert M.choose({(0.1, 0.2): dict(J=0.1, eligible=False)}) is None


def test_part_a_grid_and_seeds_match_6i():
    import m6i_lobby as I
    jobs = M.jobs_a()
    assert len(jobs) == len(M.TS) * len(M.RS) * 2 * len(M.NS) * M.SEEDS_A
    assert M.SEED_A == I.SEED_A and M.NS == I.NS and M.BASE in [(j[1], j[2]) for j in jobs]
    assert M.SEED_B not in (I.SEED_A, I.SEED_B)


def test_radius_override_only_for_cfsm():
    with pytest.raises(ValueError):
        S.simulate(4, 3.6, 16.0, 1.6, 0.1, 1, model="sf", radius=0.3, duration=1, warmup=0)


def test_default_radius_is_unchanged_run():
    pytest.importorskip("jupedsim")
    kw = dict(model="cfsm", time_gap=0.3, entry="lobby", duration=6.0, warmup=2.0)
    a = S.simulate(12, 3.6, 16.0, 1.6, 0.1, 7, **kw)
    b = S.simulate(12, 3.6, 16.0, 1.6, 0.1, 7, radius=S.CFSM_RADIUS, **kw)
    for k in ("transits", "density", "speed"):
        assert a[k] == b[k] or (np.isnan(a[k]) and np.isnan(b[k]))
