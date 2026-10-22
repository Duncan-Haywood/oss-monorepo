"""Reverberant two-camera audio sync: fixed-gamma GCC vs a per-window gamma chosen by
peak-to-sidelobe ratio (PSR), a label-free score.

Room model: each camera has its own impulse response h = delta + tail, where the tail is
Gaussian noise under an exponential envelope with decay set by RT60 (60 dB in RT60 s), starting
5 ms after the direct path, scaled so direct-to-reverberant energy ratio is DRR dB (Schroeder's
statistical model of late reverberation). It is a model of a room, not a measured room."""
import numpy as np
from capture_audiosync import fractional_delay
from capture_realaudio import noise
from capture_realaudio.real import FS

GAMMAS = (1.0, 0.75, 0.5, 0.25, 0.0)


def rir(rng, rt60, drr_db, fs=FS):
    """Direct path (1 at t=0) plus an exponentially decaying noise tail with energy 10^(-DRR/10)."""
    n = int(rt60 * fs * 1.0) + 1
    t = np.arange(n) / fs
    tail = rng.standard_normal(n) * np.exp(-6.9078 * t / rt60)   # amplitude -60 dB at RT60
    tail[: int(0.005 * fs)] = 0.0
    tail *= np.sqrt(10 ** (-drr_db / 10) / np.sum(tail ** 2))
    h = tail
    h[0] = 1.0
    return h


def reverberate(x, h):
    n = len(x) + len(h) - 1
    nfft = 1 << (n - 1).bit_length()
    return np.fft.irfft(np.fft.rfft(x, nfft) * np.fft.rfft(h, nfft), nfft)[: len(x)]


def reverb_pair(clip, rng, tau_s, win_s, snr_db, rt60, drr_db, kind="white", fs=FS):
    """Camera A hears the clip through room response hA; B hears it delayed by tau through hB.
    SNR is reverberant-signal power over noise power. rt60 = 0 means a dry room."""
    pad = int(0.5 * fs)
    n = int(win_s * fs) + 2 * pad
    s0 = int(rng.integers(0, len(clip) - n + 1))
    seg = clip[s0:s0 + n]
    a, b = seg, fractional_delay(seg, tau_s, fs)
    if rt60 > 0:
        a, b = reverberate(a, rir(rng, rt60, drr_db, fs)), reverberate(b, rir(rng, rt60, drr_db, fs))
    sig = np.sqrt(np.mean(a ** 2) / 10 ** (snr_db / 10))
    a = a + sig * noise(rng, n, kind, fs)
    b = b + sig * noise(rng, n, kind, fs)
    return a[pad:-pad], b[pad:-pad]


def gcc_curve(a, b, gamma, fs=FS, max_lag_s=2.0, band=(100.0, 4000.0)):
    """Generalised cross-correlation over lags -m..m (as capture_realaudio.gcc_gamma); returns (cc, m)."""
    n = len(a) + len(b)
    nfft = 1 << (n - 1).bit_length()
    c = np.fft.rfft(b, nfft) * np.conj(np.fft.rfft(a, nfft))
    c = c / (np.abs(c) + 1e-12) ** gamma
    f = np.fft.rfftfreq(nfft, 1.0 / fs)
    c[(f < band[0]) | (f > band[1])] = 0
    cc = np.fft.irfft(c, nfft)
    m = min(int(max_lag_s * fs), min(len(a), len(b)) - 1)
    return np.concatenate((cc[-m:], cc[:m + 1])), m


def pick_peak(cc, m, fs=FS):
    k = int(np.argmax(cc))
    off = 0.0
    if 0 < k < len(cc) - 1:
        y0, y1, y2 = cc[k - 1], cc[k], cc[k + 1]
        den = y0 - 2 * y1 + y2
        if den != 0:
            off = 0.5 * (y0 - y2) / den
    return (k - m + off) / fs


def psr(cc, exclude=32):
    """Peak-to-sidelobe ratio: highest |cc| over the largest value outside +-exclude lags (2 ms)."""
    k = int(np.argmax(cc))
    side = np.concatenate((cc[:max(k - exclude, 0)], cc[k + exclude + 1:]))
    return float(cc[k] / (np.abs(side).max() + 1e-12))


def estimate(a, b, gamma, win_s, fs=FS):
    cc, m = gcc_curve(a, b, gamma, fs, max_lag_s=win_s)
    return pick_peak(cc, m, fs)


def adaptive_estimate(a, b, win_s, gammas=GAMMAS, fs=FS):
    """Delay from the gamma whose correlation curve has the highest PSR. Returns (delay, gamma)."""
    best = None
    for g in gammas:
        cc, m = gcc_curve(a, b, g, fs, max_lag_s=win_s)
        s = psr(cc)
        if best is None or s > best[0]:
            best = (s, pick_peak(cc, m, fs), g)
    return best[1], best[2]
