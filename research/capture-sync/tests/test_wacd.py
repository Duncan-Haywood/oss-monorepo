"""Step 4d: the port of paderwasn's online WACD, coarse sync and SRO simulator (src/capture_sync/wacd.py)."""
import os
import sys

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from capture_sync import wacd as W  # noqa: E402
from capture_sync.sync import gcc  # noqa: E402

FS = 16000


def _noise(sec, seed=0):
    return np.random.default_rng(seed).standard_normal(int(sec * FS))


def test_sim_sro_delay_grows_as_eps_t():
    x = _noise(120)
    y = W.sim_sro(x, 200.0)
    for t in (10, 60, 110):
        a = x[t * FS:t * FS + 2 * FS]
        b = y[t * FS - FS:t * FS + 3 * FS]
        d, _ = gcc(a, b, gamma=1.0, max_lag_s=1.0, centre_s=1.0)
        assert abs((d - 1.0) - 200e-6 * t) < 2e-4


def test_coarse_sync_offset_sign_and_value():
    x = _noise(30, 1)
    y = np.concatenate([_noise(0.75, 2), x])[:len(x)]  # y lags x by 12000 samples
    assert W.coarse_sync_offset(y, x) == 12000
    assert W.coarse_sync_offset(x, y) == -12000


def test_stft_shape_and_window():
    S = W.stft(np.ones(16384))
    assert S.shape == (9, 4097)
    assert np.allclose(S[0, 0], S[-1, 0])


def test_online_wacd_recovers_constant_sro():
    x = _noise(60, 3)
    y = W.sim_sro(x, 80.0)
    est, tau, centres = W.online_wacd(y, x[:len(y)])
    assert len(est) > 100
    assert abs(np.median(est[60:]) - 80.0) < 3.0
    # the running shift follows eps * t
    assert abs(tau[-1] - 80e-6 * centres[-1]) < 8.0


def test_frame_cache_matches_stft():
    x, r = _noise(4, 4), _noise(4, 5)
    F, R = W._Frames(x), W._Frames(r)
    for s in (0, 2048, 4096 + 3):
        want = W._coherence(x[s:s + 16384], r[s:s + 16384])
        got = W._coherence_spec(F.seg(s, 16384), R.seg(s, 16384))
        assert np.allclose(want, got)
