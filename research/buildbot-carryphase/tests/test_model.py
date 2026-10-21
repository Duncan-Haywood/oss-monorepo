import math
import sys
from pathlib import Path

import numpy as np
import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path[:0] = [str(ROOT / "buildbot-payload" / "src"), str(Path(__file__).resolve().parents[1] / "src")]
from buildbot_payload import fetch  # noqa: E402
from buildbot_carryphase import model as C, rate  # noqa: E402

needs_robot = pytest.mark.skipif(not fetch.available("g1"), reason="needs the Menagerie clone (git + network)")


def test_lipm_orbit_runs_minus_to_plus_half_step():
    L, T, zc = 0.4, 0.6, 0.66
    t = np.linspace(0, T, 5)
    x = C.lipm_x(L, T, zc, t)
    assert x[0] == pytest.approx(-L / 2) and x[-1] == pytest.approx(L / 2, rel=1e-9)
    assert np.allclose(x + x[::-1], 0.0, atol=1e-9)             # antisymmetric about the stance foot


def test_lipm_obeys_its_own_equation_of_motion():
    L, T, zc = 0.4, 0.6, 0.66
    h = 1e-4
    t = np.array([0.1, 0.3, 0.5])
    x = C.lipm_x(L, T, zc, t)
    acc = (C.lipm_x(L, T, zc, t + h) - 2 * x + C.lipm_x(L, T, zc, t - h)) / h ** 2
    assert np.allclose(acc, C.G / zc * x, rtol=1e-4)


def test_min_jerk_endpoints():
    assert C.min_jerk(0.0) == 0.0 and C.min_jerk(1.0) == pytest.approx(1.0) and C.min_jerk(0.5) == pytest.approx(0.5)


def test_human_rate_is_trip_arithmetic():
    # 20 m each way at 1.2 m/s plus 12 s handling: 12 + 16.67 + 16.67 s = 45.3 s per trip
    assert rate.pieces_per_hour(20, 1.2, 1.2, 12, 1) == pytest.approx(3600 / (12 + 40 / 1.2))
    assert rate.pieces_per_hour(20, 1.2, 1.2, 12, 3) == pytest.approx(3 * rate.pieces_per_hour(20, 1.2, 1.2, 12, 1))


@pytest.fixture(scope="module")
def g1():
    from buildbot_payload import model as P
    r = P.load("g1")
    return C.Setup(r, P.standing(r))


@needs_robot
def test_slow_step_carries_total_weight_and_keeps_pressure_centre_under_foot(g1):
    s, _ = C.score(g1, 0.05, 4.0, 0.0)
    M = g1.M
    assert s.fz_min == pytest.approx(M * C.G, rel=0.06)      # weight of the whole robot on one foot
    assert s.ok and s.mu < 0.05


@needs_robot
def test_load_adds_its_weight_to_the_foot_force(g1):
    s0, _ = C.score(g1, 0.05, 4.0, 0.0)
    s2, _ = C.score(g1, 0.05, 4.0, 2.0)
    assert s2.fz_min - s0.fz_min == pytest.approx(2.0 * C.G, rel=0.15)


@needs_robot
def test_slope_foot_force_is_weight_cos_and_friction_is_tan(g1):
    th = 7.13
    s, _ = C.score(g1, 0.05, 4.0, 0.0, slope_deg=th)
    assert s.fz_min == pytest.approx(g1.M * C.G * math.cos(math.radians(th)), rel=0.06)
    assert s.mu == pytest.approx(math.tan(math.radians(th)), rel=0.25)


@needs_robot
def test_fast_big_step_fails_where_slow_small_step_passes(g1):
    ok, _ = C.score(g1, 0.1, 1.5, 0.0)
    bad, _ = C.score(g1, 0.4, 0.4, 0.0)
    assert ok.ok and not bad.ok
    assert bad.ratio > ok.ratio


@needs_robot
def test_heavier_load_raises_the_peak_torque(g1):
    a, _ = C.score(g1, 0.2, 1.0, 0.0)
    b, _ = C.score(g1, 0.2, 1.0, 4.0)
    assert b.ratio > a.ratio
