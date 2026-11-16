"""Milestone 35: the air hose as a catenary force at the tool."""
import math

import numpy as np

from buildbot_sheathing import hose as Ho


def test_slack_hose_hangs_straight_down():
    w = Ho.HOSES["rubber"]
    assert Ho.hanging_length(1.2, 0.0, w) == 1.2
    assert Ho.touchdown(1.2, 0.0, w) == 0.0
    f = Ho.force(1.2, 0.0, w, 0.3)
    assert np.allclose(f, [0.0, 0.0, -w * Ho.G * 1.2])


def test_catenary_length_matches_the_curve():
    w, h, H = Ho.HOSES["hybrid"], 0.9, 6.0
    a = H / (w * Ho.G)
    x = Ho.touchdown(h, H, w)
    assert math.isclose(a * (math.cosh(x / a) - 1.0), h, rel_tol=1e-12)       # reaches the fitting
    assert math.isclose(a * math.sinh(x / a), Ho.hanging_length(h, H, w), rel_tol=1e-12)
    # numerical arc length of the curve agrees
    xs = np.linspace(0.0, x, 20001)
    ys = a * (np.cosh(xs / a) - 1.0)
    arc = float(np.sum(np.hypot(np.diff(xs), np.diff(ys))))
    assert math.isclose(arc, Ho.hanging_length(h, H, w), rel_tol=1e-6)


def test_more_tension_lifts_more_hose():
    w = Ho.HOSES["rubber"]
    s = [Ho.hanging_length(1.0, H, w) for H in (0.0, 2.0, 5.0, 20.0)]
    assert all(b > a for a, b in zip(s, s[1:]))


def test_force_direction_and_drag_limit():
    w = Ho.HOSES["hybrid"]
    f = Ho.force(1.0, 5.0, w, math.pi / 2)
    assert abs(f[0]) < 1e-12 and math.isclose(f[1], 5.0) and f[2] < 0
    assert math.isclose(Ho.max_drag(w, 0.5, 4.0), 0.5 * w * Ho.G * 4.0)
    # listed weights: 5.1 lb and 9.21 lb per 50 ft
    assert math.isclose(Ho.HOSES["hybrid"], 0.1518, rel_tol=1e-3)
    assert math.isclose(Ho.HOSES["rubber"], 0.2741, rel_tol=1e-3)


def test_generalised_force_is_jacobian_transpose():
    jp = np.arange(12.0).reshape(3, 4)
    f = np.array([1.0, -2.0, 0.5])
    assert np.allclose(Ho.generalised(jp, f), jp.T @ f)
