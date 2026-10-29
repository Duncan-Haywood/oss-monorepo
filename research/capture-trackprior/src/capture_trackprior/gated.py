"""Gated tracking: keep the prior, but re-acquire when the unrestricted peak is clearly stronger.

track_camera (track.py) keeps every estimate, so an early alias becomes an hour-long lock-in. Here each window after
the bootstrap is searched twice, inside the predicted prior and over +-full_half; if the unrestricted correlation peak
is more than `ratio` times the height of the best peak inside the prior, the prior is judged wrong and the
unrestricted peak is taken. Only accepted estimates (restricted ones, or re-acquired ones) join the history, and a
re-acquisition clears it, so the line restarts from the new estimate."""
import numpy as np
from capture_aliaswin.aliaswin import FS
from .track import predict


def gcc_curve(a, b, gamma, fs=FS, band=(100.0, 4000.0)):
    """(lags in s, partially whitened GCC) as capture_aliaswin.gcc_search computes it, before peak picking."""
    n = len(a) + len(b)
    nfft = 1 << (n - 1).bit_length()
    A, B = np.fft.rfft(a, nfft), np.fft.rfft(b, nfft)
    c = B * np.conj(A)
    c = c / (np.abs(c) + 1e-12) ** gamma
    f = np.fft.rfftfreq(nfft, 1.0 / fs)
    c[(f < band[0]) | (f > band[1])] = 0
    cc = np.fft.irfft(c, nfft)
    lag = np.arange(nfft)
    lag = np.where(lag >= nfft // 2, lag - nfft, lag)
    ok = np.abs(lag) < min(len(a), len(b))
    return lag[ok] / fs, cc[ok]


def _peak(lags, cc, centre, half, fs=FS):
    """(delay s with parabolic refinement, height) of the largest peak in centre +- half."""
    idx = np.where((lags >= centre - half) & (lags <= centre + half))[0]
    if len(idx) == 0:
        raise ValueError("prior outside the window's lags")
    k = idx[int(np.argmax(cc[idx]))]
    off = 0.0
    if 0 < k < len(cc) - 1:
        den = cc[k - 1] - 2 * cc[k] + cc[k + 1]
        if den != 0:
            off = 0.5 * (cc[k - 1] - cc[k + 1]) / den
    return float(lags[k] + off / fs), float(cc[k])


def track_gated(windows, times, gamma, boot, ratio, full_half=1.5, keep=6):
    """Estimates (s) for each (a, b) window, and a bool array: True where the prior was overridden (re-acquired)."""
    est, reacq = [], []
    ht, hd = [], []               # accepted history (times, delays)
    for k, (a, b) in enumerate(windows):
        lags, cc = gcc_curve(a, b, gamma)
        d_full, p_full = _peak(lags, cc, 0.0, full_half)
        if k < boot or not ht:
            d, re = d_full, False
            ht, hd = ht + [times[k]], hd + [d]
        else:
            c, h = predict(ht, hd, times[k], keep=keep)
            try:
                d_in, p_in = _peak(lags, cc, c, h)
            except ValueError:
                d_in, p_in = d_full, p_full
            if p_full > ratio * p_in:
                d, re = d_full, True
                ht, hd = [times[k]], [d]
            else:
                d, re = d_in, False
                ht, hd = ht + [times[k]], hd + [d]
        est.append(d)
        reacq.append(re)
    return np.array(est), np.array(reacq)
