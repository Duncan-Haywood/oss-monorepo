"""Windowed GCC delay estimates on a real clip, with the window's start time kept and an optional delay prior.

capture-residgate (section D) found that most windows it dropped were wrong, not noisy: period aliases in
`space2` and `wallewal`, early-start failures in `untie` and `soft`. Here the window length, gamma and a search
restricted to a prior delay are varied one at a time to see which removes them."""
import numpy as np
from capture_audiosync import fractional_delay
from capture_realaudio.real import FS, noise
from capture_residgate.alias import classify

PAD_S = 0.5
START_BINS = (0.5, 1.0)       # window start (s) edges: first half second, then to 1 s, then later


def pair_at(clip, rng, tau_s, win_s, snr_db, fs=FS):
    """Like capture_realaudio.pair_from_clip (white noise) but also returns the window start in s."""
    pad = int(PAD_S * fs)
    n = int(win_s * fs) + 2 * pad
    if len(clip) < n:
        raise ValueError("clip too short")
    s0 = int(rng.integers(0, len(clip) - n + 1))
    seg = clip[s0:s0 + n]
    a, b = seg, fractional_delay(seg, tau_s, fs)
    sig = np.sqrt(np.mean(seg ** 2) / 10 ** (snr_db / 10))
    a = a + sig * noise(rng, n, "white", fs)
    b = b + sig * noise(rng, n, "white", fs)
    return a[pad:-pad], b[pad:-pad], s0 / fs


def gcc_search(a, b, gamma, center_s=0.0, half_s=1.5, fs=FS, band=(100.0, 4000.0)):
    """Partially whitened GCC delay (s), peak picked only within center_s +- half_s (parabolic refinement).
    half_s large and center_s 0 is the unrestricted search of capture_realaudio.gcc_gamma."""
    n = len(a) + len(b)
    nfft = 1 << (n - 1).bit_length()
    A, B = np.fft.rfft(a, nfft), np.fft.rfft(b, nfft)
    c = B * np.conj(A)
    c = c / (np.abs(c) + 1e-12) ** gamma
    f = np.fft.rfftfreq(nfft, 1.0 / fs)
    c[(f < band[0]) | (f > band[1])] = 0
    cc = np.fft.irfft(c, nfft)
    lag = np.arange(nfft)
    lag = np.where(lag >= nfft // 2, lag - nfft, lag)             # samples, signed
    lo, hi = (center_s - half_s) * fs, (center_s + half_s) * fs
    ok = (lag >= lo) & (lag <= hi) & (np.abs(lag) < min(len(a), len(b)))
    idx = np.where(ok)[0]
    k = idx[int(np.argmax(cc[idx]))]
    off = 0.0
    y0, y1, y2 = cc[(k - 1) % nfft], cc[k], cc[(k + 1) % nfft]
    den = y0 - 2 * y1 + y2
    if den != 0:
        off = 0.5 * (y0 - y2) / den
    return (lag[k] + off) / fs


def start_bin(start_s):
    return int(np.searchsorted(START_BINS, start_s, side="right"))


def shares(err_ms, period_ms, tol_ms=2.0):
    """(ok, alias, gross) shares as capture_residgate.alias.classify."""
    return classify(err_ms, period_ms, tol_ms)
