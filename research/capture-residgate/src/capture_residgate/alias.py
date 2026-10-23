"""Why does a tight tolerance drop windows from a correct-looking clip? Period aliasing in the GCC peak.

A clip whose autocorrelation has a second peak almost as high as the first (a tone, a hum, a loop) gives the
cross-correlation a copy of the true peak one period away, and noise can make the copy win. The error is then
a multiple of the period, not random."""
import numpy as np

FS = 16000


def dominant_period(clip, fs=FS, lo_ms=2.0, hi_ms=60.0):
    """(lag in ms, normalised autocorrelation there) of the highest autocorrelation peak between lo_ms and hi_ms."""
    x = np.asarray(clip, float)
    x = x - x.mean()
    f = np.fft.rfft(x, 2 * len(x))
    ac = np.fft.irfft(f * np.conj(f))[:len(x)]
    ac = ac / ac[0]
    lo, hi = int(lo_ms * 1e-3 * fs), int(hi_ms * 1e-3 * fs)
    k = lo + int(np.argmax(ac[lo:hi]))
    return k / fs * 1e3, float(ac[k])


def classify(err_ms, period_ms, tol_ms=2.0, near_ms=0.5, max_k=8):
    """Split delay errors into ok (within tol_ms), alias (within near_ms of k*period, k=1..max_k) and gross.
    Returns shares (ok, alias, gross) of the errors."""
    e = np.abs(np.asarray(err_ms, float))
    ok = e <= tol_ms
    ks = np.arange(1, max_k + 1) * period_ms
    alias = ~ok & (np.abs(e[:, None] - ks[None, :]) <= near_ms).any(axis=1)
    return float(ok.mean()), float(alias.mean()), float((~ok & ~alias).mean())
