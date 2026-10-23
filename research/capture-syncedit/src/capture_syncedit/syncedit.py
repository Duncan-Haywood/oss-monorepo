"""Cut damage from a residual sync error. Reuses capture_edit (scores, Viterbi edit, Poisson loud events)
and capture_audiosync (GCC-PHAT windows, Theil-Sen line).

Why not edit quality: a camera's quality is a property of what it sees at its own world time, and a shifted
camera is shifted in score and picture together, so mean quality cannot change. What a sync error damages is
*continuity at a cut*: cutting from camera A (clock error a) to B (clock error b) jumps the picture by b - a
in world time. A jump over one frame is visible; an event (clap, jump, speech onset) inside the jump is shown
twice or never. Both are counted per cut."""
import random
import numpy as np
from capture_audiosync import estimate_track, fit_track
from capture_edit.model import DT, make_events, make_quality, observe, viterbi

FRAME = 1.0 / 30.0     # the criterion capture-audiosync uses for "synced"
EVENT_RATE = 0.5       # loud moments per second (capture-edit's make_events default; assumed)


def edit_cuts(seed, n_cams=4, dur=120.0, sigma=0.3, cost=1.0):
    """Viterbi edit on noisy scores (capture-edit setup). Returns (cut times in s, camera before, camera after)."""
    rng = random.Random(seed * 7919 + n_cams)
    q = make_quality(n_cams, dur, rng)
    path = viterbi(observe(q, sigma, rng), cost)
    return [((i + 1) * DT, a, b) for i, (a, b) in enumerate(zip(path, path[1:])) if a != b]


def cut_damage(cuts, errors, events):
    """errors[c]: camera c's sync error in seconds (reference camera 0 has 0). Returns the share of cuts whose
    jump exceeds one frame, the share with a loud event inside the jump, and the mean jump in ms."""
    if not cuts:
        return {"visible": 0.0, "event": 0.0, "jump_ms": 0.0}
    vis = ev = 0
    jumps = []
    for t, a, b in cuts:
        j = errors[b] - errors[a]
        jumps.append(abs(j))
        vis += abs(j) > FRAME
        lo, hi = t + min(errors[a], errors[b]), t + max(errors[a], errors[b])
        ev += any(lo < tau <= hi for tau, _ in events)
    n = len(cuts)
    return {"visible": vis / n, "event": ev / n, "jump_ms": 1e3 * sum(jumps) / n}


def camera_errors(rng, n_cams, mode, t_clip, win_s, snr_db, ppm=40.0, d0_s=0.8, span_s=3600.0, n_win=12):
    """Sync error (s) of each non-reference camera at time t_clip into the shoot.
    mode 'once': offset from the first window only, never redone. mode 'fit': a Theil-Sen line over n_win windows.
    Each camera has its own clock rate drawn from [-ppm, +ppm] against the reference (swept, not sourced)."""
    times = np.linspace(0, span_s, n_win)
    err = [0.0]
    for _ in range(1, n_cams):
        rate = rng.uniform(-ppm, ppm)
        true, est = estimate_track(rng, d0_s, rate, times, win_s, snr_db)
        truth_now = d0_s + rate * 1e-6 * t_clip
        if mode == "once":
            err.append(float(est[0] - truth_now))
        else:
            icpt, slope = fit_track(times, est)
            err.append(float(icpt + slope * t_clip - truth_now))
    return err


def trial(seed, mode, win_s, snr_db, n_cams=4, span_s=3600.0):
    """One 120 s edit at a random point of a 1 h shoot, synced in the given way."""
    rng = np.random.default_rng(seed)
    t_clip = float(rng.uniform(0, span_s - 120))
    err = camera_errors(rng, n_cams, mode, t_clip, win_s, snr_db, span_s=span_s)
    cuts = edit_cuts(seed, n_cams)
    events = make_events(120.0, random.Random(seed + 10_000), EVENT_RATE)
    out = cut_damage(cuts, err, events)
    out["max_err_ms"] = 1e3 * max(abs(e) for e in err)
    return out
