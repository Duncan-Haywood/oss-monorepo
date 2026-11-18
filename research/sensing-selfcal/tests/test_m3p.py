"""Milestone 3p: mocap linear velocity and scale for the TUM window solve (experiments/m3p_tumvel)."""
import importlib.util, os
import numpy as np
import pytest

cv2 = pytest.importorskip("cv2")
HERE = os.path.dirname(os.path.abspath(__file__))
EXP = os.path.join(HERE, "..", "experiments")
_s = importlib.util.spec_from_file_location("m3p_run", os.path.join(EXP, "m3p_tumvel", "run.py"))
run = importlib.util.module_from_spec(_s)
_s.loader.exec_module(run)


def _gt(v, w=np.zeros(3), T=2.0):
    """Synthetic TUM ground truth at 100 Hz: centre v*t, rotation exp([w t]x) (camera to world)."""
    rows = []
    for t in np.arange(0, T, 0.01):
        R, _ = cv2.Rodrigues(w * t)
        # rotation matrix -> quaternion (x, y, z, w)
        qw = np.sqrt(max(1 + np.trace(R), 1e-12)) / 2
        q = np.array([(R[2, 1] - R[1, 2]) / (4 * qw), (R[0, 2] - R[2, 0]) / (4 * qw), (R[1, 0] - R[0, 1]) / (4 * qw), qw])
        rows.append(np.r_[t, v * t, q])
    return np.array(rows)


def test_camera_velocity_moves_a_static_point_the_way_the_shutter_model_does():
    v = np.array([0.3, -0.1, 0.2])
    w = np.array([0.0, 0.4, 0.0])
    gt = _gt(v, w)
    t, tau = 1.0, 0.012
    X = np.array([0.5, 0.2, 2.0])
    Xc = lambda s: run.m3n.R_at(gt, s).T @ (X - run.pos_at(gt, s))
    u = run.cam_vel(gt, t)
    wb = run.m3n.body_rate(gt, t, run.D)
    # rsba.project: x_cam(tau) = exp([w tau]x) x_cam(0) + u tau, with w = -w_b
    pred = run.rsba.rodrigues((-wb * tau)[None], Xc(t)[None])[0] + u * tau
    assert np.abs(pred - Xc(t + tau)).max() < 1e-4
    assert np.abs((Xc(t) + u * tau) - Xc(t + tau)).max() > 1e-3     # the rotation term matters


def test_scale_is_the_ratio_of_centre_spreads():
    v = np.array([0.2, 0.05, -0.1])
    gt = _gt(v, np.array([0.1, 0.2, 0.0]))
    ts = np.linspace(0.2, 1.4, 12)
    Cm = run.centres_mocap(gt, ts)
    s_true = 3.7
    rv, tv = [], []
    for t, c in zip(ts, Cm):
        Rwc = run.m3n.R_at(gt, t)            # camera to world; window pose maps world to camera
        r, _ = cv2.Rodrigues(Rwc.T)
        rv.append(r.ravel()); tv.append(-Rwc.T @ (s_true * c))
    Cw = run.centres_window(np.array(rv), np.array(tv))
    assert abs(run.spread(Cw) / run.spread(Cm) - s_true) < 1e-9


def test_mocap_gap_gives_nan_velocity():
    gt = _gt(np.array([0.1, 0, 0]))
    gt = np.delete(gt, np.s_[95:110], axis=0)
    assert np.isnan(run.cam_vel(gt, 1.0)).all()
    assert np.isfinite(run.cam_vel(gt, 0.5)).all()
