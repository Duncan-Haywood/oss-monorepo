"""Step 3h: the envelope-normalised estimator and the sub-window delays."""
import os
import sys

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from capture_sync.sync import FS, gcc, envelope_normalise, subwindow_delays  # noqa: E402


def test_envelope_normalise_flattens_a_burst():
    rng = np.random.default_rng(0)
    x = rng.standard_normal(FS)
    x[8000:8200] *= 100.0  # a 12 ms burst 40 dB up
    y = envelope_normalise(x)
    w = int(0.032 * FS)
    p = np.array([np.mean(y[i:i + w] ** 2) for i in range(0, len(y) - w, w)])
    assert p.max() / np.median(p) < 3.0  # every 32 ms stretch near unit power
    assert np.all(np.isfinite(y))


def test_envelope_normalise_keeps_silence_finite():
    x = np.zeros(FS)
    x[100:200] = 1.0
    y = envelope_normalise(x)
    assert np.all(np.isfinite(y)) and np.abs(y).max() < 1e4


def test_envelope_normalise_rescues_a_click_train_at_each_device():
    """A shared broadband signal at lag k, plus a loud train of one repeated click (a key) at each device,
    the two trains offset by a wrong lag: raw GCC locks on the clicks, the normalised one on the signal."""
    rng = np.random.default_rng(3)
    G, n, k, kw = int(0.5 * FS), 2 * FS, 9000, 3000
    s = rng.standard_normal(n + 2 * G)
    a = s[k:k + n].copy()
    b = s.copy()  # a[i] = b[i + k]
    click = 300.0 * rng.standard_normal(40)
    for t in range(500, n - 500, 3700):
        a[t:t + 40] += click
        b[t + kw:t + kw + 40] += click
    d_raw, _ = gcc(a, b, gamma=0.25, max_lag_s=0.5, centre_s=0.5)
    d_fn, _ = gcc(envelope_normalise(a), envelope_normalise(b), gamma=0.25, max_lag_s=0.5, centre_s=0.5)
    assert abs(d_raw * FS - kw) < 2  # raw locks on the clicks
    assert abs(d_fn * FS - k) < 2  # normalised finds the shared signal


def test_subwindow_delays_share_the_full_lag_axis():
    rng = np.random.default_rng(1)
    G, n, k = int(0.5 * FS), 2 * FS, 9000
    s = rng.standard_normal(n + 2 * G)
    a = s[k:k + n]
    b = s  # a[i] = b[i + k]
    d, _ = gcc(a, b, gamma=0.25, max_lag_s=0.5, centre_s=0.5)
    subs = subwindow_delays(a, b, 0.25, (0.0, 0.5, 1.0), 1.0, 0.5, 0.5)
    assert abs(d * FS - k) < 1
    assert all(abs(x - d) < 1 / FS for x in subs)
