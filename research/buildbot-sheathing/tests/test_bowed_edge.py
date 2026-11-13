"""Milestone 6b: a bowed bottom edge as a curve (closed forms; seats skipped without the engines)."""
import math

import numpy as np
import pytest

from buildbot_sheathing import bowed_edge as B
from buildbot_sheathing import cycle as C
from buildbot_sheathing import ledger as L

D = math.radians


def test_profile_shapes():
    par = B.profile(p=2.0, n=49)
    tent = B.profile(p=1.0, n=49)
    assert len(par) == 49
    # middle foot s below the corner line; corners within a foot radius of it
    assert min(dz for _, dz in par) == pytest.approx(-L.STRAIGHT, rel=1e-9)
    assert abs(par[0][1]) < 2e-5 and abs(par[-1][1]) < 2e-5
    # a parabola lies below the tent's chord nowhere: |dz_parabola| >= |dz_tent| off the ends
    assert all(abs(a[1]) >= abs(b[1]) - 1e-12 for a, b in zip(par, tent))
    bump = B.profile(bump=(0.1, 1e-3), n=25)
    assert len(bump) == 26 and min(dz for _, dz in bump) == -1e-3


def test_radius_matches_finite_difference():
    pts = B.profile(p=2.0, n=1001)
    y = np.array([p[0] for p in pts])
    z = np.array([p[1] for p in pts])
    k = np.gradient(np.gradient(z, y), y)[500]
    assert 1 / k == pytest.approx(B.radius(), rel=1e-3)
    assert B.radius() == pytest.approx(117.04, abs=0.05)
    assert B.radius() > 50 * B.h0()                      # stable rocker by a wide margin


def test_stick_band_values_and_scaling():
    # 0.4 x 50 N x 1.5615 m / (21.8 x 9.81 x (117.04 - 1.221)) = 0.0722 deg
    assert math.degrees(B.stick_band(0.4, 50.0)) == pytest.approx(0.0722, abs=2e-4)
    assert B.stick_band(0.4, 10.0) == pytest.approx(B.stick_band(0.4, 50.0) / 5, rel=1e-9)
    # linear in s while R >> h0
    assert B.stick_band(0.4, 20.0, s=L.STRAIGHT / 2) == pytest.approx(B.stick_band(0.4, 20.0) / 2, rel=0.01)
    # never past the corner
    assert B.stick_band(0.5, 1e6) == pytest.approx(4 * L.STRAIGHT / L.W)


def test_zero_rock_draw_beats_three_foot_on_single_2x():
    a = C.clean_cell(framing="2x", policy="three", trials=4000, seed=3)["clean"]
    b = C.clean_cell(framing="2x", policy="three", trials=4000, seed=3, rock_draw=np.zeros(1))["clean"]
    assert b > a


engines = []
try:
    import mujoco  # noqa: F401
    engines.append("mujoco")
except ImportError:
    pass
try:
    import pydrake  # noqa: F401
    engines.append("drake")
except ImportError:
    pass


@pytest.mark.parametrize("engine", engines or [pytest.param("none", marks=pytest.mark.skip("no engine"))])
def test_smooth_bow_seats_inside_band(engine):
    from buildbot_sheathing import drake_seat as DS
    fn = L.seat if engine == "mujoco" else DS.seat
    for f in (5.0, 50.0):
        th = fn(theta0=D(1.0), mu=0.4, f_n=f, edge=B.profile(p=2.0, n=25))["theta"]
        assert abs(th) <= B.stick_band(0.4, f) + D(0.005)


@pytest.mark.parametrize("engine", engines or [pytest.param("none", marks=pytest.mark.skip("no engine"))])
def test_default_edge_unchanged(engine):
    # edge=None keeps the corner feet: a straight edge seats at a light press (milestone 3, H13)
    from buildbot_sheathing import drake_seat as DS
    fn = L.seat if engine == "mujoco" else DS.seat
    assert abs(fn(theta0=D(1.0), mu=0.4, f_n=20.0)["theta"]) < D(0.005)
