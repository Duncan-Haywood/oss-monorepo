import numpy as np
from capture_syncfine import coarse_offset, trial_plain, trial_coarse_fine, audio_seconds


def test_coarse_offset_clean():
    assert abs(coarse_offset(np.random.default_rng(0), 0.8, 20) - 0.8) < 1e-3


def test_coarse_to_fine_fixes_window_shorter_than_offset_at_high_snr():
    # 0.5 s windows cannot overlap a 0.8 s offset: plain must fail, coarse-to-fine must not
    p = trial_plain(0, win_s=0.5, snr_db=10)
    c = trial_coarse_fine(0, win_s=0.5, snr_db=10)
    assert not p["fit_ok"] and c["fit_ok"] and c["fit_max_ms"] < 1.0


def test_hopeless_snr_fails_for_both():
    assert not trial_coarse_fine(0, win_s=1.0, snr_db=-30)["fit_ok"]


def test_deterministic():
    assert trial_coarse_fine(3, snr_db=0) == trial_coarse_fine(3, snr_db=0)


def test_audio_cost():
    assert audio_seconds(12, 1.0, coarse=True) == 22.0 and audio_seconds(12, 1.0) == 12.0
