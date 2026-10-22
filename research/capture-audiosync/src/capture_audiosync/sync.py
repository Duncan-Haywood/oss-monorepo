"""Audio sync of two free-running cameras: GCC-PHAT delay per window, then a robust line fit.

Camera B hears camera A's sound delayed by tau(t) = d0 + e*t (e = relative clock error,
parts per million / 1e6). Everything here is synthetic audio; see the README."""
import numpy as np

FS = 16000


def fractional_delay(x, delay_s, fs=FS):
    """Delay x by delay_s (may be fractional, negative allowed) with an FFT phase ramp."""
    n = len(x)
    f = np.fft.rfftfreq(n, 1.0 / fs)
    return np.fft.irfft(np.fft.rfft(x) * np.exp(-2j * np.pi * f * delay_s), n)


def gcc_phat(a, b, fs=FS, max_lag_s=2.0, band=(100.0, 4000.0)):
    """Delay of b relative to a (seconds, positive = b later) by PHAT-weighted
    cross-correlation with parabolic peak interpolation. PHAT gives every frequency bin
    unit weight, so bins outside band (where speech has no energy) are zeroed first."""
    n = len(a) + len(b)
    nfft = 1 << (n - 1).bit_length()
    A, B = np.fft.rfft(a, nfft), np.fft.rfft(b, nfft)
    c = B * np.conj(A)
    c /= np.abs(c) + 1e-12
    f = np.fft.rfftfreq(nfft, 1.0 / fs)
    c[(f < band[0]) | (f > band[1])] = 0
    cc = np.fft.irfft(c, nfft)
    m = min(int(max_lag_s * fs), min(len(a), len(b)) - 1)   # a lag beyond the window has no overlap
    cc = np.concatenate((cc[-m:], cc[:m + 1]))
    k = int(np.argmax(cc))
    off = 0.0
    if 0 < k < len(cc) - 1:
        y0, y1, y2 = cc[k - 1], cc[k], cc[k + 1]
        den = y0 - 2 * y1 + y2
        if den != 0:
            off = 0.5 * (y0 - y2) / den
    return (k - m + off) / fs


def _fftconv(x, h):
    m = 1 << (len(x) + len(h) - 2).bit_length()
    return np.fft.irfft(np.fft.rfft(x, m) * np.fft.rfft(h, m), m)[:len(x)]


def _impulse(rng, rt60, ddr_db, fs=FS):
    """Direct path plus an exponentially decaying noise tail; ddr_db = direct-to-reverberant."""
    n = int(rt60 * fs)
    tail = rng.standard_normal(n) * np.exp(-6.9 * np.arange(n) / (rt60 * fs))
    tail *= 10 ** (-ddr_db / 20) / (np.sqrt(np.sum(tail ** 2)) + 1e-12)
    h = np.zeros(n + 1)
    h[0] = 1.0
    h[1:] += tail
    return h


def make_pair(rng, tau_s, win_s, snr_db, ddr_db=None, rt60=0.4, fs=FS):
    """One window heard by cameras A and B: the same source, B delayed by tau_s, each with
    independent wind/handling noise at snr_db (signal power over noise power) and,
    if ddr_db is given, its own room impulse response."""
    pad = int(3 * fs)
    n = int(win_s * fs) + 2 * pad
    src = rng.standard_normal(n)
    # speech-like: low-passed to ~4 kHz, slow amplitude modulation
    src = np.fft.irfft(np.fft.rfft(src) * (np.fft.rfftfreq(n, 1 / fs) < 4000), n)
    t = np.arange(n) / fs
    src *= 0.6 + 0.4 * np.sin(2 * np.pi * 3.0 * t + rng.uniform(0, 6.28)) ** 2
    a, b = src, fractional_delay(src, tau_s, fs)
    if ddr_db is not None:
        a = _fftconv(a, _impulse(rng, rt60, ddr_db, fs))
        b = _fftconv(b, _impulse(rng, rt60, ddr_db, fs))
    p = np.mean(a ** 2)
    sig = np.sqrt(p / 10 ** (snr_db / 10))
    a = a + sig * rng.standard_normal(n)
    b = b + sig * rng.standard_normal(n)
    return a[pad:-pad], b[pad:-pad]


def estimate_track(rng, d0_s, ppm, times_s, win_s, snr_db, ddr_db=None, fs=FS):
    """GCC-PHAT delay estimate at each time in times_s; true delay is d0 + ppm*1e-6*t."""
    true = d0_s + ppm * 1e-6 * np.asarray(times_s, float)
    est = []
    for tau in true:
        a, b = make_pair(rng, tau, win_s, snr_db, ddr_db, fs=fs)
        est.append(gcc_phat(a, b, fs))
    return true, np.array(est)


def fit_track(times_s, est):
    """Theil-Sen line (median of pairwise slopes), robust to a minority of false peaks."""
    t = np.asarray(times_s, float)
    i, j = np.triu_indices(len(t), 1)
    slope = np.median((est[j] - est[i]) / (t[j] - t[i]))
    icpt = np.median(est - slope * t)
    return icpt, slope


def trial(seed, d0_s=0.8, ppm=40.0, span_s=3600.0, n_win=12, win_s=2.0, snr_db=0.0,
          ddr_db=None, fps=30.0):
    """One trial. Returns dict: share of single windows off by more than one frame, and the
    worst error over the span of (a) the fitted line, (b) an offset-only sync from the first window."""
    rng = np.random.default_rng(seed)
    times = np.linspace(0, span_s, n_win)
    true, est = estimate_track(rng, d0_s, ppm, times, win_s, snr_db, ddr_db)
    frame = 1.0 / fps
    icpt, slope = fit_track(times, est)
    fit_err = np.abs(icpt + slope * times - true)
    off_err = np.abs(est[0] - true)
    return {"window_bad": float(np.mean(np.abs(est - true) > frame)),
            "fit_max_ms": float(fit_err.max() * 1e3),
            "offset_only_max_ms": float(off_err.max() * 1e3),
            "slope_err_ppm": float(abs(slope - ppm * 1e-6) * 1e6)}


def resync_interval_s(ppm, tol_s):
    """Seconds until an offset-only sync drifts past tol_s (analytic: tol / e)."""
    return float("inf") if ppm == 0 else tol_s / (abs(ppm) * 1e-6)
