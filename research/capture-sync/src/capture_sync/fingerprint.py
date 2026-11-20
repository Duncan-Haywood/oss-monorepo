"""Fingerprint and audio-feature baselines for pairwise audio sync (milestone 4, step 4a).

The multi-camera sync literature mostly does not run GCC on the waveform. It compares coarser descriptions of
the two recordings and takes the lag where they agree best. Three lineages, each reimplemented here with the
same interface as `sync.gcc` (delay of b behind a in seconds, searched over centre_s +- max_lag_s, plus a
confidence where larger means more trustworthy):

  * feature_xcorr: normalised cross-correlation of a frame-level feature sequence. Kammerl et al. (2014)
    synchronise uploads by cross-correlating audio features and report spectral flatness beating zero-crossing
    rate and signal energy (their abstract); the frame length, hop and band here are this repository's choice
    because the full paper could not be read from this session. Confidence: the PSR of the correlation curve,
    computed exactly as gcc's.
  * landmarks: Wang (2003) constellation hashing, the method of Shazam and of most open audio-alignment tools:
    local spectrogram peaks, pairs of peaks hashed as (f1, f2, dt), and the lag with most matching hashes.
    Confidence: votes in the winning bin minus the largest bin more than a frame away (0 if no match).
  * hk_bits: Haitsma and Kalker (2002) binary fingerprints, used for multi-camera sync by Shrestha et al.
    (2007): 33 log-spaced bands 300-2000 Hz, 0.37 s frames every 11.6 ms, one bit per band pair from the sign
    of the time difference of the band-energy difference; the lag of least bit-error rate. Confidence:
    0.5 minus the bit-error rate at that lag (0 is chance).

Every estimate is refined to a fraction of its hop by a parabola through the peak, so the hop (4 to 11.6 ms)
is well under the 33 ms frame criterion. These are baselines on single pairwise windows: Kammerl et al.'s
graph step over many recordings, which needs three or more devices, is not part of this module.
"""
import numpy as np
from numpy.lib.stride_tricks import sliding_window_view
from scipy.ndimage import maximum_filter

from .sync import FS, _peak


def _frames(x, n, hop):
    x = np.asarray(x, float)
    if len(x) < n:
        x = np.concatenate((x, np.zeros(n - len(x))))
    return sliding_window_view(x, n)[::hop]


def power_spectrogram(x, nfft, hop, frame=None):
    """|STFT|^2 with a Hann window, shape (frames, nfft // 2 + 1). Frame k starts at sample k * hop."""
    frame = frame or nfft
    f = _frames(x, frame, hop) * np.hanning(frame)
    return np.abs(np.fft.rfft(f, nfft, axis=1)) ** 2


def _lag_range(max_lag_s, centre_s, hop, fs):
    lo = int(np.floor((centre_s - max_lag_s) * fs / hop))
    hi = int(np.ceil((centre_s + max_lag_s) * fs / hop))
    return lo, hi


def _parabola(vals, k):
    if 0 < k < len(vals) - 1:
        y0, y1, y2 = vals[k - 1], vals[k], vals[k + 1]
        den = y0 - 2 * y1 + y2
        if den != 0:
            return float(np.clip(0.5 * (y0 - y2) / den, -0.5, 0.5))
    return 0.0


def frame_feature(x, kind="flat", fs=FS, nfft=512, hop=64, band=(100.0, 4000.0)):
    """One value per frame: spectral flatness (geometric over arithmetic mean power in the band, in dB),
    log energy in the band (dB), or the zero-crossing rate."""
    if kind == "zcr":
        f = _frames(x, nfft, hop)
        return np.mean(np.abs(np.diff(np.signbit(f).astype(np.int8), axis=1)), axis=1).astype(float)
    p = power_spectrogram(x, nfft, hop)
    fr = np.fft.rfftfreq(nfft, 1.0 / fs)
    p = p[:, (fr >= band[0]) & (fr <= band[1])] + 1e-12
    if kind == "energy":
        return 10 * np.log10(p.sum(1))
    if kind == "flat":
        return 10 * (np.mean(np.log10(p), axis=1) - np.log10(np.mean(p, axis=1)))
    raise ValueError(kind)


def feature_xcorr(a, b, kind="flat", fs=FS, max_lag_s=1.0, centre_s=0.0, nfft=512, hop=64):
    """Delay of b behind a from the normalised cross-correlation of a frame-feature sequence, and its PSR."""
    fa, fb = frame_feature(a, kind, fs, nfft, hop), frame_feature(b, kind, fs, nfft, hop)
    na = len(fa)
    lo, hi = _lag_range(max_lag_s, centre_s, hop, fs)
    lags = np.arange(lo, hi + 1)
    za = (fa - fa.mean()) / (fa.std() + 1e-12)
    vals = np.full(len(lags), -1.0)
    ok = (lags >= 0) & (lags + na <= len(fb))
    if ok.any():
        W = sliding_window_view(fb, na)[lags[ok]]
        Wz = (W - W.mean(1, keepdims=True)) / (W.std(1, keepdims=True) + 1e-12)
        vals[ok] = Wz @ za / na
    k, _, psr = _peak(lags, vals, fs)
    return (lags[k] + _parabola(vals, k)) * hop / fs, psr


def peaks(x, fs=FS, nfft=512, hop=128, band=(100.0, 4000.0), nbhd=(15, 15), per_s=30.0):
    """Wang-style constellation: (frame, bin) of local maxima of the log spectrogram over a nbhd
    (frames, bins) neighbourhood, inside the band, the strongest per_s per second of audio kept."""
    s = 10 * np.log10(power_spectrogram(x, nfft, hop) + 1e-12)
    fr = np.fft.rfftfreq(nfft, 1.0 / fs)
    s[:, (fr < band[0]) | (fr > band[1])] = -np.inf
    m = (s == maximum_filter(s, size=nbhd, mode="constant", cval=-np.inf)) & np.isfinite(s)
    t, f = np.nonzero(m)
    keep = int(np.ceil(per_s * len(x) / fs))
    if len(t) > keep:
        o = np.argsort(-s[t, f], kind="stable")[:keep]
        t, f = t[o], f[o]
    o = np.lexsort((f, t))
    return t[o], f[o]


def hashes(t, f, fan=5, dt_max=63, df_max=31):
    """(hash, anchor frame) for each anchor paired with up to `fan` later peaks within dt 1..dt_max frames and
    |df| <= df_max bins. hash = (f1 * 512 + f2) * 64 + dt."""
    hs, ts = [], []
    n = len(t)
    for i in range(n):
        c = 0
        for j in range(i + 1, n):
            dt = t[j] - t[i]
            if dt > dt_max:
                break
            if dt < 1 or abs(int(f[j]) - int(f[i])) > df_max:
                continue
            hs.append((int(f[i]) * 512 + int(f[j])) * 64 + int(dt))
            ts.append(int(t[i]))
            c += 1
            if c == fan:
                break
    return np.array(hs, np.int64), np.array(ts, np.int64)


def landmarks(a, b, fs=FS, max_lag_s=1.0, centre_s=0.0, nfft=512, hop=128, **kw):
    """Delay of b behind a by voting over matching landmark hashes, and its vote margin. With no matching
    hash in the search range the delay is nan and the confidence 0."""
    ha, ta = hashes(*peaks(a, fs, nfft, hop, **kw))
    hb, tb = hashes(*peaks(b, fs, nfft, hop, **kw))
    lo, hi = _lag_range(max_lag_s, centre_s, hop, fs)
    if len(ha) == 0 or len(hb) == 0:
        return float("nan"), 0.0
    o = np.argsort(hb, kind="stable")
    hb, tb = hb[o], tb[o]
    l, r = np.searchsorted(hb, ha, "left"), np.searchsorted(hb, ha, "right")
    cnt = r - l
    if cnt.sum() == 0:
        return float("nan"), 0.0
    ia = np.repeat(np.arange(len(ha)), cnt)
    ib = np.concatenate([np.arange(x, y) for x, y in zip(l, r) if y > x])
    off = tb[ib] - ta[ia]
    off = off[(off >= lo) & (off <= hi)]
    if len(off) == 0:
        return float("nan"), 0.0
    vals = np.bincount(off - lo, minlength=hi - lo + 1).astype(float)
    k = int(np.argmax(vals))
    excl = int(np.ceil(fs / 30 / hop))
    rest = np.concatenate((vals[:max(0, k - excl)], vals[k + excl + 1:]))
    margin = float(vals[k] - (rest.max() if len(rest) else 0.0))
    return (lo + k + _parabola(vals, k)) * hop / fs, margin


def hk_bits(x, fs=FS, frame_s=0.37, hop_s=0.0116, nband=33, fmin=300.0, fmax=2000.0):
    """Haitsma-Kalker sub-fingerprints: (frames - 1, nband - 1) booleans; row k belongs to frame k + 1."""
    frame, hop = int(round(frame_s * fs)), int(round(hop_s * fs))
    nfft = 1 << (frame - 1).bit_length()
    p = power_spectrogram(x, nfft, hop, frame)
    fr = np.fft.rfftfreq(nfft, 1.0 / fs)
    edges = np.geomspace(fmin, fmax, nband + 1)
    idx = np.digitize(fr, edges) - 1
    E = np.stack([p[:, idx == m].sum(1) for m in range(nband)], axis=1)
    dE = E[:, :-1] - E[:, 1:]
    return (dE[1:] - dE[:-1]) > 0


def hk_xcorr(a, b, fs=FS, max_lag_s=1.0, centre_s=0.0, frame_s=0.37, hop_s=0.0116):
    """Delay of b behind a as the lag of least Haitsma-Kalker bit-error rate, and 0.5 minus that rate."""
    hop = int(round(hop_s * fs))
    ba, bb = hk_bits(a, fs, frame_s, hop_s), hk_bits(b, fs, frame_s, hop_s)
    na = len(ba)
    lo, hi = _lag_range(max_lag_s, centre_s, hop, fs)
    lags = np.arange(lo, hi + 1)
    ber = np.full(len(lags), 0.5)
    ok = (lags >= 0) & (lags + na <= len(bb))
    if ok.any():
        W = sliding_window_view(bb, (na, bb.shape[1]))[:, 0][lags[ok]]
        ber[ok] = np.mean(W != ba[None], axis=(1, 2))
    k = int(np.argmin(ber))
    return (lags[k] + _parabola(-ber, k)) * hop / fs, float(0.5 - ber[k])
