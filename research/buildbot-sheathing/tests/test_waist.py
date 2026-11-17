"""Milestone 39: the per-joint gap of each waist case."""
import numpy as np
import pytest

from buildbot_sheathing import waist as WA
from buildbot_sheathing.pose_range import held_bias

NAMES = ["left_hip_pitch_joint", "waist_yaw_joint", "waist_roll_joint", "waist_pitch_joint", "left_elbow_joint"]
W = [1, 2, 3]


def test_stock_keeps_every_gap_and_braked_zeroes_only_the_waist():
    assert np.allclose(WA.case_gaps(NAMES, W, 5.0, "stock"), 5.0)
    assert np.allclose(WA.case_gaps(NAMES, W, 5.0, "braked"), [5, 0, 0, 0, 5])


def test_yaw_only_keeps_the_yaw_and_precision_sets_the_waist():
    assert np.allclose(WA.case_gaps(NAMES, W, 5.0, "yaw only"), [5, 5, 0, 0, 5])
    assert np.allclose(WA.case_gaps(NAMES, W, 5.0, "precision", 1.0), [5, 1, 1, 1, 5])
    with pytest.raises(ValueError):
        WA.case_gaps(NAMES, W, 5.0, "precision")
    with pytest.raises(ValueError):
        WA.case_gaps(NAMES, W, 5.0, "welded")


def test_a_rigid_joint_contributes_no_held_bias():
    lo = np.array([1.0, 1.0, -1.0, 1.0, 1.0])       # every joint held (|tau| >= 0.2, one sign)
    g = WA.case_gaps(NAMES, W, 2.0, "braked")
    b = held_bias(lo, lo, 0.2, g)
    assert np.allclose(b, [-1.0, 0, 0, 0, -1.0])
