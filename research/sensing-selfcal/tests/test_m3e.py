"""Milestone 3e: the optical-axis spread helpers (experiments/m3e_axis/axis.py) on known cases."""
import os, sys
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "experiments", "m3e_axis"))
import axis  # noqa: E402


def test_roll_about_optical_axis_gives_zero_spread():
    rvs = [[0, 0, np.radians(a)] for a in (0, 10, 30, 60)]
    assert axis.axis_spread_solver(rvs) < 1e-6


def test_pan_gives_its_angle():
    rvs = [[0, np.radians(a), 0] for a in (-5, 0, 7)]
    assert abs(axis.axis_spread_solver(rvs) - 12.0) < 1e-6


def test_mocap_convention_is_transpose_of_solver():
    rng = np.random.default_rng(1)
    for _ in range(5):
        rv = rng.normal(size=3) * 0.4
        R = axis.rodrigues(rv)                       # world-to-camera
        Rcw = R.T
        # quaternion of Rcw (qx qy qz qw)
        w = np.sqrt(max(0, 1 + np.trace(Rcw))) / 2
        q = np.array([(Rcw[2, 1] - Rcw[1, 2]) / (4 * w), (Rcw[0, 2] - Rcw[2, 0]) / (4 * w),
                      (Rcw[1, 0] - Rcw[0, 1]) / (4 * w), w])
        assert np.allclose(axis.quat_to_R(q), Rcw, atol=1e-9)
        assert np.allclose(axis.quat_to_R(q)[:, 2], R[2], atol=1e-9)


def test_total_rotation_counts_roll():
    Ra, Rb = axis.rodrigues([0, 0, 0]), axis.rodrigues([0, 0, np.radians(20)])
    assert abs(axis.total_rotation_deg(Ra, Rb) - 20) < 1e-6


def test_spearman_monotone_and_ties():
    assert abs(axis.spearman([1, 2, 3, 4], [10, 20, 30, 40]) - 1) < 1e-12
    assert abs(axis.spearman([1, 2, 3, 4], [4, 3, 2, 1]) + 1) < 1e-12
    assert abs(axis.spearman([1, 1, 2, 3], [1, 1, 2, 3]) - 1) < 1e-12
