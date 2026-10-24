"""Offset-only hold vs a held fitted slope between audio re-syncs of two free-running cameras.

Estimator and audio model are `capture-audiosync`'s (GCC-PHAT on synthetic speech-like noise), as in
`capture-syncbudget`, whose offset-only hold and drift gate are the baselines here."""
import os
import sys

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "..", "capture-audiosync", "src"))
from capture_audiosync import make_pair, gcc_phat  # noqa: E402

TOL_S = 0.040  # EBU R37 lead limit, a stand-in (see capture-syncbudget)


def true_delay(t, d0_s=0.8, ppm=40.0, wobble_ppm=0.0, wobble_period_s=3600.0):
    """Linear drift plus an optional sinusoidal rate wobble (temperature), integrated exactly."""
    w = 2 * np.pi / wobble_period_s
    return d0_s + ppm * 1e-6 * t + wobble_ppm * 1e-6 * (1 - np.cos(w * t)) / w


def simulate(seed, mode="slope", ppm=40.0, wobble_ppm=0.0, wobble_period_s=3600.0, d0_s=0.8,
             span_s=6 * 3600.0, every_s=900.0, snr_db=-12.0, win_s=2.0, first_win_s=10.0,
             ppm_max=100.0, margin_s=0.005, keep=8, reset_after=0, tol_s=TOL_S, grid_s=1.0):
    """Share of the shoot with |applied correction(t) - true delay(t)| > tol_s.

    mode 'offset': hold the last accepted estimate (capture-syncbudget, gated).
    mode 'slope':  least-squares line through the last `keep` accepted estimates, extrapolated.
    Gate: an estimate is accepted if within ppm_max*dt + margin_s of the last accepted one
    (until 3 are held), then within margin_s of the line's prediction. The first sync is trusted.
    reset_after=k>0 (slope mode): the k-th out-of-gate estimate in a row (after k-1 rejections) is
    accepted and the fit history is dropped, so a line gone stale cannot lock out true estimates for the rest of the shoot.
    Returns (share_bad, n_rejected, n_wrong_applied)."""
    rng = np.random.default_rng(seed)
    tau = lambda t: true_delay(t, d0_s, ppm, wobble_ppm, wobble_period_s)
    acc_t, acc_e = [], []
    rejected = wrong = streak = 0
    segs = []  # (t_start, predict function) for the correction in force
    for t in np.arange(0.0, span_s, every_s):
        # the window is cut with the correction in force, so only the residual is searched for
        # (capture-syncbudget correlates the raw window; the delay there grows to 1.66 s in a 2 s window)
        cur = float(segs[-1][1](np.array([t]))[0]) if segs else 0.0
        a, b = make_pair(rng, tau(t) - cur, first_win_s if not acc_t else win_s, snr_db)
        est = cur + gcc_phat(a, b)
        if acc_t:
            if mode == "slope" and len(acc_t) >= 3:
                pred = np.polyval(np.polyfit(acc_t[-keep:], acc_e[-keep:], 1), t)
                ok = abs(est - pred) <= margin_s  # line-based gate
            else:
                ok = abs(est - acc_e[-1]) <= ppm_max * 1e-6 * (t - acc_t[-1]) + margin_s
            if not ok and reset_after and streak + 1 >= reset_after:
                acc_t, acc_e = [], []  # restart the fit from this estimate (trusted, like the first)
                ok = True
            if not ok:
                rejected += 1
                streak += 1
                continue
        streak = 0
        acc_t.append(float(t))
        acc_e.append(float(est))
        if abs(est - tau(t)) > tol_s:
            wrong += 1
        if mode == "slope" and len(acc_t) >= 2:
            k = min(keep, len(acc_t))
            c = np.polyfit(acc_t[-k:], acc_e[-k:], 1)
            segs.append((t, lambda x, c=c: np.polyval(c, x)))
        else:
            segs.append((t, lambda x, e=est: np.full_like(x, e, dtype=float)))
    grid = np.arange(0.0, span_s, grid_s)
    err = np.full(len(grid), np.inf)
    starts = [s[0] for s in segs]
    idx = np.searchsorted(starts, grid, side="right") - 1
    for i, (_, f) in enumerate(segs):
        m = idx == i
        if m.any():
            err[m] = np.abs(f(grid[m]) - tau(grid[m]))
    return float(np.mean(err > tol_s)), rejected, wrong
