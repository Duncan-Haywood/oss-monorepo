import numpy as np
from capture_residgate import trimmed_fit, resid_camera_errors, resid_trial


def clip(seed=0, n=16000 * 6):
    return np.random.default_rng(seed).standard_normal(n) * 0.3


def test_trim_removes_outlier_and_recovers_line():
    t = np.linspace(0, 3600, 12)
    est = 0.8 + 20e-6 * t
    est[4] += 0.5
    est[9] -= 0.3
    i, s, keep = trimmed_fit(t, est, 0.005)
    assert not keep[4] and not keep[9] and keep.sum() == 10
    assert abs(i - 0.8) < 1e-6 and abs(s - 20e-6) < 1e-9


def test_tol_zero_is_plain_fit():
    t = np.linspace(0, 3600, 12)
    _, _, keep = trimmed_fit(t, 0.8 + 0 * t, 0.0)
    assert keep.all()


def test_floor_keeps_three():
    t = np.linspace(0, 3600, 12)
    est = np.random.default_rng(0).uniform(0, 1, 12)
    _, _, keep = trimmed_fit(t, est, 1e-9)
    assert keep.sum() == 3


def test_clean_clip_nothing_dropped():
    err, dropped = resid_camera_errors(np.random.default_rng(1), clip(), 3, 1800.0, 2.0, 20.0, 1.0, 0.005)
    assert dropped == 0.0 and max(abs(e) for e in err) < 0.005


def test_trial_clean():
    r = resid_trial(3, clip(), 2.0, 20.0, 1.0, 0.005)
    assert r["visible"] == 0.0
