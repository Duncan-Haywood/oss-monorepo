"""Resync schedule for two free-running cameras: how often, and should a wild estimate be trusted?

Camera B's delay is tau(t) = d0 + e*t. Every T seconds a 2 s GCC-PHAT window gives a fresh
offset estimate; the applied correction is held (offset-only) until the next one. Estimator
and audio model are `capture-audiosync`'s, imported from the sibling project."""
import os
import sys

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "..", "capture-audiosync", "src"))
from capture_audiosync import make_pair, gcc_phat  # noqa: E402

# Audio-leads-video limits of EBU R37 (2007): sound may lead picture by at most 40 ms and lag by
# at most 60 ms. We use the stricter 40 ms for both signs because the sign of a cross-camera
# error depends on which camera the audio came from.
LEAD_LIMIT_S = 0.040
LAG_LIMIT_S = 0.060
TOL_S = LEAD_LIMIT_S


def resync_interval_s(ppm, tol_s=TOL_S, residual_s=0.0):
    """Seconds an offset-only sync stays within tol_s, starting from a residual error (worst sign)."""
    return float("inf") if ppm == 0 else max(0.0, (tol_s - abs(residual_s)) / (abs(ppm) * 1e-6))


def one_estimate(rng, tau_s, snr_db, win_s=2.0):
    a, b = make_pair(rng, tau_s, win_s, snr_db)
    return gcc_phat(a, b)


def simulate(seed, ppm=40.0, d0_s=0.8, span_s=6 * 3600.0, every_s=900.0, snr_db=-12.0,
             win_s=2.0, first_win_s=10.0, gate=False, ppm_max=100.0, margin_s=0.005, tol_s=TOL_S, grid_s=1.0):
    """Share of the shoot with |applied correction - true delay| > tol_s.

    The first sync uses a longer window (first_win_s) and is trusted: nothing exists to compare it with. With gate=True a later
    estimate is applied only if it is within ppm_max*(time since the last applied one) + margin_s of it,
    the most a real clock could have moved; otherwise the old correction is kept.
    Returns (share_bad, worst_ms, n_rejected, n_wrong_applied)."""
    rng = np.random.default_rng(seed)
    times = np.arange(0.0, span_s, every_s)
    tau = lambda t: d0_s + ppm * 1e-6 * t
    corr_t, corr = [], []
    last = None
    rejected = wrong = 0
    last_t = 0.0
    for t in times:
        est = one_estimate(rng, tau(t), snr_db, first_win_s if last is None else win_s)
        if gate and last is not None and abs(est - last) > ppm_max * 1e-6 * (t - last_t) + margin_s:
            rejected += 1
            continue
        last, last_t = est, t
        corr_t.append(t)
        corr.append(est)
        if abs(est - tau(t)) > tol_s:
            wrong += 1
    grid = np.arange(0.0, span_s, grid_s)
    idx = np.searchsorted(corr_t, grid, side="right") - 1
    ok = idx >= 0
    err = np.full(len(grid), np.inf)
    err[ok] = np.abs(np.asarray(corr)[idx[ok]] - tau(grid[ok]))
    return float(np.mean(err > tol_s)), float(err[np.isfinite(err)].max() * 1e3), rejected, wrong
