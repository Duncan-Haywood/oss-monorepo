"""Residual trimming of GCC sync windows: fit the clock line, drop windows far from it, refit.

capture-syncgate gated windows on peak-to-sidelobe ratio (PSR), which needs a threshold that depends on how
peaky a clip's correlation is. A camera clock is a straight line over an hour (a few tens of ppm), so a
window whose delay is far off the line is wrong whatever its peak looks like. The threshold here is in time
(milliseconds off the line), which does not depend on the clip."""
import random
import numpy as np
from capture_audiosync import fit_track
from capture_edit.model import make_events
from capture_realaudio import pair_from_clip
from capture_syncedit.syncedit import edit_cuts, cut_damage, EVENT_RATE
from capture_syncgate import gcc_psr
from capture_syncgate.syncgate import MIN_KEPT


def trimmed_fit(times, est, tol_s, rounds=3):
    """Theil-Sen line, then drop windows more than tol_s off it and refit, up to `rounds` times.
    Returns (intercept, slope, keep mask). tol_s <= 0 means no trimming. Keeps MIN_KEPT closest at least."""
    keep = np.ones(len(times), bool)
    icpt, slope = fit_track(times, est)
    if tol_s <= 0:
        return icpt, slope, keep
    for _ in range(rounds):
        res = np.abs(est - (icpt + slope * times))
        new = res <= tol_s
        if new.sum() < MIN_KEPT:
            new = np.zeros(len(times), bool)
            new[np.argsort(res)[:MIN_KEPT]] = True
        if (new == keep).all():
            break
        keep = new
        icpt, slope = fit_track(times[keep], est[keep])
    return icpt, slope, keep


def resid_camera_errors(rng, clip, n_cams, t_clip, win_s, snr_db, gamma, tol_s, kind="white",
                        ppm=40.0, d0_s=0.8, span_s=3600.0, n_win=12, psr_min=0.0):
    """Per-camera error at t_clip (s) and share of windows dropped. psr_min > 0 applies the PSR gate first."""
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
        pre = psr >= psr_min
        if pre.sum() < MIN_KEPT:
            pre = np.zeros(n_win, bool)
            pre[np.argsort(-psr)[:MIN_KEPT]] = True
        icpt, slope, k2 = trimmed_fit(times[pre], est[pre], tol_s)
        dropped.append(1.0 - k2.sum() / n_win)
        err.append(float(icpt + slope * t_clip - (d0_s + rate * 1e-6 * t_clip)))
    return err, float(np.mean(dropped))


def resid_trial(seed, clip, win_s, snr_db, gamma, tol_s, kind="white", n_cams=4, span_s=3600.0, psr_min=0.0):
    rng = np.random.default_rng(seed)
    t_clip = float(rng.uniform(0, span_s - 120))
    err, dropped = resid_camera_errors(rng, clip, n_cams, t_clip, win_s, snr_db, gamma, tol_s, kind,
                                       span_s=span_s, psr_min=psr_min)
    cuts = edit_cuts(seed, n_cams)
    events = make_events(120.0, random.Random(seed + 10_000), EVENT_RATE)
    out = cut_damage(cuts, err, events)
    out["dropped"] = dropped
    return out
