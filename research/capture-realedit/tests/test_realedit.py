import os
import numpy as np
import pytest
from capture_realaudio import SOUNDS_DIR, available_clips
from capture_realedit import real_camera_errors, real_trial

have = os.path.isdir(SOUNDS_DIR)


def tone_noise_clip(seed=0, n=16000 * 6):
    return np.random.default_rng(seed).standard_normal(n) * 0.3


def test_reference_camera_has_zero_error_and_count_is_right():
    err = real_camera_errors(np.random.default_rng(0), tone_noise_clip(), 4, "fit", 1000.0, 2.0, 20.0, 1.0)
    assert len(err) == 4 and err[0] == 0.0


def test_clean_broadband_clip_syncs_to_well_under_a_frame():
    err = real_camera_errors(np.random.default_rng(1), tone_noise_clip(), 3, "fit", 1800.0, 2.0, 20.0, 1.0)
    assert max(abs(e) for e in err) < 0.005


def test_clean_clip_leaves_no_visible_cuts():
    r = real_trial(3, tone_noise_clip(), "fit", 2.0, 20.0, 1.0)
    assert r["visible"] == 0.0 and r["event"] == 0.0


def test_once_mode_drifts_more_than_fit_on_a_clean_clip():
    c = tone_noise_clip()
    o = np.mean([real_trial(s, c, "once", 2.0, 20.0, 1.0)["max_err_ms"] for s in range(4)])
    f = np.mean([real_trial(s, c, "fit", 2.0, 20.0, 1.0)["max_err_ms"] for s in range(4)])
    assert o > 5 * f


def test_pure_noise_at_very_low_snr_breaks_the_edit():
    r = [real_trial(s, tone_noise_clip(), "fit", 2.0, -25.0, 1.0)["visible"] for s in range(4)]
    assert np.mean(r) > 0.5


@pytest.mark.skipif(not have, reason="LibreOffice sounds absent")
def test_real_clips_load_and_run():
    clips = available_clips()
    assert clips
    name = sorted(clips)[0]
    r = real_trial(0, clips[name], "fit", 2.0, 10.0, 1.0)
    assert 0.0 <= r["visible"] <= 1.0
