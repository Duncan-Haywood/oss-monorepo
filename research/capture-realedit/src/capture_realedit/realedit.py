"""Cut damage of the sync errors measured on real clips (closes capture-syncedit's second next step).

capture-syncedit drew each camera's sync error from synthetic speech-like audio. Here every GCC window of
every camera is run on a real recorded clip (capture-realaudio's pair_from_clip and gcc_gamma), then the same
Theil-Sen fit (or a first-window-only offset) gives the camera's error at the clip, and the same Viterbi
edit is scored with capture_syncedit.cut_damage. Only the audio source and the weighting differ."""
import random
import numpy as np
from capture_audiosync import fit_track
from capture_edit.model import make_events
from capture_realaudio import pair_from_clip, gcc_gamma
from capture_syncedit.syncedit import edit_cuts, cut_damage, EVENT_RATE


def real_camera_errors(rng, clip, n_cams, mode, t_clip, win_s, snr_db, gamma, kind="white",
                       ppm=40.0, d0_s=0.8, span_s=3600.0, n_win=12):
    """Sync error (s) of each camera at t_clip; camera 0 is the reference. Same clock model as capture-syncedit
    (rate uniform in +-ppm, 0.8 s start offset), but each window's estimate comes from a real clip."""
    times = np.linspace(0, span_s, n_win)
    err = [0.0]
    for _ in range(1, n_cams):
        rate = rng.uniform(-ppm, ppm)
        true = d0_s + rate * 1e-6 * times
        est = []
        for tau in true:
            a, b = pair_from_clip(clip, rng, float(tau), win_s, snr_db, kind)
            est.append(gcc_gamma(a, b, gamma, max_lag_s=win_s))
        est = np.array(est)
        truth_now = d0_s + rate * 1e-6 * t_clip
        if mode == "once":
            err.append(float(est[0] - truth_now))
        else:
            icpt, slope = fit_track(times, est)
            err.append(float(icpt + slope * t_clip - truth_now))
    return err


def real_trial(seed, clip, mode, win_s, snr_db, gamma, kind="white", n_cams=4, span_s=3600.0):
    rng = np.random.default_rng(seed)
    t_clip = float(rng.uniform(0, span_s - 120))
    err = real_camera_errors(rng, clip, n_cams, mode, t_clip, win_s, snr_db, gamma, kind, span_s=span_s)
    cuts = edit_cuts(seed, n_cams)
    events = make_events(120.0, random.Random(seed + 10_000), EVENT_RATE)
    out = cut_damage(cuts, err, events)
    out["max_err_ms"] = 1e3 * max(abs(e) for e in err)
    return out
