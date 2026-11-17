"""Milestone 3k: the rolling-shutter camera (experiments/m3k_shutter/rs.py)."""
import os, sys
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "experiments", "m3k_shutter"))
import rs  # noqa: E402
from rs import nfba  # noqa: E402

INTR = np.array([518.28, 315.7, 260.1, 0.25, -0.75])


def pts(n=300, seed=0):
    rng = np.random.default_rng(seed)
    z = rng.uniform(1.5, 5.0, n)
    return np.c_[rng.uniform(-0.6, 0.6, n) * z, rng.uniform(-0.45, 0.45, n) * z, z]


def test_zero_readout_is_the_global_shutter_projection():
    X = pts()
    rv, tv = np.array([0.05, -0.1, 0.02]), np.array([0.1, 0.0, -0.05])
    a, za, tau = rs.project_rs(INTR, rv, tv, X, np.array([1.0, 0.5, 0.2]), np.array([0.3, 0, 0]), 0.0)
    b, zb = nfba.project(INTR, np.tile(rv, (len(X), 1)), np.tile(tv, (len(X), 1)), X)
    assert np.allclose(a, b, atol=1e-9) and np.allclose(tau, 0)


def test_fixed_point_converges():
    X = pts()
    w = np.array([2.0, -2.0, 2.0])
    a, *_ = rs.project_rs(INTR, np.zeros(3), np.zeros(3), X, w, np.zeros(3), 1 / 30, iters=10)
    b, *_ = rs.project_rs(INTR, np.zeros(3), np.zeros(3), X, w, np.zeros(3), 1 / 30, iters=20)
    assert np.abs(a - b).max() < 1e-6


def test_row_time_matches_the_row():
    X = pts()
    uv, _, tau = rs.project_rs(INTR, np.zeros(3), np.zeros(3), X, np.array([1.0, 0, 0]), np.zeros(3), 1 / 30)
    assert np.allclose(tau, (uv[:, 1] - INTR[2]) / 480 / 30, atol=1e-9)


def test_pitch_rate_is_a_vertical_stretch_of_the_predicted_size():
    """Distortion off: a pitch rate w scales image rows about c_y by 1 - w t_r f / H to first order."""
    intr = INTR.copy(); intr[3:] = 0
    X = pts()
    g, *_ = rs.project_rs(intr, np.zeros(3), np.zeros(3), X, np.zeros(3), np.zeros(3), 0.0)
    w, tr = 0.3, 1 / 30
    r, *_ = rs.project_rs(intr, np.zeros(3), np.zeros(3), X, np.array([w, 0, 0]), np.zeros(3), tr)
    dy0, dy1 = g[:, 1] - intr[2], r[:, 1] - intr[2]
    slope = np.polyfit(dy0, dy1, 1)[0]
    assert abs((1 - slope) - w * tr * intr[0] / 480) < 0.15 * w * tr * intr[0] / 480   # the (1 + y^2) term adds about 10%
    e, share = rs.first_order_bias(g, intr, w, tr)
    assert e < 0 and 0.2 < share < 0.5
    # x moves much less than y under pitch (only the second-order x*y term)
    assert np.abs(r[:, 0] - g[:, 0]).max() < 0.25 * np.abs(dy1 - dy0).max()
