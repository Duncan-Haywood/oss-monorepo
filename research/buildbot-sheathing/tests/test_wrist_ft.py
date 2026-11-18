"""Milestone 36: the wrist F/T sensor's joint error."""
import math

import numpy as np

from buildbot_sheathing import wrist_ft as F
from buildbot_sheathing.pose_range import held_bias

TF, GAP, K = 0.2, 1e-3, 1e4


def _t(lo, hi):
    return (np.array(lo, float), np.array(hi, float))


def test_exact_sensor_and_stiffness_leave_nothing():
    t0 = _t([1.0, -2.0, 0.1], [2.0, -3.0, 0.15])
    t = _t([1.5, -1.0, 0.3], [2.5, -2.0, 0.4])
    assert np.allclose(F.joint_error(t, t, t0, TF, GAP, K, 0.0), 0.0, atol=1e-15)


def test_no_sensor_is_the_backlash_misprediction_plus_the_whole_windup():
    t0 = _t([1.0, 0.1], [2.0, 0.1])
    t = _t([-1.0, 0.5], [-2.0, 0.6])        # joint 0 flips side, joint 1 becomes held
    e = F.joint_error(t, t0, t0, TF, GAP, K, math.inf)
    back = held_bias(t[0], t[1], TF, GAP) - held_bias(t0[0], t0[1], TF, GAP)
    wind = -F.mean_change(t, t0) / K
    assert np.allclose(e, back + wind)
    assert e[0] != 0 and e[1] != 0


def test_misjudged_stiffness_leaves_its_share():
    t0 = _t([3.0], [3.0])
    t = _t([5.0], [5.0])
    for eps in (0.25, -0.25):
        e = F.joint_error(t, t, t0, TF, GAP, K, eps)
        assert math.isclose(e[0], -2.0 / K * F.kt_share(eps), rel_tol=1e-12)
    assert math.isclose(F.kt_share(0.25), 0.2) and math.isclose(F.kt_share(-0.25), -1 / 3)


def test_sensor_figures_and_spans():
    assert F.two_sigma("ft300") == 0.2 and F.two_sigma("ft300_pre2017") == 2.4
    assert math.isclose(F.two_sigma("mini45"), 0.125)
    a = {"y": (3.0, 1.0), "z": (0.0, 2.0)}
    b = {"y": (4.0, 0.0), "z": (0.0, 0.0)}
    c = F.combine_spans(a, b)
    assert c["y"] == (5.0, 1.0) and c["z"] == (0.0, 2.0)
    u = F.uniform_equivalent({"y": (1.0, 0.0), "z": (0.0, 0.0)})
    assert math.isclose(u["y"][0] ** 2 / 12.0, 1.0)
