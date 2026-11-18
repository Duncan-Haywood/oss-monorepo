"""Step 3g: the second-peak ratio and the self-periodicity flag."""
import os
import sys

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from capture_sync.sync import FS, gcc, gcc_peaks, second_peak_ratio  # noqa: E402
from capture_sync.gate import self_periodicity  # noqa: E402


def test_gcc_peaks_matches_gcc_bit_for_bit():
    rng = np.random.default_rng(0)
    for g in (1.0, 0.25):
        a = rng.standard_normal(FS)
        b = np.concatenate((rng.standard_normal(700), a, rng.standard_normal(5000)))
        b = b + 0.5 * rng.standard_normal(len(b))
        d1, p1 = gcc(a, b, gamma=g, max_lag_s=0.3, centre_s=0.3)
        d2, p2, s = gcc_peaks(a, b, gamma=g, max_lag_s=0.3, centre_s=0.3)
        assert d1 == d2 and p1 == p2 and 0.0 <= s < 0.5


def test_second_peak_ratio_basic():
    v = np.zeros(100)
    v[10], v[60] = 1.0, 0.9
    assert np.isclose(second_peak_ratio(v, 10, 5), 0.9)
    assert second_peak_ratio(v, 10, 60) == 0.0  # the second peak inside the exclusion is ignored
    assert second_peak_ratio(-np.ones(10), 0, 1) == 1.0


def test_repeating_sound_gives_two_equal_peaks():
    """A shared sound that loops with period P: the correlation has peaks P apart, so the ratio is near 1."""
    rng = np.random.default_rng(1)
    P = int(0.4 * FS)
    loop = np.tile(rng.standard_normal(P), 12)
    a = loop[:2 * FS]
    b = loop[1000:1000 + 2 * FS + 2 * int(0.6 * FS)]
    _, _, s = gcc_peaks(a, b, gamma=0.25, max_lag_s=0.6, centre_s=0.6)
    assert s > 0.9
    assert self_periodicity(a) > 0.9
    assert self_periodicity(rng.standard_normal(2 * FS)) < 0.15
