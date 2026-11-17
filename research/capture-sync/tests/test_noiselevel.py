"""Step 3e: the minimum-statistics level estimate ranks noise levels from the seconds before a window."""
import numpy as np
from capture_sync.gate import min_stats_snr_db


def _bursty(rng, n, fs=16000):
    """Speech-like on/off signal: 300 ms bursts of coloured noise with 200 ms pauses."""
    s = np.zeros(n)
    on = (np.arange(n) // int(0.1 * fs)) % 5 < 3
    s[on] = np.convolve(rng.standard_normal(n), np.ones(8) / 8, "same")[on]
    return s


def test_ranks_white_noise_levels_monotonically():
    rng = np.random.default_rng(0)
    n_ctx, n_win = 4 * 16000, 2 * 16000
    s = _bursty(rng, n_ctx + n_win)
    ps = np.mean(s[n_ctx:] ** 2)
    est = []
    for snr in (20, 10, 0, -10):
        z = rng.standard_normal(len(s)) * np.sqrt(ps / 10 ** (snr / 10))
        est.append(min_stats_snr_db(s + z, n_win))
    assert all(a > b for a, b in zip(est, est[1:])), est
    assert est[0] - est[-1] > 10  # uncorrected minimum bias compresses the low end


def test_pure_noise_reads_low_and_window_tracks_its_end():
    rng = np.random.default_rng(1)
    z = rng.standard_normal(6 * 16000)
    assert min_stats_snr_db(z, 2 * 16000) < 10
    loud = np.concatenate([z[:4 * 16000], 10 * z[4 * 16000:]])  # floor rises inside the window
    assert np.isfinite(min_stats_snr_db(loud, 2 * 16000))
