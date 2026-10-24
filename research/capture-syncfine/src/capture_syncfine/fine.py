"""Coarse-to-fine audio sync. Reuses capture_audiosync (GCC-PHAT, Theil-Sen, synthetic audio).

Plain (capture-audiosync): every window is cut at the same time on both cameras, so a start offset
d0 longer than the window leaves no overlap. Coarse-to-fine: one long window at t=0 gives d0; every
later window on camera B is cut d0 earlier, so only the residual (drift, up to ppm*t) is left
and short windows overlap fully. Simulated as make_pair(residual) with the same window length."""
import numpy as np
from capture_audiosync import make_pair, gcc_phat, fit_track

LONG_S = 10.0   # coarse window length


def coarse_offset(rng, d0_s, snr_db, ddr_db=None, long_s=LONG_S):
    a, b = make_pair(rng, d0_s, long_s, snr_db, ddr_db)
    return gcc_phat(a, b, max_lag_s=long_s / 2)


def audio_seconds(n_win, win_s, coarse=False, long_s=LONG_S):
    return n_win * win_s + (long_s if coarse else 0.0)


def _score(times, est, true, frame, ppm):
    icpt, slope = fit_track(times, est)
    err = np.abs(icpt + slope * times - true)
    return {"window_bad": float(np.mean(np.abs(est - true) > frame)),
            "fit_max_ms": float(err.max() * 1e3),
            "fit_ok": bool(err.max() < frame)}


def trial_plain(seed, d0_s=0.8, ppm=40.0, span_s=3600.0, n_win=12, win_s=1.0, snr_db=0.0, ddr_db=None, fps=30.0):
    rng = np.random.default_rng(seed)
    times = np.linspace(0, span_s, n_win)
    true = d0_s + ppm * 1e-6 * times
    est = np.array([gcc_phat(*make_pair(rng, tau, win_s, snr_db, ddr_db)) for tau in true])
    return _score(times, est, true, 1 / fps, ppm)


def trial_coarse_fine(seed, d0_s=0.8, ppm=40.0, span_s=3600.0, n_win=12, win_s=1.0, snr_db=0.0, ddr_db=None, fps=30.0):
    rng = np.random.default_rng(seed)
    times = np.linspace(0, span_s, n_win)
    true = d0_s + ppm * 1e-6 * times
    d_hat = coarse_offset(rng, d0_s, snr_db, ddr_db)
    est = np.array([d_hat + gcc_phat(*make_pair(rng, tau - d_hat, win_s, snr_db, ddr_db)) for tau in true])
    out = _score(times, est, true, 1 / fps, ppm)
    out["coarse_err_ms"] = float(abs(d_hat - d0_s) * 1e3)
    return out
