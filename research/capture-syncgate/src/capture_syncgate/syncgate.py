"""Peak-to-sidelobe gate for GCC windows, and leave-one-clip-out choice of its settings.

capture-realedit found that on real clips a Theil-Sen fit over 12 GCC windows still leaves many cuts
jumping over a frame, and that its two fixes (gamma = 0.25, the fit) were chosen on the same clips they
were scored on. Here a window whose correlation peak does not stand out from its own sidelobes is dropped
before the fit, and gamma and the gate threshold are picked on the other nine clips (loco_pick)."""
import random
import numpy as np
from capture_audiosync import fit_track
from capture_edit.model import make_events
from capture_realaudio import pair_from_clip
from capture_realaudio.real import FS
from capture_syncedit.syncedit import edit_cuts, cut_damage, EVENT_RATE

EXCL = 12          # samples either side of the peak left out of the sidelobe statistics
MIN_KEPT = 3       # a line needs this many windows; fewer survivors -> keep the MIN_KEPT best by PSR


def gcc_psr(a, b, gamma=1.0, fs=FS, max_lag_s=2.0, band=(100.0, 4000.0)):
    """(delay in s, peak-to-sidelobe ratio) of a partially whitened GCC. PSR = (peak - mean) / std of the
    correlation outside +-EXCL samples of the peak (the radar and tracking measure of a trustworthy peak)."""
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
    rest = np.concatenate((cc[:max(0, k - EXCL)], cc[k + EXCL + 1:]))
    sd = rest.std()
    psr = float((cc[k] - rest.mean()) / sd) if sd > 0 else float("inf")
    off = 0.0
    if 0 < k < len(cc) - 1:
        y0, y1, y2 = cc[k - 1], cc[k], cc[k + 1]
        den = y0 - 2 * y1 + y2
        if den != 0:
            off = 0.5 * (y0 - y2) / den
    return (k - m + off) / fs, psr


def gated_camera_errors(rng, clip, n_cams, t_clip, win_s, snr_db, gamma, psr_min, kind="white",
                        ppm=40.0, d0_s=0.8, span_s=3600.0, n_win=12):
    """Like capture_realedit.real_camera_errors (fit mode) but windows with PSR < psr_min are dropped.
    Returns (errors in s, share of windows dropped)."""
    times = np.linspace(0, span_s, n_win)
    err, dropped = [0.0], []
    for _ in range(1, n_cams):
        rate = rng.uniform(-ppm, ppm)
        true = d0_s + rate * 1e-6 * times
        est, psr = [], []
        for tau in true:
            a, b = pair_from_clip(clip, rng, float(tau), win_s, snr_db, kind)
            d, p = gcc_psr(a, b, gamma, max_lag_s=win_s)
            est.append(d)
            psr.append(p)
        est, psr = np.array(est), np.array(psr)
        keep = psr >= psr_min
        if keep.sum() < MIN_KEPT:
            keep = np.zeros(n_win, bool)
            keep[np.argsort(-psr)[:MIN_KEPT]] = True
        dropped.append(1.0 - keep.mean())
        icpt, slope = fit_track(times[keep], est[keep])
        err.append(float(icpt + slope * t_clip - (d0_s + rate * 1e-6 * t_clip)))
    return err, float(np.mean(dropped))


def gated_trial(seed, clip, win_s, snr_db, gamma, psr_min, kind="white", n_cams=4, span_s=3600.0):
    rng = np.random.default_rng(seed)
    t_clip = float(rng.uniform(0, span_s - 120))
    err, dropped = gated_camera_errors(rng, clip, n_cams, t_clip, win_s, snr_db, gamma, psr_min, kind, span_s=span_s)
    cuts = edit_cuts(seed, n_cams)
    events = make_events(120.0, random.Random(seed + 10_000), EVENT_RATE)
    out = cut_damage(cuts, err, events)
    out["dropped"] = dropped
    return out


def loco_pick(table):
    """Leave-one-clip-out. table[clip][setting] = score (lower is better). For each clip, the setting with the
    lowest mean score over the other clips; returns {clip: (setting, held-out score of that setting)}."""
    clips = sorted(table)
    settings = sorted(table[clips[0]])
    out = {}
    for held in clips:
        rest = [c for c in clips if c != held]
        best = min(settings, key=lambda s: (np.mean([table[c][s] for c in rest]), str(s)))
        out[held] = (best, table[held][best])
    return out
