"""Synthetic audio for an energy gate, and fixed / adaptive gates on frame energies.

Everything is generated: harmonic "speech-like" bursts with a syllabic envelope, stationary
background noise and short transients. No recording, no dataset. Levels are in dB relative to
int16 full scale (dBFS, rms). The gate works on mean-square energy of 20 ms frames of int16
samples, like firmware/vad_gate.c in `ambient-wearable`.
"""
import numpy as np

FS = 16000
FRAME = 320  # 20 ms


def _db(x):
    return 10.0 ** (x / 20.0)


def synth(seconds, noise_dbfs, seed, transient_rate=0.4):
    """Returns (int16 samples, active) with `active` a boolean mask per 20 ms frame: frames whose
    syllabic envelope is above 10% of its utterance peak (speech that the gate should keep)."""
    rng = np.random.default_rng(seed)
    n = int(seconds * FS)
    t = np.arange(n) / FS
    # background: pink-ish noise (white shaped by 1/sqrt(f)), scaled to the requested rms
    spec = np.fft.rfft(rng.standard_normal(n))
    f = np.fft.rfftfreq(n, 1 / FS)
    spec[1:] /= np.sqrt(np.maximum(f[1:], 20.0))
    spec[0] = 0
    bg = np.fft.irfft(spec, n)
    bg *= _db(noise_dbfs) / bg.std()
    # utterances: 1-4 s long, 1-5 s gaps, level -36..-20 dBFS rms (distance varies)
    sp = np.zeros(n)
    act = np.zeros(n, dtype=bool)
    pos = int(rng.uniform(0.5, 2.0) * FS)
    while pos < n:
        dur = int(rng.uniform(1.0, 4.0) * FS)
        end = min(n, pos + dur)
        tt = t[pos:end] - t[pos]
        rate = rng.uniform(3.0, 5.0)
        env = np.maximum(0.0, np.sin(np.pi * rate * tt + rng.uniform(0, np.pi))) ** 1.5
        f0 = rng.uniform(100, 220) * (1 + 0.1 * np.sin(2 * np.pi * 0.7 * tt))
        phase = 2 * np.pi * np.cumsum(f0) / FS
        voiced = sum(np.sin(h * phase) / h for h in range(1, 25))
        w = voiced + 0.3 * rng.standard_normal(end - pos)
        seg = w * env
        seg *= _db(rng.uniform(-36, -20)) / max(seg.std(), 1e-9)
        sp[pos:end] = seg
        act[pos:end] = env > 0.1 * env.max()
        pos = end + int(rng.uniform(1.0, 5.0) * FS)
    # transients (keyboard / door-like): 30 ms decaying noise bursts, 6-20 dB above the background
    tr = np.zeros(n)
    for c in rng.uniform(0, seconds, rng.poisson(transient_rate * seconds)):
        i = int(c * FS)
        m = min(int(0.03 * FS), n - i)
        if m > 0:
            burst = rng.standard_normal(m) * np.exp(-np.arange(m) / (0.008 * FS))
            tr[i:i + m] += burst * _db(noise_dbfs + rng.uniform(6, 20))
    x = np.clip(np.round((bg + sp + tr) * 32768.0), -32768, 32767).astype(np.int16)
    nf = n // FRAME
    return x[:nf * FRAME], act[:nf * FRAME].reshape(nf, FRAME).mean(axis=1) > 0.5


def frame_ms(x):
    """Mean-square per frame, in int16 units (what vad_gate_push thresholds)."""
    f = x.astype(np.int64).reshape(-1, FRAME)
    return (f * f).sum(axis=1) // FRAME


def dbfs_to_ms(db):
    return (_db(db) * 32768.0) ** 2


def hangover_open(above, hangover):
    """Gate output for a per-frame `above` mask: frame i is open if any frame in i-hangover..i was
    above (firmware/vad_gate.c: an exceeding frame sets left = hangover + 1)."""
    csum = np.concatenate([[0], np.cumsum(above.astype(np.int64))])
    lo = np.maximum(0, np.arange(len(above)) - hangover)
    return (csum[np.arange(len(above)) + 1] - csum[lo]) > 0


def fixed_gate(ms, threshold, hangover):
    return hangover_open(ms >= threshold, hangover)


def noise_floor(ms, window):
    """Causal running minimum of frame energy over `window` frames (expanding at the start)."""
    out = np.empty(len(ms))
    for i in range(len(ms)):
        out[i] = ms[max(0, i - window + 1):i + 1].min()
    return out


def adaptive_gate(ms, k, hangover, floor=None, window=250):
    """Open when frame energy >= k x running-minimum noise floor (window frames = 5 s).
    Pass `floor` (from noise_floor) to reuse it across values of k."""
    if floor is None:
        floor = noise_floor(ms, window)
    return hangover_open(ms >= k * np.maximum(floor, 1.0), hangover)


def score(open_, active, near=10):
    """recall: share of active frames with the gate open. open: share of all frames open.
    wasted: share of all frames open but more than `near` frames (200 ms) from any active frame."""
    k = np.ones(2 * near + 1)
    near_active = np.convolve(active.astype(float), k, mode="same") > 0
    return (float(open_[active].mean()) if active.any() else float("nan"),
            float(open_.mean()),
            float((open_ & ~near_active).mean()))
