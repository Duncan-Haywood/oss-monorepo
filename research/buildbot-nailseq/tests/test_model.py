import numpy as np
import pytest

from buildbot_nailseq import model as M


def trace(amp=0.0, tau=0.05, lost=0.0, n=1500):
    t = np.arange(n) * 1e-3
    dy = amp * np.exp(-t / tau) if tau else np.zeros(n)
    wall = np.where(t < lost, 0.0, 30.0)
    return {"t": t, "dy": dy, "dz": np.zeros(n), "wall": wall}


def test_sequence_is_the_62_nails_once_each():
    seq = M.sequence()
    assert len(seq) == 62
    assert len({(round(n["y"], 6), round(n["z"], 6)) for n in seq}) == 62
    assert sum(n["stud"] == 0 for n in seq) == 17 and sum(n["stud"] == 3 for n in seq) == 17
    assert sum(n["stud"] in (1, 2) for n in seq) == 14 and sum(n["stud"] is None for n in seq) == 14


def test_monte_carlo_matches_quadrature_without_residual():
    seq = M.sequence()
    for s_stud in (0.0, 1e-3):
        mc, _ = M.p_clean(seq, s_stud, 0.9e-3, np.zeros((62, 2)), trials=40000)
        assert abs(mc - M.p_clean_analytic_no_shift(seq, s_stud, 0.9e-3)) < 0.01


def test_matches_studfind_and_fasten_published_figures():
    sf = pytest.importorskip("buildbot_studfind.model")
    seq = M.sequence()
    for s_stud in (0.89e-3, 1.5e-3):
        assert abs(M.p_clean_analytic_no_shift(seq, s_stud, 0.9e-3) - sf.sheet_success_analytic(s_stud, 0.9e-3)) < 0.01


def test_wait_for_settling_is_never_earlier_than_the_move():
    tr = trace(amp=3e-3, tau=0.05)
    for leg in (0.05, 0.3, 1.0):
        tw, _, _ = M.fire_time(tr, leg, 0.5e-3)
        assert tw >= leg


def test_tighter_eps_waits_longer_and_leaves_less_error():
    tr = trace(amp=3e-3, tau=0.05)
    t1, y1, _ = M.fire_time(tr, 0.01, 2e-3)
    t2, y2, _ = M.fire_time(tr, 0.01, 0.25e-3)
    assert t2 > t1 and abs(y2) <= 0.25e-3 + 1e-9 and abs(y2) < abs(y1) + 1e-12
    # decay time of an exponential: t = tau ln(amp/eps)
    assert t2 == pytest.approx(0.05 * np.log(3e-3 / 0.25e-3), abs=3e-3)


def test_lost_wall_delays_firing_and_can_be_ignored():
    tr = trace(lost=0.08)
    assert M.fire_time(tr, 0.01, 1.0)[0] == pytest.approx(0.08, abs=2e-3)
    assert M.fire_time(tr, 0.01, 1.0, need_wall=False)[0] == pytest.approx(0.01)


def test_no_shot_costs_travel_plus_firing_only():
    seq = M.sequence()
    zero = trace(amp=0.0)
    total, res = M.sheet_time(seq, 0.5, 2.0, zero, 1e-3, t_fire=0.1)
    assert total == pytest.approx(sum(M.legs(seq, 0.5, 2.0)) + 6.2, abs=1e-6)
    assert np.abs(res).max() == 0.0


def test_residual_only_hurts_and_a_big_shift_misses_nails():
    seq = M.sequence()
    p0, m0 = M.p_clean(seq, 0.0, 0.9e-3, np.zeros((62, 2)))
    p1, m1 = M.p_clean(seq, 0.0, 0.9e-3, np.full((62, 2), 2e-3))
    assert p1 < p0 and m1 > m0
    p2, _ = M.p_clean(seq, 0.0, 0.9e-3, np.full((62, 2), 20e-3))
    assert p2 == 0.0
