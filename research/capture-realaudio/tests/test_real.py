import numpy as np
import pytest
from capture_realaudio import (load_clip, available_clips, noise, pair_from_clip, error_ms,
                               SOUNDS_DIR)
import os
from capture_realaudio import gcc_gamma, spectral_stats
from capture_audiosync import gcc_phat, make_pair

have = os.path.isdir(SOUNDS_DIR)


def test_noise_is_unit_variance_and_wind_is_low_frequency():
    rng = np.random.default_rng(0)
    for kind in ("white", "wind"):
        assert noise(rng, 1 << 16, kind).std() == pytest.approx(1.0, rel=0.05)
    w = np.abs(np.fft.rfft(noise(rng, 1 << 16, "wind"))) ** 2
    f = np.fft.rfftfreq(1 << 16, 1 / 16000)
    assert w[f < 500].sum() > 0.9 * w.sum()


def test_snr_is_as_stated_on_a_tone():
    rng = np.random.default_rng(1)
    clip = np.sin(2 * np.pi * 440 * np.arange(32000) / 16000)
    a, b = pair_from_clip(clip, rng, 0.0, 1.0, 10.0)
    resid = a - clip[: len(a)]  # not aligned in start, so check power only
    assert 0.5 < a.std() / clip.std() < 2


def test_noiseless_delay_recovered_on_a_synthetic_clip():
    rng = np.random.default_rng(2)
    t = np.arange(16000 * 6) / 16000
    clip = np.random.default_rng(3).standard_normal(len(t)) * (0.6 + 0.4 * np.sin(5 * t) ** 2)
    clip /= np.abs(clip).max()
    for tau in (0.0, 0.31234, -0.2):
        assert error_ms(clip, rng, tau, 2.0, 80) < 0.05


def test_short_clip_rejected():
    with pytest.raises(ValueError):
        pair_from_clip(np.zeros(1000), np.random.default_rng(0), 0, 2.0, 0)


@pytest.mark.skipif(not have, reason="LibreOffice sounds not installed")
def test_real_clips_load_at_16k_with_expected_duration():
    clips = available_clips()
    assert len(clips) >= 5
    x = load_clip(os.path.join(SOUNDS_DIR, "applause.wav"))
    assert len(x) / 16000 == pytest.approx(4.1, abs=0.1)
    assert np.abs(x).max() == pytest.approx(1.0)


@pytest.mark.skipif(not have, reason="LibreOffice sounds not installed")
def test_real_clip_sync_at_high_snr():
    rng = np.random.default_rng(4)
    clips = available_clips()
    errs = [error_ms(c, rng, 0.8, 2.0, 30) for c in clips.values()]
    assert np.median(errs) < 1.0


def test_gamma_one_is_phat_and_flatness_orders_signals():
    rng = np.random.default_rng(5)
    a, b = make_pair(rng, 0.123, 2.0, 5.0)
    assert gcc_gamma(a, b, 1.0) == pytest.approx(gcc_phat(a, b), abs=1e-9)
    white = rng.standard_normal(32000)
    tone = np.sin(2 * np.pi * 440 * np.arange(32000) / 16000)
    assert spectral_stats(white)[0] > 0.5 > spectral_stats(tone)[0]
