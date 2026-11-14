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


def test_feed_forward_is_inert_without_cant_or_at_zero_gain():
    rng = np.random.default_rng(5)
    x = rng.uniform(0.3, 0.7, (3, 12)); x[:, 2] = 0.0
    a = poshold.score(x, 4, 1, ff=0.0, parts=True)[2]
    b = poshold.score(x, 4, 1, ff=1.0, parts=True)[2]
    for k in a:
        assert np.allclose(a[k], b[k])          # no cant: lat = 0, nothing to predict
    x[:, 2] = 0.5
    c = poshold.score(x, 4, 1, ff=0.0, parts=True)[2]
    d = poshold.score(x, 4, 1, parts=True)[2]
    for k in c:
        assert np.array_equal(c[k], d[k])       # the default is milestone 6/6b's controller


def test_feed_forward_evens_the_axes_for_milestone_6b_designs():
    # Milestone 6b's force-aware designs under the rigid geometry they were trained for: the steady counter-torque's side force
    # adds to the drag on one axis. Leaning against the predicted force (slow filter) brings the two axes together.
    import json
    runs = json.load(open(os.path.join(os.path.dirname(__file__), "..", "experiments", "m6b_cop", "results.json")))["runs"]
    rs = [r for r in runs if r["geom"] == "below" and r["arm"] == "aware" and r["source"] == "retrained"]
    x = np.array([r["x"] for r in rs])
    kw = dict(alpha_max=np.deg2rad(80.0), dist_sign=poshold.cop_signs(-1.0), parts=True)
    off = poshold.score(x, 16, 100, **kw)[2]
    on = poshold.score(x, 16, 100, ff=1.0, tau_ff=1.0, **kw)[2]
    ok = (off["dead"] == 0) & (on["dead"] == 0)
    assert ok.sum() >= 3
    assert np.median(np.abs(np.log(on["late_x"][ok] / on["late_y"][ok]))) < np.median(np.abs(np.log(off["late_x"][ok] / off["late_y"][ok])))


def test_thirteenth_coordinate_sets_the_filter():
    rng = np.random.default_rng(7)
    x = rng.uniform(0.3, 0.7, (2, 12)); x[:, 2] = 0.5
    for u, tau in ((0.0, 0.05), (1.0, 2.0)):
        a = poshold.score(np.c_[x, np.full(2, u)], 4, 1, ff=1.0, parts=True)[2]
        b = poshold.score(x, 4, 1, ff=1.0, tau_ff=tau, parts=True)[2]
        assert np.allclose(a["pos"], b["pos"])


def test_integrator_feed_forward_is_inert_without_cant_and_ignores_the_filter():
    # Milestone 7b: ff_mode="integ" feeds forward lat * ki * integ * tau_max_nom, unfiltered.
    rng = np.random.default_rng(11)
    x = rng.uniform(0.3, 0.7, (3, 12)); x[:, 2] = 0.0
    a = poshold.score(x, 4, 1, parts=True)[2]
    b = poshold.score(x, 4, 1, ff=1.0, ff_mode="integ", parts=True)[2]
    for k in a:
        assert np.allclose(a[k], b[k])          # no cant: lat = 0
    x[:, 2] = 0.5
    c = poshold.score(x, 4, 1, ff=1.0, ff_mode="integ", tau_ff=0.05, parts=True)[2]
    d = poshold.score(x, 4, 1, ff=1.0, ff_mode="integ", tau_ff=2.0, parts=True)[2]
    e = poshold.score(x, 4, 1, parts=True)[2]
    f = poshold.score(x, 4, 1, ff=1.0, tau_ff=0.5, parts=True)[2]
    for k in c:
        assert np.array_equal(c[k], d[k])       # tau_ff is unused in this mode
    assert not np.allclose(c["pos"], e["pos"])  # it acts on a canted vehicle
    assert not np.allclose(c["pos"], f["pos"])  # and differs from milestone 7's commanded-torque feed-forward


def _m7b_above_design():
    import json
    runs = json.load(open(os.path.join(os.path.dirname(__file__), "..", "experiments", "m7b_integ", "results.json")))["runs"]
    return next(r for r in runs if r["label"] == "6b+integ" and r["geom"] == "above" and r["seed"] == 0)


def _sz_gains(x):
    from codesign_cant import aero as A
    x = np.atleast_2d(np.asarray(x, float))
    L = A.L_RANGE[0] + x[:, 0] * (A.L_RANGE[1] - A.L_RANGE[0]); D = A.D_RANGE[0] + x[:, 1] * (A.D_RANGE[1] - A.D_RANGE[0])
    return A.size(L, D, np.deg2rad(80.0) * np.clip(x[:, 2], 0, 1), kappa_per_d=0.081, actuator="hover"), poshold.phys_gains(x[:, 3:12]), 0.081 * D


def test_milestone_7d_probes_leave_the_default_rollout_unchanged():
    """integ_clip, ffi_clip, steps and diag at their defaults reproduce the milestone 6-7c rollout bit for bit."""
    r = _m7b_above_design(); sz, g, kap = _sz_gains(r["x"])
    kw = dict(dist_sign=poshold.cop_signs(1.0), ff=1.0, ff_mode="integ")
    a = poshold.rollout(sz, g, kap, 8, 5, **kw)
    diag = {}
    b = poshold.rollout(sz, g, kap, 8, 5, integ_clip=0.3, ffi_clip=1.0, steps=poshold.STEPS, diag=diag, **kw)
    for k in ("pos", "yaw", "att", "dead", "pos_ep"):
        assert np.array_equal(a[k], b[k]), k
    for k in ("integ_at_clip", "ffi_at_clip", "tilt_at_clip", "mix_rp"):
        assert diag[k].shape == (1, 8) and (diag[k] >= 0).all() and (diag[k] <= 1).all()
    assert ((diag["t_dead"] >= 0) == b["dead_ep"]).all()


def test_milestone_7g_probes_leave_the_default_rollout_unchanged_and_mixer_off_differs():
    """mixer=True and the new diag keys reproduce the default rollout; mixer=False changes it; dead_tilt implies dead."""
    r = _m7b_above_design(); sz, g, kap = _sz_gains(r["x"])
    kw = dict(dist_sign=poshold.cop_signs(1.0), ff=1.0, ff_mode="integ", lever_scale=2.0)
    a = poshold.rollout(sz, g, kap, 8, 5, **kw)
    diag = {}
    b = poshold.rollout(sz, g, kap, 8, 5, diag=diag, mixer=True, **kw)
    for k in ("pos", "yaw", "att", "dead", "pos_ep"):
        assert np.array_equal(a[k], b[k]), k
    for k in ("req_at_clip", "dist_over"):
        assert diag[k].shape == (1, 8) and (diag[k] >= 0).all() and (diag[k] <= 1).all()
    assert not (diag["dead_tilt"] & ~b["dead_ep"]).any()
    c = poshold.rollout(sz, g, kap, 8, 5, mixer=False, **kw)
    assert not np.array_equal(a["pos_ep"], c["pos_ep"])


def test_longer_episode_keeps_the_first_draws_and_four_yaw_segments():
    y6, *_ = poshold.reference(4, 3)
    y18, *rest = poshold.reference(4, 3, 3 * poshold.STEPS)
    assert y18.shape == (4, 3 * poshold.STEPS)
    assert np.array_equal(y6[:, :: poshold.STEPS // 4], y18[:, :: 3 * poshold.STEPS // 4])   # same four signs
