"""Plain vs coarse-to-fine sync. Writes experiments/results.txt. Deterministic (seeded)."""
import os
import numpy as np
from capture_syncfine import trial_plain, trial_coarse_fine, audio_seconds

SEEDS = range(20)
OUT = os.path.join(os.path.dirname(__file__), "results.txt")
lines = []


def emit(s=""):
    print(s)
    lines.append(s)


def rate(fn, **kw):
    rs = [fn(s, **kw) for s in SEEDS]
    return (np.mean([r["fit_ok"] for r in rs]), np.median([r["fit_max_ms"] for r in rs]),
            np.mean([r.get("coarse_err_ms", 0) < 33.3 for r in rs]))


emit("# 1 h span, 12 windows, 40 ppm, start offset 0.8 s, 20 seeds; ok = fitted line within one 30 fps frame over the hour")
emit("# coarse = one 10 s window at t=0, then each window is cut with B shifted by that estimate")
emit("\n## success rate (share of seeds with the line within one frame) by SNR and window length, no reverb")
emit("snr_db | win_s | plain_ok | coarse_fine_ok | coarse_step_ok | coarse_fine_fit_ms_median | audio_s_plain | audio_s_cf")
for snr in (-20, -17, -15, -12, -10, -5, 0):
    for w in (0.5, 1, 2):
        p, _, _ = rate(trial_plain, snr_db=snr, win_s=w)
        c, m, cs = rate(trial_coarse_fine, snr_db=snr, win_s=w)
        emit(f"{snr} | {w} | {p:.2f} | {c:.2f} | {cs:.2f} | {m:.2f} | {audio_seconds(12, w):.0f} | {audio_seconds(12, w, True):.0f}")

emit("\n## reverb (RT60 0.4 s), 1 s windows, SNR 0 dB")
emit("ddr_db | plain_ok | coarse_fine_ok")
for ddr in (None, 0, -5, -10):
    p, _, _ = rate(trial_plain, snr_db=0, win_s=1, ddr_db=ddr)
    c, _, _ = rate(trial_coarse_fine, snr_db=0, win_s=1, ddr_db=ddr)
    emit(f"{ddr} | {p:.2f} | {c:.2f}")
open(OUT, "w").write("\n".join(lines) + "\n")
