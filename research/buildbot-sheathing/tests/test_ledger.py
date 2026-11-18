"""Milestone 3 (ledger seating): closed forms and MuJoCo checks."""
import math

import numpy as np
import pytest

from buildbot_sheathing import ledger as L
from buildbot_sheathing import tack as K

D = math.radians


def test_corner_angle_matches_geometry():
    # build a parallelogram with a known shear and check the diagonal difference inverts to it
    delta = 1e-3
    w, h = L.W, L.H
    d1 = math.sqrt(w * w + h * h + 2 * w * h * math.sin(delta))
    d2 = math.sqrt(w * w + h * h - 2 * w * h * math.sin(delta))
    assert L.corner_angle_limit(d1 - d2) == pytest.approx(delta, rel=1e-3)
    # PS 2: 1/64 in per foot of an 8 ft edge -> 1/8 in -> about 0.083 deg
    assert L.SQUARE_DIAG == pytest.approx(0.125 * L.IN)
    assert math.degrees(L.corner_angle_limit()) == pytest.approx(0.0834, abs=5e-4)


def test_r_bar_corners():
    w, h = L.W, L.H
    assert L.r_bar("corners") == pytest.approx((w + h + math.hypot(w, h)) / 4)


def test_held_residual_closed_form():
    assert L.held_residual(D(1), None, 0.4, 50) == 0.0
    assert L.held_residual(D(1), None, 0.4, 1000) == D(1)
    free = L.GRAVITY_MOMENT - 0.4 * 5 * L.r_bar()
    assert L.held_residual(D(1), 3000.0, 0.4, 5) == 0.0          # gravity beats a soft wrist
    assert L.held_residual(D(1), 30000.0, 0.4, 5) == pytest.approx(D(1) - free / 30000.0)


def test_panel_and_ledger_draws_bounded():
    rng = np.random.default_rng(0)
    p = L.panel_tilt(rng, 100000)
    assert np.abs(p).max() <= L.corner_angle_limit() + 2 * L.STRAIGHT / L.W + 1e-12
    assert np.mean(p == 0) == 0  # squareness is continuous
    z = L.ledger_tilt(rng, 100000, s_corner=0.0)
    assert np.abs(z).max() <= L.LASER_SLOPE
    assert np.std(L.ledger_tilt(rng, 200000, s_corner=1e-3, laser=0.0)) == pytest.approx(
        math.sqrt(2) * 1e-3 / L.W, rel=0.02)


def test_theta_draw_hook_matches_gaussian_default():
    # a theta_draw returning the same Gaussian gives the same clean-sheet rate as s_theta
    s = D(0.02)
    a = K.simulate(trials=4000, seed=1, s_theta=s)["clean"]
    b = K.simulate(trials=4000, seed=1, theta_draw=lambda rng, n: rng.normal(0, s, n))["clean"]
    assert abs(a - b) < 0.03


mujoco = pytest.importorskip("mujoco")


def test_released_seat_squares_the_sheet():
    r = L.seat(theta0=D(1.0), mu=0.4, f_n=25.0)
    assert abs(r["theta"]) < D(0.005)


def test_hard_press_freezes_the_hang():
    r = L.seat(theta0=D(1.0), mu=0.4, f_n=2 * L.press_threshold(0.4))
    assert r["theta"] > D(0.9)


def test_held_wrist_matches_closed_form():
    k = 3000.0
    r = L.seat(theta0=D(2.0), mu=0.4, f_n=5.0, k_hold=k)
    assert r["theta"] == pytest.approx(L.held_residual(D(2.0), k, 0.4, 5.0), abs=D(0.01))


def test_tilted_ledger_is_followed():
    dz = 2e-3
    r = L.seat(theta0=D(0.5), mu=0.4, f_n=25.0, ledger_dz=dz)
    assert abs(r["theta"]) < D(0.005)   # theta is reported relative to the ledger
