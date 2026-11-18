"""Milestone 3n: motion-capture body rates (experiments/m3n_tumrs/run.py) and their sign in rsba."""
import importlib.util, os, sys
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
EXP = os.path.join(HERE, "..", "experiments")
sys.path.insert(0, os.path.join(EXP, "m3l_gyro"))
sys.path.insert(0, os.path.join(EXP, "m3k_shutter"))
import rsba  # noqa: E402
import rs  # noqa: E402

_spec = importlib.util.spec_from_file_location("m3n_run", os.path.join(EXP, "m3n_tumrs", "run.py"))
run = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(run)


def _quat(R):
    """Rotation matrix to (x, y, z, w)."""
    w = np.sqrt(max(1e-12, 1 + np.trace(R))) / 2
    return np.array([(R[2, 1] - R[1, 2]) / (4 * w), (R[0, 2] - R[2, 0]) / (4 * w),
                     (R[1, 0] - R[0, 1]) / (4 * w), w])


def _track(wb, R0, ts):
    """Mocap rows (t tx ty tz qx qy qz qw) for a camera turning at body rate wb from R0."""
    rows = []
    for t in ts:
        R = R0 @ rs.expm_so3(np.asarray(wb)[None] * t)[0]
        rows.append(np.r_[t, 0, 0, 0, _quat(R)])
    return np.array(rows)


def test_quaternion_round_trip():
    R = rs.expm_so3(np.array([[0.3, -0.2, 0.5]]))[0]
    assert np.allclose(run.quat_to_R(_quat(R)), R, atol=1e-12)


def test_body_rate_recovers_a_constant_rate_in_the_camera_frame():
    wb = np.array([0.4, -0.7, 0.2])
    R0 = rs.expm_so3(np.array([[1.0, 0.5, -0.3]]))[0]
    gt = _track(wb, R0, np.arange(0, 2, 0.01))
    for d in run.DELTAS:
        assert np.allclose(run.body_rate(gt, 0.733, d), wb, atol=1e-9)


def test_body_rate_is_nan_in_a_mocap_gap_or_outside_the_record():
    gt = _track([0.1, 0, 0], np.eye(3), np.r_[np.arange(0, 1, 0.01), np.arange(1.2, 2, 0.01)])
    assert np.isnan(run.body_rate(gt, 1.1, 0.02)).all()
    assert np.isnan(run.body_rate(gt, 1.995, 0.02)).all()
    assert np.isfinite(run.body_rate(gt, 0.5, 0.02)).all()


def test_rsba_rate_is_minus_the_body_rate():
    """A camera turning at body rate wb sees a world point at R(tau)^T (X - c) at time tau; rsba
    moves the tau = 0 camera-frame point by exp([w tau]x), so w must be -wb."""
    wb = np.array([0.5, -0.3, 0.8])
    R0 = rs.expm_so3(np.array([[0.2, 0.1, -0.4]]))[0]
    X = np.array([[0.3, -0.2, 2.5], [1.0, 0.4, 3.0]])
    for tau in (-0.015, 0.01):
        Rt = R0 @ rs.expm_so3(wb[None] * tau)[0]
        direct = X @ Rt                      # rows: Rt^T X
        x0 = X @ R0
        model = rsba.rodrigues(np.tile(-wb * tau, (2, 1)), x0)
        assert np.allclose(direct, model, atol=1e-12)
