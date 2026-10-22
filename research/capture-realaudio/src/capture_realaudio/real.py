"""Run capture-audiosync's GCC-PHAT on real recorded clips instead of synthetic noise.

The clips are the sound effects and recordings that ship with LibreOffice (read from the
installed system, never copied into this repository). Camera B hears camera A's clip delayed
by tau; each camera adds independent noise at a stated SNR (white, or wind-like brown noise)."""
import glob
import os
import wave
import numpy as np
from capture_audiosync import gcc_phat, fractional_delay, make_pair

FS = 16000
SOUNDS_DIR = "/usr/lib/libreoffice/share/gallery/sounds"
MIN_CLIP_S = 3.9          # a 2 s window plus a 0.8 s delay and guard needs about this much


def load_clip(path, fs=FS):
    """Mono float clip resampled to fs by FFT (zero-padding the spectrum), peak-normalised."""
    with wave.open(path) as w:
        assert w.getsampwidth() == 2 and w.getnchannels() == 1
        sr, raw = w.getframerate(), w.readframes(w.getnframes())
    x = np.frombuffer(raw, dtype="<i2").astype(float)
    x -= x.mean()
    n_out = int(round(len(x) * fs / sr))
    X = np.fft.rfft(x)
    Y = np.zeros(n_out // 2 + 1, complex)
    m = min(len(X), len(Y))
    Y[:m] = X[:m]
    y = np.fft.irfft(Y, n_out) * (n_out / len(x))
    return y / (np.abs(y).max() + 1e-12)


def available_clips(min_s=MIN_CLIP_S, sounds_dir=None):
    d = sounds_dir or SOUNDS_DIR
    out = {}
    for p in sorted(glob.glob(os.path.join(d, "*.wav"))):
        try:
            x = load_clip(p)
        except Exception:
            continue
        if len(x) / FS >= min_s:
            out[os.path.splitext(os.path.basename(p))[0]] = x
    return out


def noise(rng, n, kind, fs=FS):
    """Unit-variance noise: 'white', or 'wind' = brown (1/f^2) noise high-passed at 20 Hz,
    a common stand-in for wind rumble (a model, not a measured wind recording)."""
    w = rng.standard_normal(n)
    if kind == "white":
        return w
    f = np.fft.rfftfreq(n, 1 / fs)
    S = np.fft.rfft(w) / np.maximum(f, 20.0)
    s = np.fft.irfft(S, n)
    return s / s.std()


def pair_from_clip(clip, rng, tau_s, win_s, snr_db, kind="white", fs=FS):
    """Two cameras' windows from a random start in clip. B is delayed by tau_s.
    SNR is total signal power over total noise power, per camera."""
    pad = int(0.5 * fs)
    n = int(win_s * fs) + 2 * pad
    if len(clip) < n:
        raise ValueError("clip too short")
    s0 = int(rng.integers(0, len(clip) - n + 1))
    seg = clip[s0:s0 + n]
    a, b = seg, fractional_delay(seg, tau_s, fs)
    sig = np.sqrt(np.mean(seg ** 2) / 10 ** (snr_db / 10))
    a = a + sig * noise(rng, n, kind, fs)
    b = b + sig * noise(rng, n, kind, fs)
    return a[pad:-pad], b[pad:-pad]


def gcc_gamma(a, b, gamma=1.0, fs=FS, max_lag_s=2.0, band=(100.0, 4000.0)):
    """GCC with partial whitening: cross-spectrum divided by |C|**gamma. gamma=1 is PHAT
    (identical to capture_audiosync.gcc_phat); gamma=0 is plain cross-correlation. In between,
    bins with little energy (where a tonal or band-limited clip has no signal) get less weight."""
    n = len(a) + len(b)
    nfft = 1 << (n - 1).bit_length()
    A, B = np.fft.rfft(a, nfft), np.fft.rfft(b, nfft)
    c = B * np.conj(A)
    c = c / (np.abs(c) + 1e-12) ** gamma
    f = np.fft.rfftfreq(nfft, 1.0 / fs)
    c[(f < band[0]) | (f > band[1])] = 0
    cc = np.fft.irfft(c, nfft)
    m = min(int(max_lag_s * fs), min(len(a), len(b)) - 1)
    cc = np.concatenate((cc[-m:], cc[:m + 1]))
    k = int(np.argmax(cc))
    off = 0.0
    if 0 < k < len(cc) - 1:
        y0, y1, y2 = cc[k - 1], cc[k], cc[k + 1]
        den = y0 - 2 * y1 + y2
        if den != 0:
            off = 0.5 * (y0 - y2) / den
    return (k - m + off) / fs


def spectral_stats(x, fs=FS, band=(100.0, 4000.0)):
    """(spectral flatness in band, share of 50 ms frames within 30 dB of the loudest frame).
    Flatness 1 = white; near 0 = a few tones."""
    X = np.abs(np.fft.rfft(x)) ** 2
    f = np.fft.rfftfreq(len(x), 1 / fs)
    P = X[(f >= band[0]) & (f <= band[1])] + 1e-20
    flat = float(np.exp(np.mean(np.log(P))) / np.mean(P))
    h = int(0.05 * fs)
    e = np.array([np.mean(x[i:i + h] ** 2) for i in range(0, len(x) - h, h)]) + 1e-20
    active = float(np.mean(e > e.max() * 1e-3))
    return flat, active


def error_ms(clip, rng, tau_s, win_s, snr_db, kind="white", gamma=1.0):
    a, b = pair_from_clip(clip, rng, tau_s, win_s, snr_db, kind)
    return abs(gcc_gamma(a, b, gamma, max_lag_s=win_s) - tau_s) * 1e3


def synthetic_pair_error_ms(rng, tau_s, win_s, snr_db):
    a, b = make_pair(rng, tau_s, win_s, snr_db)
    return abs(gcc_phat(a, b) - tau_s) * 1e3
