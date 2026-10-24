import numpy as np
from capture_residgate.alias import dominant_period, classify


def test_period_of_a_tone_plus_noise():
    fs = 16000
    t = np.arange(fs * 4) / fs
    x = np.sin(2 * np.pi * 80 * t) + 0.05 * np.random.default_rng(0).standard_normal(len(t))
    p, r = dominant_period(x)
    assert abs(p - 12.5) < 0.2 and r > 0.9


def test_white_noise_has_no_strong_period():
    _, r = dominant_period(np.random.default_rng(1).standard_normal(16000 * 4))
    assert r < 0.1


def test_classify_splits_three_ways():
    ok, alias, gross = classify([0.1, -0.3, 12.2, -24.0, 300.0, 7.0], 12.1)
    assert (ok, alias, gross) == (2 / 6, 2 / 6, 2 / 6)
