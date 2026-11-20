"""Step 4a: the fingerprint and feature baselines recover a known delay and keep sync.gcc's lag convention."""
import os
import sys

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from capture_sync.sync import FS, gcc  # noqa: E402
from capture_sync import fingerprint as FP  # noqa: E402


def _pair(seed, lag_s, n_s=2.0, search_s=1.5):
    """A speech-like signal (bursts of filtered noise with a syllable-rate envelope) and a longer second
    stretch in which it starts lag_s later, in gcc's convention (lag 0: a[0] lines up with b[0])."""
    rng = np.random.default_rng(seed)
    n, g = int(n_s * FS), int(search_s * FS)
    tot = n + 2 * g
    x = np.convolve(rng.standard_normal(tot + 400), np.hanning(9), "same")[:tot]
    t = np.arange(tot) / FS
    env = np.clip(np.sin(2 * np.pi * 3.7 * t + rng.uniform(0, 6)), 0, None) ** 2
    x = x * (0.05 + env) * (1 + 0.5 * np.sin(2 * np.pi * 0.6 * t))
    k = int(round(lag_s * FS))
    a = x[g:g + n]
    b = np.concatenate((np.zeros(max(0, k - g)), x))[:n + 2 * g]
    return a, b, rng


def test_every_method_finds_the_lag_within_a_frame():
    for seed, lag in ((0, 1.9), (1, 2.4), (2, 1.6)):
        a, b, rng = _pair(seed, lag)
        b = b + 0.01 * rng.standard_normal(len(b))
        d0, _ = gcc(a, b, gamma=0.25, max_lag_s=1.5, centre_s=1.5)
        for name, (d, c) in {"flat": FP.feature_xcorr(a, b, "flat", max_lag_s=1.5, centre_s=1.5),
                             "energy": FP.feature_xcorr(a, b, "energy", max_lag_s=1.5, centre_s=1.5),
                             "wang": FP.landmarks(a, b, max_lag_s=1.5, centre_s=1.5),
                             "hk": FP.hk_xcorr(a, b, max_lag_s=1.5, centre_s=1.5)}.items():
            assert abs(d - d0) < 1 / 30, (name, seed, d, d0)
            assert c > 0, name


def test_landmarks_with_nothing_shared_give_no_confident_lag():
    rng = np.random.default_rng(3)
    a = np.zeros(2 * FS)  # digital silence has no spectral peaks inside the band worth hashing
    b = rng.standard_normal(5 * FS)
    d, c = FP.landmarks(a, b, max_lag_s=1.5, centre_s=1.5)
    assert np.isnan(d) or c <= 1


def test_hk_bits_shape_and_balance():
    rng = np.random.default_rng(4)
    bits = FP.hk_bits(rng.standard_normal(2 * FS))
    assert bits.shape[1] == 32
    assert 0.3 < bits.mean() < 0.7


def test_flatness_is_zero_db_for_a_flat_spectrum_and_lower_for_a_tone():
    rng = np.random.default_rng(5)
    white = FP.frame_feature(rng.standard_normal(FS), "flat")
    tone = FP.frame_feature(np.sin(2 * np.pi * 1000 * np.arange(FS) / FS), "flat")
    assert np.median(white) > -3.0
    assert np.median(tone) < np.median(white) - 10.0
