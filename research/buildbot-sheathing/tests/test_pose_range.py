"""Milestone 31: backlash across poses (held-joint bias, one calibration)."""
import math

import numpy as np

from buildbot_sheathing import backlash as B
from buildbot_sheathing import pose_range as PR
from buildbot_sheathing import tool_lean as T


def _jac(seed=4):
    rng = np.random.default_rng(seed)
    return rng.normal(0, 0.3, (3, 7)), rng.normal(0, 1.0, (3, 7))


def test_held_bias_sits_against_the_motor_torque():
    d = PR.held_bias([1.0, -1.0, 0.1, -2.0], [3.0, 1.0, 0.3, -2.5], 0.2, 0.01)
    assert d.tolist() == [-0.005, 0.0, 0.0, 0.005]


def test_nose_bias_is_the_tool_rows_times_delta():
    jp, jr = _jac()
    delta = np.linspace(-1e-3, 1e-3, 7)
    b = PR.nose_bias(jp, jr, delta, 0.3)
    A = B.tool_rows(jp, jr, (0.3, 0, 0)) @ delta
    assert math.isclose(b["y"][0], A[1], rel_tol=1e-12) and math.isclose(b["z"][0], A[2], rel_tol=1e-12)


def test_calibration_at_the_same_pose_leaves_nothing_and_parts_add_up():
    jp, jr = _jac()
    jp2, jr2 = _jac(5)
    d1 = np.array([1, -1, 1, 0, 1, -1, 0.0]) * 1e-3
    d2 = np.array([1, 1, 1, 0, -1, -1, 0.0]) * 1e-3
    b1 = PR.nose_bias(jp, jr, d1, 0.3)
    assert PR.residual(b1, b1) == {"y": (0.0, 0.0), "z": (0.0, 0.0)}
    mu = PR.residual(PR.nose_bias(jp2, jr2, d2, 0.3), b1)
    jac = PR.residual(PR.nose_bias(jp2, jr2, d1, 0.3), b1)
    flip = PR.nose_bias(jp2, jr2, d2 - d1, 0.3)
    for k in ("y", "z"):
        for i in (0, 1):
            assert math.isclose(mu[k][i], jac[k][i] + flip[k][i], abs_tol=1e-15)


def test_with_bias_shifts_draws_and_zero_bias_changes_nothing():
    e = T.point_model(1e-3)
    rng1, rng2 = np.random.default_rng(1), np.random.default_rng(1)
    s0, d0 = e.draw(rng1, (1000,))
    s1, d1 = PR.with_bias(e, {"y": (2e-4, -3e-4), "z": (0.0, 0.0)}).draw(rng2, (1000,))
    assert np.allclose(s1 - s0, 2e-4) and np.allclose(d1 - d0, -3e-4)
    s2, _ = PR.with_bias(e, {"y": (0.0, 0.0), "z": (0.0, 0.0)}).draw(np.random.default_rng(1), (1000,))
    assert np.array_equal(s2, s0)


def test_sign_flips_only_counts_joints_held_everywhere():
    taus = [np.array([1.0, 1.0, -1.0]), np.array([-1.0, 1.0, 1.0])]
    held = [np.array([True, True, False]), np.array([True, True, True])]
    assert PR.sign_flips(taus, held, [True, True, True]).tolist() == [0]
