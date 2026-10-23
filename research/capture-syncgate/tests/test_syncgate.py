import numpy as np
from capture_syncgate import gcc_psr, gated_camera_errors, gated_trial, loco_pick
from capture_realaudio import pair_from_clip


def clip(seed=0, n=16000 * 6):
    return np.random.default_rng(seed).standard_normal(n) * 0.3


def test_psr_high_for_true_delay_low_for_noise():
    rng = np.random.default_rng(0)
    a, b = pair_from_clip(clip(), rng, 0.8, 2.0, 20.0)
    d, p = gcc_psr(a, b, 1.0, max_lag_s=2.0)
    assert abs(d - 0.8) < 0.002 and p > 10
    _, p2 = gcc_psr(rng.standard_normal(32000), rng.standard_normal(32000), 1.0, max_lag_s=2.0)
    assert p2 < 8


def test_gate_off_matches_a_clean_sync():
    err, dropped = gated_camera_errors(np.random.default_rng(1), clip(), 3, 1800.0, 2.0, 20.0, 1.0, 0.0)
    assert len(err) == 3 and err[0] == 0.0 and max(abs(e) for e in err) < 0.005 and dropped == 0.0


def test_gate_drops_windows_but_keeps_a_line():
    err, dropped = gated_camera_errors(np.random.default_rng(2), clip(), 3, 1800.0, 2.0, -25.0, 1.0, 1e9)
    assert dropped == 1 - 3 / 12 and len(err) == 3 and np.all(np.isfinite(err))


def test_gate_does_not_hurt_a_clean_clip():
    r = gated_trial(3, clip(), 2.0, 20.0, 1.0, 6.5)
    assert r["visible"] == 0.0 and r["dropped"] == 0.0


def test_loco_pick_never_sees_the_held_out_clip():
    table = {"a": {"x": 0.0, "y": 1.0}, "b": {"x": 0.5, "y": 0.0}, "c": {"x": 0.5, "y": 0.0}}
    sel = loco_pick(table)
    assert sel["a"] == ("y", 1.0) and sel["b"] == ("x", 0.5)
