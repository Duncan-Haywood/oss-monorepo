import os
import numpy as np
import pytest
from capture_reverbsync import rir, reverberate, reverb_pair, estimate, adaptive_estimate, psr, gcc_curve
from capture_realaudio import gcc_gamma
from capture_realaudio.real import SOUNDS_DIR, available_clips

FS = 16000


def test_rir_drr_and_decay():
    rng = np.random.default_rng(0)
    h = rir(rng, 0.5, 0.0)
    tail = h.copy(); tail[0] = 0
    assert h[0] == 1.0
    assert np.sum(tail ** 2) == pytest.approx(1.0, rel=1e-6)          # DRR 0 dB
    e = np.cumsum(tail[::-1] ** 2)[::-1]                              # Schroeder integral
    t60_pt = np.argmax(10 * np.log10(e / e[0]) < -30) / FS * 2        # -30 dB point, doubled
    assert 0.3 < t60_pt < 0.7


def test_reverberate_identity_and_length():
    x = np.random.default_rng(1).standard_normal(1000)
    assert np.allclose(reverberate(x, np.array([1.0])), x)
    assert len(reverberate(x, np.ones(50))) == 1000


def test_estimate_matches_gcc_gamma():
    rng = np.random.default_rng(2)
    a = rng.standard_normal(2 * FS)
    from capture_audiosync import fractional_delay
    b = fractional_delay(a, 0.3, FS)
    for g in (1.0, 0.25):
        assert estimate(a, b, g, 2.0) == pytest.approx(gcc_gamma(a, b, g, max_lag_s=2.0))
    assert estimate(a, b, 1.0, 2.0) == pytest.approx(0.3, abs=1e-4)


def test_psr_high_for_sharp_peak():
    cc = np.zeros(1000); cc[500] = 1.0; cc[100] = 0.2
    assert psr(cc) == pytest.approx(5.0)


def test_adaptive_finds_delay_on_clean_noise():
    rng = np.random.default_rng(3)
    clip = rng.standard_normal(5 * FS)
    a, b = reverb_pair(clip, rng, 0.4, 2.0, 20, 0.0, 0.0)
    d, g = adaptive_estimate(a, b, 2.0)
    assert d == pytest.approx(0.4, abs=1e-3) and g in (1.0, 0.75, 0.5, 0.25, 0.0)


def test_reverb_pair_runs_dry_and_wet():
    rng = np.random.default_rng(4)
    clip = rng.standard_normal(6 * FS)
    reverb_pair(clip, rng, 0.5, 2.0, 10, 1.0, -5)


@pytest.mark.skipif(not os.path.isdir(SOUNDS_DIR), reason="no LibreOffice sounds")
def test_real_clip_runs():
    clips = available_clips()
    c = next(iter(clips.values()))
    rng = np.random.default_rng(5)
    a, b = reverb_pair(c, rng, 0.5, 2.0, 10, 0.6, 0.0)
    assert np.isfinite(estimate(a, b, 0.25, 2.0))
