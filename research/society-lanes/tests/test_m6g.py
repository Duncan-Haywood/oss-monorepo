"""Tests for milestone 6g's density-cost design and arithmetic (experiments/m6g_density_cost.py)."""
import os
import sys

import pytest

np = pytest.importorskip("numpy")
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(HERE, "experiments"))
sys.path.insert(0, HERE)
import m6g_density_cost as M  # noqa: E402
import sftwin as S  # noqa: E402


def test_job_count_is_the_registered_1600_at_20_seeds():
    assert len(M.jobs()) == 80 * M.SEEDS


def test_grid_holds_6f_none_and_control_counts():
    for fam in M.NCOUNT:
        for ent, n, nk in M.operating_points(fam):
            assert ent in M.ENTRANCES and n in M.NS and nk in M.NS
    assert M.operating_points("sf")[1] == (1.6, 60, 48)


def test_fresh_seeds_disjoint_from_6f():
    import m6f_factorial as M6F
    old = {j[-1] for j in M6F.jobs()}
    assert not ({j[-1] for j in M.jobs()} & old)


def test_quadratic_fit_recovers_known_curve():
    rho = np.linspace(0.1, 2.0, 50)
    t = 6.0 + 1.5 * rho + 0.8 * rho ** 2
    c = M.fit_quad(rho, t)
    assert np.allclose(c, [6.0, 1.5, 0.8])
    assert M.slope(c, 1.0) == pytest.approx(1.5 + 1.6)
    assert M.curve_gap(c, c, 0.2, 1.5) == pytest.approx(0.0)


def test_crossings_use_the_twin_definitions():
    # two walkers crossing 8 m in 160 frames at 16 fps (10 s), alone together in the section
    s1 = [(f, 100.0, -400.0 + 5.0 * f) for f in range(161)]
    s2 = [(f, 250.0, 400.0 - 5.0 * f) for f in range(161)]
    short = [(f, 200.0, 0.0 + 1.0 * f) for f in range(300)]  # spans 3 m: not a crossing, but counted
    ws = {1: (1, s1), 2: (-1, s2), 3: (1, short)}
    out = M.crossings(ws, 16, 3.6)
    assert len(out) == 2
    for t0, tr, rho in out:
        assert t0 == 0.0 and tr == pytest.approx(10.0)
        assert rho == pytest.approx(3 / (8 * 3.6))


def test_measure_reports_transit_density():
    # one walker per direction crossing over 100 samples at 0.1 s; a third short one
    s = {1: [(f, 4.0 + 0.08 * f, 1.0) for f in range(101)],
         2: [(f, 12.0 - 0.08 * f, 2.6) for f in range(101)]}
    r = S.measure(s, {1: 1, 2: -1}, 3.6, 0.1)
    assert r["transits"] == 2
    assert r["transit"] == pytest.approx(10.0)
    assert r["transit_density"] == pytest.approx(2 / (8 * 3.6))
