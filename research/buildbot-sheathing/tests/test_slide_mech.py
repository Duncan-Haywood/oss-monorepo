"""Milestone 27: the slide as a stick-slip mechanism."""
import math

import numpy as np

from buildbot_sheathing import slide_mech as S

MM = 1e-3


def test_friction_splits_milestone_3b_slide_force():
    from buildbot_sheathing import humanoid as Hm
    fs, fk = S.friction(0.4, 0.8)
    assert math.isclose(fs, Hm.slide_force(0.4, 0.4, S.F_N))
    assert math.isclose(fk, 0.8 * fs)


def test_sim_matches_closed_form_for_a_force_source():
    fs, fk = S.friction(0.4, 0.8)
    for tau in (0.002, 0.02, 0.05):
        d, _ = S.tap(np.array([fs]), np.array([fk]), tau, 0.1 * MM)
        assert math.isclose(d[0], S.tap_closed(fs, fk, tau, 0.1 * MM, 200.0), rel_tol=5e-3)


def test_closed_form_limit_no_ramp_no_threshold():
    # dF/m acceleration for tau, then stop on F_k: x = dF tau^2 / 2m (1 + dF / F_k)
    fs, fk, tau = 100.0, 80.0, 0.05
    want = (fs - fk) * tau ** 2 / (2 * S.MASS) * (1 + (fs - fk) / fk)
    assert math.isclose(S.tap_closed(fs, fk, tau, 1e-12, 0.0), want, rel_tol=1e-3)


def test_soft_spring_behaves_as_force_source_and_stiff_one_travels_less():
    fs, fk = S.friction(0.4, 0.8)
    d0, _ = S.tap(np.array([fs]), np.array([fk]), 0.05, 0.1 * MM)
    soft, _ = S.tap(np.array([fs]), np.array([fk]), 0.05, 0.1 * MM, k=50.0)
    stiff, _ = S.tap(np.array([fs]), np.array([fk]), 0.05, 0.1 * MM, k=2e4)
    assert abs(soft[0] / d0[0] - 1) < 0.01
    assert stiff[0] < 0.9 * d0[0]


def test_loop_ends_within_half_a_tap():
    fs, fk = S.friction(0.4, 0.8)
    n = 200
    e0 = np.random.default_rng(0).uniform(-3 * MM, 3 * MM, n)
    r = S.loop(e0, np.full(n, fs), np.full(n, fk), 0.02, 0.1 * MM, cv_s=0.0)
    one = S.tap_closed(fs, fk, 0.02, 0.1 * MM, 200.0)
    assert np.all(np.abs(r["e"]) <= max(0.1 * MM, one / 2) * 1.01)
    assert r["taps"].max() < 20
