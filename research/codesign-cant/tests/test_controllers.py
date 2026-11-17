"""Milestone 4: the INDI and geometric attitude laws."""
import os
import sys

import numpy as np
import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from codesign_cant import aero  # noqa: E402


def test_rotation_is_orthonormal_with_unit_determinant():
    rng = np.random.default_rng(1)
    ang = rng.uniform(-1.2, 1.2, (50, 3))
    R = aero.eul2R(ang[:, 0], ang[:, 1], ang[:, 2])
    assert np.allclose(R @ np.swapaxes(R, -1, -2), np.eye(3), atol=1e-12)
    assert np.allclose(np.linalg.det(R), 1.0)


@pytest.mark.parametrize("axis", [0, 1, 2])
def test_so3_error_is_sine_of_single_axis_angle(axis):
    for a in (0.05, 0.3, 1.0):
        th = np.zeros(3); th[axis] = a
        e = aero.so3_error(th[None], np.zeros((1, 3)))[0]
        want = np.zeros(3); want[axis] = np.sin(a)
        assert np.allclose(e, want, atol=1e-12)
        assert np.allclose(aero.so3_error(th[None], th[None]), 0, atol=1e-12)


def test_ctrl_gains_map_unit_cube_to_declared_ranges():
    for c in ("indi", "geo"):
        lo, hi = aero.ctrl_gains(np.zeros((1, 6)), c)[0], aero.ctrl_gains(np.ones((1, 6)), c)[0]
        assert np.allclose(np.log10(lo), aero.CTRL_LO[c]) and np.allclose(np.log10(hi), aero.CTRL_HI[c])
    g = np.random.default_rng(0).uniform(0, 1, (4, 6))
    assert np.allclose(aero.ctrl_gains(g, "pid"), np.concatenate([aero.gains_from_unit(g[:, :3]), aero.gains_from_unit(g[:, 3:])], 1))


def _sz(alpha=0.5):
    return aero.size(np.array([0.18]), np.array([0.15]), np.array([alpha]), kappa_per_d=0.081, actuator="hover")


@pytest.mark.parametrize("ctrl,gains", [("indi", [20.0, 80.0, 10.0, 40.0, 50.0, 1.0]), ("geo", [2000.0, 90.0, 100.0, 400.0, 40.0, 10.0])])
def test_laws_track_a_small_step_on_the_nominal_plant(ctrl, gains):
    """Noise-free nominal plant, steps at 10% of the usual size: the error must be far below the reference's own RMS."""
    g = np.array([gains])
    rms, axis = aero.rollout(_sz(), g, episodes=2, seed=0, gust_std=0.0, gust_mean=0.0, plant=None, ref_scale=0.1, mixer="prio", ctrl=ctrl)
    ref_rms = np.sqrt(np.mean(np.square(np.array(aero.REF_DEG) * 0.1)))
    assert rms[0] < 0.5 * ref_rms


def test_indi_rejects_a_steady_disturbance_better_than_without_acceleration_feedback():
    """INDI's angular-acceleration feedback cancels a constant gust torque; with the effectiveness scale at its floor
    (g = 0.5, half the feedback) the steady error under the same wind should be larger."""
    sz = _sz(0.0)
    base = [8.0, 40.0, 4.0, 20.0, 30.0]
    full, _ = aero.rollout(sz, np.array([base + [1.0]]), episodes=2, seed=0, gust_std=0.0, gust_mean=8.0, plant=None, ref_scale=0.05, ctrl="indi")
    weak, _ = aero.rollout(sz, np.array([base + [0.5]]), episodes=2, seed=0, gust_std=0.0, gust_mean=8.0, plant=None, ref_scale=0.05, ctrl="indi")
    assert np.isfinite(full[0]) and full[0] <= weak[0] + 1e-9
