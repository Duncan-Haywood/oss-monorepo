"""Step 6a: the joint lag-and-rate coarse search (sync.rate_lag_search)."""
import os
import sys

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from capture_sync.sync import rate_lag_search, gcc, gcc_curve  # noqa: E402

FS = 16000


def _pair(d, eps_ppm, sec=20, snr_noise=0.5, seed=0):
    """a: white source; b: the same source delayed d s at a-time 0 and drifting eps (b's clock slow)."""
    rng = np.random.default_rng(seed)
    n = sec * FS
    x = rng.standard_normal(n + 8 * FS)
    t = np.arange(n) / FS
    a = x[4 * FS:4 * FS + n]
    b = np.interp((t * (1 - eps_ppm * 1e-6) - d + 4.0) * FS, np.arange(len(x)), x)
    return a + snr_noise * rng.standard_normal(n), b + snr_noise * rng.standard_normal(n)


def _truth_centre(d, eps_ppm, sec=20):
    u = sec / 2
    return (u + d) / (1 - eps_ppm * 1e-6) - u


def test_recovers_drift_where_plain_gcc_smears():
    a, b = _pair(0.7, 300.0)
    d, s, _ = rate_lag_search(a, b, max_lag_s=5.0)
    assert abs(d - _truth_centre(0.7, 300.0)) < 1e-4
    assert abs(s - 300.0) <= 5.0
    d0, _ = gcc(a, b, gamma=0.25, max_lag_s=5.0)
    assert abs(d0 - _truth_centre(0.7, 300.0)) > 1 / 30  # the smeared full window misses by a frame


def test_negative_rate_and_lag():
    a, b = _pair(-1.3, -150.0, seed=3)
    d, s, _ = rate_lag_search(a, b, max_lag_s=5.0)
    assert abs(d - _truth_centre(-1.3, -150.0)) < 1e-4
    assert abs(s + 150.0) <= 5.0


def test_no_drift_matches_full_window():
    a, b = _pair(0.25, 0.0, seed=5)
    d, s, _ = rate_lag_search(a, b, max_lag_s=5.0)
    d0, _ = gcc(a, b, gamma=0.25, max_lag_s=5.0)
    assert abs(s) <= 5.0 and abs(d - d0) < 1e-4


def test_rate_zero_gamma_zero_is_full_correlation():
    """With gamma 0 and rate 0 the summed sub-window curves equal the full-window correlation (sub-windows of a
    zero-mean signal, so mean removal changes little): same argmax lag."""
    a, b = _pair(0.4, 0.0, seed=7, snr_noise=2.0)
    a = a - a.mean()
    d, _, _ = rate_lag_search(a, b, gamma=0.0, rates_ppm=[0.0], max_lag_s=2.0)
    lags, v = gcc_curve(a, b, gamma=0.0, max_lag_s=2.0)
    assert abs(d - lags[np.argmax(v)] / FS) < 2 / FS
