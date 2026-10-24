import numpy as np
from capture_aliaswin import pair_at, gcc_search, start_bin


def noise_clip(seed=0, n=16000 * 6):
    return np.random.default_rng(seed).standard_normal(n) * 0.3


def test_unrestricted_search_recovers_delay_on_clean_noise():
    rng = np.random.default_rng(1)
    a, b, s = pair_at(noise_clip(), rng, 0.123456, 2.0, 30)
    assert abs(gcc_search(a, b, 0.25) - 0.123456) < 2e-4
    assert 0 <= s <= 6 - 3.0 + 1e-9


def test_prior_excludes_a_stronger_false_peak():
    """A delayed copy at 0.3 s louder than the true 0.1 s one: unrestricted picks 0.3, restricted picks 0.1."""
    rng = np.random.default_rng(2)
    x = rng.standard_normal(16000 * 2)
    fs = 16000
    a = x
    b = np.zeros_like(x)
    b[int(0.1 * fs):] += 0.5 * x[:-int(0.1 * fs)]
    b[int(0.3 * fs):] += 1.0 * x[:-int(0.3 * fs)]
    assert abs(gcc_search(a, b, 0.0, 0.0, 1.0) - 0.3) < 1e-3
    assert abs(gcc_search(a, b, 0.0, 0.1, 0.05) - 0.1) < 1e-3


def test_negative_delay_and_bins():
    rng = np.random.default_rng(3)
    x = rng.standard_normal(16000)
    assert abs(gcc_search(np.roll(x, 40), x, 0.0, 0.0, 0.5) - (-40 / 16000)) < 1e-5
    assert [start_bin(s) for s in (0.1, 0.5, 0.9, 1.0, 2.0)] == [0, 1, 1, 2, 2]
