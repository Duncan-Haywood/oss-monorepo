"""Milestone 6: position hold with the corrected side force."""
import os
import sys

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from codesign_cant import allocation, poshold  # noqa: E402


def test_side_force_closed_form_matches_layout_rows():
    rng = np.random.default_rng(3)
    for _ in range(100):
        a, L, k = rng.uniform(0, 1.3), rng.uniform(0.08, 0.3), rng.uniform(0.005, 0.03)
        B = allocation.layout(a, L, k)
        kr, ky = allocation.arms(a, L, k)
        lat = poshold.lateral_per_torque(a, L, k)
        fr = B[:2] @ allocation.thrust_change(np.array([1.0, 0, 0]), kr, ky)
        fp = B[:2] @ allocation.thrust_change(np.array([0, 1.0, 0]), kr, ky)
        fy = B[:2] @ allocation.thrust_change(np.array([0, 0, 1.0]), kr, ky)
        assert np.allclose(fr, [0, lat], atol=1e-12)      # roll torque -> +y body force
        assert np.allclose(fp, [lat, 0], atol=1e-12)      # pitch torque -> +x body force
        assert np.allclose(fy, 0, atol=1e-12)             # yaw torque -> no horizontal force


def test_side_force_is_sqrt2_smaller_than_the_earlier_form_without_kappa():
    a, L = 0.6, 0.2
    assert np.isclose(allocation.prior_model(a, L, 0.0, 1, 2)[2] / poshold.lateral_per_torque(a, L, 0.0), np.sqrt(2))


def test_no_cant_makes_coupling_irrelevant():
    rng = np.random.default_rng(0)
    x = rng.uniform(0.3, 0.7, (4, 12)); x[:, 2] = 0.0
    on = poshold.score(x, 4, 1, couple=True, parts=True)[2]
    off = poshold.score(x, 4, 1, couple=False, parts=True)[2]
    for k in on:
        assert np.allclose(on[k], off[k])


def test_coupling_changes_a_canted_vehicle_and_rollout_is_deterministic():
    rng = np.random.default_rng(0)
    x = rng.uniform(0.3, 0.7, (4, 12)); x[:, 2] = 0.5
    a = poshold.score(x, 4, 1, parts=True)[2]
    b = poshold.score(x, 4, 1, parts=True)[2]
    c = poshold.score(x, 4, 1, couple=False, parts=True)[2]
    assert np.array_equal(a["pos"], b["pos"])
    assert not np.allclose(a["pos"], c["pos"])


def test_wind_step_moves_the_late_window_only_after_the_step():
    rng = np.random.default_rng(2)
    x = rng.uniform(0.3, 0.7, (3, 12))
    calm = poshold.score(x, 4, 5, wind_step=0.0, parts=True)[2]
    step = poshold.score(x, 4, 5, parts=True)[2]
    assert not np.allclose(calm["pos_late"], step["pos_late"])
    assert np.all(calm["pos_late"] >= 0) and np.all(step["dead"] >= 0)


def test_flipping_the_gust_torque_sign_changes_a_canted_hold():
    rng = np.random.default_rng(4)
    x = rng.uniform(0.3, 0.7, (2, 12)); x[:, 2] = 0.5
    a = poshold.score(x, 4, 1, parts=True)[2]
    b = poshold.score(x, 4, 1, parts=True, dist_sign=-1.0)[2]
    assert not np.allclose(a["pos"], b["pos"])


def test_cop_signs_match_r_cross_f_for_a_rigid_offset():
    # rollout: roll torque = sign[0] * kg * v0|v0| goes with Fy = kf * v0|v0|; pitch torque = sign[1] * kg * v1|v1| with Fx.
    for h in (0.1, -0.07):
        r = np.array([0.0, 0.0, h])
        tx = np.cross(r, [0.0, 1.0, 0.0])[0] / abs(h)    # roll torque per unit Fy, per unit lever
        ty = np.cross(r, [1.0, 0.0, 0.0])[1] / abs(h)    # pitch torque per unit Fx
        assert np.allclose(poshold.cop_signs(h), [tx, ty])
    # the inherited (+1, +1) is not a rigid body: no h reproduces it
    assert not any(np.array_equal(poshold.cop_signs(h), [1.0, 1.0]) for h in (1.0, -1.0))


def test_scalar_and_pair_dist_sign_agree_and_lever_zero_removes_the_gust_torque():
    rng = np.random.default_rng(5)
    x = rng.uniform(0.3, 0.7, (2, 12)); x[:, 2] = 0.5
    a = poshold.score(x, 4, 1, parts=True, dist_sign=-1.0)[2]
    b = poshold.score(x, 4, 1, parts=True, dist_sign=np.array([-1.0, -1.0]))[2]
    assert np.array_equal(a["pos"], b["pos"])
    z1 = poshold.score(x, 4, 1, parts=True, dist_sign=1.0, lever_scale=0.0)[2]
    z2 = poshold.score(x, 4, 1, parts=True, dist_sign=-1.0, lever_scale=0.0)[2]
    assert np.array_equal(z1["pos"], z2["pos"])
    assert np.all(a["late_x"] >= 0) and np.all(a["late_y"] >= 0)
