"""Step 6b: session trackers started from a coarse offset and rate (capture_sync.track)."""
import os
import sys

import numpy as np
import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from capture_sync.track import track, FRAME  # noqa: E402

FS = 16000


def _pair(d, eps_ppm, sec=80, seed=0, burst=None):
    """a: white source; b: the same source, delay d at a-time 0, b's clock eps slow. `burst` (t0, t1): a loud
    shared interferer in b only, which pulls windows there onto a wrong peak."""
    rng = np.random.default_rng(seed)
    n = sec * FS
    x = rng.standard_normal(n + 8 * FS)
    t = np.arange(n) / FS
    a = x[4 * FS:4 * FS + n] + 0.3 * rng.standard_normal(n)
    b = np.interp((t * (1 - eps_ppm * 1e-6) - d + 4.0) * FS, np.arange(len(x)), x) + 0.3 * rng.standard_normal(n)
    if burst:
        i, j = int(burst[0] * FS), int(burst[1] * FS)
        b[i:j] = 30 * np.interp((t[i:j] - 0.6 + 4.0) * FS, np.arange(len(x)), x)  # a copy 0.6 s later
    return a, b


def _truth(t, d, eps_ppm):
    return (t + d) / (1 - eps_ppm * 1e-6) - t


def test_hold_is_the_coarse_line():
    t = np.arange(20.0, 60.0)
    pr, s = track(np.zeros(FS), np.zeros(FS), 0.5, 1e-4, t, mode="hold")
    assert np.allclose(pr, 0.5 + 1e-4 * (t - 10.0)) and s == 1e-4


@pytest.mark.parametrize("mode", ["kr", "gated"])
def test_tracks_a_drifting_pair_from_a_good_start(mode):
    d, eps = 0.4, 300.0
    a, b = _pair(d, eps)
    t = np.arange(20.0, 70.0)
    pr, s = track(a, b, _truth(10.0, d, eps), eps * 1e-6, t, mode=mode)
    assert np.max(np.abs(pr - _truth(t, d, eps))) < FRAME / 4
    assert abs(s * 1e6 - eps) < 20


def test_gate_rejects_windows_far_from_the_line():
    d, eps = 0.4, 100.0
    a, b = _pair(d, eps, burst=(30.0, 50.0))
    t = np.arange(20.0, 75.0)
    pr, _ = track(a, b, _truth(10.0, d, eps), eps * 1e-6, t, mode="gated")
    assert np.max(np.abs(pr - _truth(t, d, eps))) < FRAME


def test_unknown_mode():
    with pytest.raises(ValueError):
        track(np.zeros(FS), np.zeros(FS), 0.0, 0.0, [20.0], mode="nope")
