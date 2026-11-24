"""Milestone 3zg: the port of OpenCV's undistortPoints loop, and the undamped map's slope."""
import importlib.util
import os
import sys

import pytest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "experiments", "m3zg_loop"))
from loop import COUNT, EPS, DEFAULT, undistort, radial, true_radius, spectral_radius  # noqa: E402

# a Duckiebot-like wide lens (milestone 3zf's a313) and a mild one
WIDE = ([[335.88, 0, 330.67], [0, 334.91, 225.95], [0, 0, 1]], [-0.2983, 0.0733, 0.00051, -0.00144, 0.0])
MILD = ([[458.65, 0, 367.22], [0, 457.30, 248.38], [0, 0, 1]], [-0.2834, 0.0740, 0.00019, 1.76e-05, 0.0])
CORNERS = [(0, 0), (639, 0), (0, 479), (639, 479), (320, 240), (100, 400)]


@pytest.mark.parametrize("K,D", [WIDE, MILD])
@pytest.mark.parametrize("crit", [None, (COUNT, 20, 0.0), (COUNT | EPS, 50, 1e-12), (EPS, 0, 1e-6)])
def test_port_matches_opencv(K, D, crit):
    np = pytest.importorskip("numpy")
    cv2 = pytest.importorskip("cv2")
    pts = np.array(CORNERS, np.float64).reshape(-1, 1, 2)
    Km, Dm = np.array(K, np.float64), np.array(D, np.float64)
    ocv = (cv2.undistortPoints(pts, Km, Dm) if crit is None
           else cv2.undistortPoints(pts, Km, Dm, criteria=crit)).reshape(-1, 2)
    for (u, v), (ox, oy) in zip(CORNERS, ocv):
        x, y, _ = undistort(u, v, K, D, DEFAULT if crit is None else crit)
        assert abs(x - ox) < 1e-9 and abs(y - oy) < 1e-9


def test_damping_only_acts_with_eps():
    K, D = WIDE
    for u, v in CORNERS:
        a = undistort(u, v, K, D, (COUNT, 30, 0.0))
        b = undistort(u, v, K, D, (COUNT | EPS, 30, 0.0), damping=False)
        assert a[:2] == b[:2]
        assert a[2]["rejected"] == 0


def test_radial_slope_and_spectral_radius_agree_without_tangential_terms():
    k1, k2 = -0.3, 0.07
    D = [k1, k2, 0.0, 0.0, 0.0]
    for rd in (0.3, 0.8, 1.1):
        r = true_radius(rd, k1, k2, 0.0)
        assert abs(radial(r, k1, k2, 0.0)[0] - rd) < 1e-12
        lam = abs(radial(r, k1, k2, 0.0)[1])
        # the point on the x axis at radius r; distorted coordinate rd
        assert abs(spectral_radius(r, 0.0, rd, 0.0, D) - lam) < 1e-6


def test_true_radius_none_past_a_fold():
    # k1 < 0 alone folds at r = 1/sqrt(-3 k1), where rho peaks at (2/3) r
    k1 = -0.5
    rf = (1 / (-3 * k1)) ** 0.5
    assert true_radius(0.99 * radial(rf, k1, 0, 0)[0], k1, 0, 0) < rf
    assert true_radius(1.01 * radial(rf, k1, 0, 0)[0], k1, 0, 0) is None
