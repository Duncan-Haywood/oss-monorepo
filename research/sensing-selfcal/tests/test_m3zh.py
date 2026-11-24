"""Milestone 3zh: VINS-Mono's additive undistortion loop, its eigenvalues, and ORB-SLAM's rounding."""
import math
import os
import sys

import pytest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "experiments", "m3zh_versions"))
sys.path.insert(0, os.path.join(HERE, "..", "experiments", "m3zg_loop"))
from vins import distortion, additive_map, lift_projective  # noqa: E402

WIDE = dict(fx=335.88, fy=334.91, cx=330.67, cy=225.95, k1=-0.2983, k2=0.0733, p1=0.00051, p2=-0.00144, k3=0.0)


def forward(x, y, c):
    dx, dy = distortion(x, y, c["k1"], c["k2"], c["p1"], c["p2"])
    return (x + dx) * c["fx"] + c["cx"], (y + dy) * c["fy"] + c["cy"]


def test_zero_distortion_is_identity():
    c = dict(WIDE, k1=0.0, k2=0.0, p1=0.0, p2=0.0)
    x, y = lift_projective(100.0, 50.0, c, 8)
    assert x == pytest.approx((100.0 - c["cx"]) / c["fx"]) and y == pytest.approx((50.0 - c["cy"]) / c["fy"])


@pytest.mark.parametrize("u,v", [(320, 240), (100, 400), (0, 0), (639, 479)])
def test_converges_to_the_forward_models_inverse(u, v):
    x, y = lift_projective(u, v, WIDE, 200)
    pu, pv = forward(x, y, WIDE)
    assert abs(pu - u) < 1e-6 and abs(pv - v) < 1e-6


def test_one_step_counts_like_liftProjective():
    """liftProjective's first evaluation is at x_d, then n - 1 more: n evaluations of D in all."""
    c = WIDE
    xd, yd = (10 - c["cx"]) / c["fx"], (20 - c["cy"]) / c["fy"]
    dx, dy = distortion(xd, yd, c["k1"], c["k2"], c["p1"], c["p2"])
    assert lift_projective(10, 20, c, 1) == pytest.approx((xd - dx, yd - dy), abs=0)


@pytest.mark.parametrize("r", [0.3, 1.0, 1.7, 1.9])
def test_radial_eigenvalues_match_theory(r):
    """Pure-radial model: the additive map's Jacobian eigenvalues are 1 - rho'(r) and 1 - c(r)."""
    np = pytest.importorskip("numpy")
    k1, k2 = -0.3186, 0.0724
    x, y = r * math.cos(0.6), r * math.sin(0.6)
    rd = r * (1 + k1 * r * r + k2 * r ** 4)
    xd, yd = rd * math.cos(0.6), rd * math.sin(0.6)
    h = 1e-7
    J = np.empty((2, 2))
    for j, (ex, ey) in enumerate(((h, 0.0), (0.0, h))):
        a = additive_map(x + ex, y + ey, xd, yd, k1, k2, 0.0, 0.0)
        b = additive_map(x - ex, y - ey, xd, yd, k1, k2, 0.0, 0.0)
        J[:, j] = [(a[0] - b[0]) / (2 * h), (a[1] - b[1]) / (2 * h)]
    got = sorted(np.linalg.eigvals(J).real)
    c = 1 + k1 * r * r + k2 * r ** 4
    drho = 1 + 3 * k1 * r * r + 5 * k2 * r ** 4
    assert got == pytest.approx(sorted([1 - drho, 1 - c]), abs=1e-6)


def test_c_round_is_half_away_from_zero():
    pytest.importorskip("cv2")
    np = pytest.importorskip("numpy")
    import importlib.util
    spec = importlib.util.spec_from_file_location(
        "m3zh_analyse", os.path.join(HERE, "..", "experiments", "m3zh_versions", "analyse.py"))
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    c_round = m.c_round
    assert list(c_round(np.array([-1.5, -0.5, -0.4, 0.5, 1.5, 63.5]))) == [-2, -1, -0, 1, 2, 64]
