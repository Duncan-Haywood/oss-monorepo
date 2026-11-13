"""Audio sync of free-running recorders, measured on real devices.

Two recorders started by hand differ by an offset (seconds) and drift apart by their sampling-rate
offset (SRO, parts per million). For recorders i and j we write the true delay of j behind i at time t
(seconds on i's clock) as a line, tau_ij(t) = d_ij + s_ij * t, so a sound at time t in i's file is at
t + tau_ij(t) in j's file.

This module has three pieces:
  * gcc: partially whitened generalised cross-correlation (Knapp and Carter 1976); gamma = 1 is PHAT,
    gamma = 0 is plain correlation. Returns the delay and the peak-to-sidelobe ratio (PSR).
  * reference_line: the long-window reference for one pair (20 s windows every 10 s, Theil-Sen line).
  * closure: how far the three reference lines of a triple of recorders fail to add up, a check on the
    reference that needs no ground truth (tau_ik should equal tau_ij + tau_jk).
"""
import numpy as np

FS = 16000
EXCL = 12  # samples either side of the peak left out of the sidelobe statistics (as capture-syncgate)


def gcc(a, b, gamma=1.0, fs=FS, max_lag_s=1.0, band=(100.0, 4000.0), centre_s=0.0):
    """Delay of b behind a (s) and PSR. `b` may be longer than `a`; lags are searched in
    centre_s +- max_lag_s, where lag 0 means a[0] lines up with b[0]."""
    a = np.asarray(a, float)
    b = np.asarray(b, float)
    a = a - a.mean()
    b = b - b.mean()
    n = len(a) + len(b)
    nfft = 1 << (n - 1).bit_length()
    A, B = np.fft.rfft(a, nfft), np.fft.rfft(b, nfft)
    c = B * np.conj(A)
    c = c / (np.abs(c) + 1e-12) ** gamma
    f = np.fft.rfftfreq(nfft, 1.0 / fs)
    c[(f < band[0]) | (f > band[1])] = 0
    cc = np.fft.irfft(c, nfft)
    lo = int(round((centre_s - max_lag_s) * fs))
    hi = int(round((centre_s + max_lag_s) * fs))
    lags = np.arange(lo, hi + 1)
    vals = cc[lags % nfft]
    k = int(np.argmax(vals))
    rest = np.concatenate((vals[:max(0, k - EXCL)], vals[k + EXCL + 1:]))
    sd = rest.std()
    psr = float((vals[k] - rest.mean()) / sd) if sd > 0 else float("inf")
    off = 0.0
    if 0 < k < len(vals) - 1:
        y0, y1, y2 = vals[k - 1], vals[k], vals[k + 1]
        den = y0 - 2 * y1 + y2
        if den != 0:
            off = 0.5 * (y0 - y2) / den
    return (lags[k] + off) / fs, psr


def theil_sen(t, y):
    """Median-of-slopes line (intercept, slope); robust to up to ~29% gross outliers."""
    t = np.asarray(t, float)
    y = np.asarray(y, float)
    i, j = np.triu_indices(len(t), 1)
    dt = t[j] - t[i]
    ok = dt != 0
    slope = float(np.median((y[j] - y[i])[ok] / dt[ok]))
    icpt = float(np.median(y - slope * t))
    return icpt, slope


def coarse_offset(x, y, fs=FS, max_lag_s=30.0, decim=4):
    """Whole-file offset of y behind x (s), from a PHAT-weighted correlation of the decimated files."""
    from scipy.signal import resample_poly
    xd = resample_poly(x, 1, decim)
    yd = resample_poly(y, 1, decim)
    d, psr = gcc(xd, yd, gamma=1.0, fs=fs / decim, max_lag_s=max_lag_s, band=(100.0, fs / decim / 2 * 0.9))
    return d, psr


def window_delay(x, y, t, win_s, prior_s, search_s, gamma, fs=FS):
    """Delay estimate from a window of x starting at t (s on x's clock): the matching stretch of y is cut
    around t + prior_s with search_s of guard each side. Returns (delay, psr) or None if out of range."""
    n = int(round(win_s * fs))
    g = int(round(search_s * fs))
    i0 = int(round(t * fs))
    j0 = int(round((t + prior_s) * fs)) - g
    if i0 < 0 or i0 + n > len(x) or j0 < 0 or j0 + n + 2 * g > len(y):
        return None
    a = x[i0:i0 + n]
    b = y[j0:j0 + n + 2 * g]
    d, psr = gcc(a, b, gamma=gamma, fs=fs, max_lag_s=search_s, centre_s=search_s)
    return prior_s + d - search_s, psr


def reference_line(x, y, d0, fs=FS, win_s=20.0, hop_s=10.0, search_s=0.25, gamma=1.0):
    """Long-window reference for one pair: GCC on win_s windows every hop_s seconds, searched +-search_s
    around the coarse offset d0, then a Theil-Sen line. Returns dict with intercept, slope (s/s), the
    window times, estimates, PSRs and residuals from the line."""
    dur = min(len(x), len(y)) / fs
    ts, est, psr = [], [], []
    t = 1.0
    while t + win_s + search_s + abs(d0) + 1 < dur:
        r = window_delay(x, y, t, win_s, d0, search_s, gamma, fs)
        if r is not None:
            ts.append(t + win_s / 2)  # a window's delay belongs to its centre
            est.append(r[0])
            psr.append(r[1])
        t += hop_s
    ts, est, psr = np.array(ts), np.array(est), np.array(psr)
    icpt, slope = theil_sen(ts, est)
    return {"d": icpt, "s": slope, "t": ts, "est": est, "psr": psr, "resid": est - (icpt + slope * ts)}


def line_at(ref, t):
    return ref["d"] + ref["s"] * t


def closure(ref_ij, ref_jk, ref_ik, t):
    """tau_ij(t) + tau_jk(t + tau_ij(t)) - tau_ik(t): zero if the three reference lines are consistent
    (up to differences in acoustic path between the recorders, which change with the talker)."""
    tij = line_at(ref_ij, t)
    return tij + line_at(ref_jk, t + tij) - line_at(ref_ik, t)


def auroc(score_bad, score_good):
    """P(a random good window scores higher than a random bad one); ties count half."""
    b = np.asarray(score_bad, float)
    g = np.asarray(score_good, float)
    if len(b) == 0 or len(g) == 0:
        return float("nan")
    allv = np.concatenate([b, g])
    order = allv.argsort(kind="mergesort")
    ranks = np.empty(len(allv))
    sv = allv[order]
    i = 0
    while i < len(sv):  # average ranks over ties
        j = i
        while j + 1 < len(sv) and sv[j + 1] == sv[i]:
            j += 1
        ranks[order[i:j + 1]] = (i + j) / 2 + 1
        i = j + 1
    rg = ranks[len(b):].sum()
    return float((rg - len(g) * (len(g) + 1) / 2) / (len(b) * len(g)))


def pick_threshold(psr, bad, max_fail=0.01, min_keep=20):
    """Lowest PSR threshold whose accepted windows fail at most max_fail (keeps the most windows).
    Returns inf when no threshold keeping at least min_keep windows meets it."""
    psr = np.asarray(psr, float)
    bad = np.asarray(bad, bool)
    for th in np.unique(psr):
        keep = psr >= th
        if keep.sum() < min_keep:
            break
        if bad[keep].mean() <= max_fail:
            return float(th)
    return float("inf")
