"""Sweeps for capture-audiosync. Writes experiments/results.txt. Deterministic (seeded)."""
import os
import numpy as np
from capture_audiosync import trial, resync_interval_s

SEEDS = range(10)
OUT = os.path.join(os.path.dirname(__file__), "results.txt")
lines = []


def agg(**kw):
    rs = [trial(s, **kw) for s in SEEDS]
    g = lambda k: np.array([r[k] for r in rs])
    return (g("window_bad").mean(), np.median(g("fit_max_ms")), np.percentile(g("fit_max_ms"), 95),
            np.median(g("offset_only_max_ms")), g("slope_err_ppm").mean())


def emit(s=""):
    print(s)
    lines.append(s)


emit("# 1 h span, 12 windows, true clock error 40 ppm, start offset 0.8 s, 10 seeds, one frame = 33.3 ms (30 fps)")
emit("# bad = share of single windows off by more than one frame; fit = Theil-Sen line over the 12 windows")
emit("\n## SNR x window length (no reverb)")
emit("snr_db | win_s | bad_window_share | fit_max_ms_median | fit_max_ms_p95 | offset_only_max_ms_median | slope_err_ppm")
for snr in (-20, -15, -10, -5, 0, 10, 20):
    for w in (0.5, 1, 2, 5, 10):
        b, m, p, o, sl = agg(snr_db=snr, win_s=w)
        emit(f"{snr} | {w} | {b:.3f} | {m:.2f} | {p:.2f} | {o:.0f} | {sl:.2f}")

emit("\n## Reverb (direct-to-reverberant ratio, RT60 0.4 s), 2 s windows")
emit("ddr_db | snr_db | bad_window_share | fit_max_ms_median | fit_max_ms_p95")
for ddr in (None, 10, 0, -5, -10):
    for snr in (10, 0, -10):
        b, m, p, o, sl = agg(snr_db=snr, win_s=2, ddr_db=ddr)
        emit(f"{ddr} | {snr} | {b:.3f} | {m:.2f} | {p:.2f}")

emit("\n## Clock error (ppm) at SNR 0 dB, 2 s windows: offset-only error after 1 h vs analytic e*3600 s")
emit("ppm | analytic_ms | offset_only_max_ms_median | fit_max_ms_median | resync_for_1_frame_s")
for ppm in (0, 10, 20, 40, 100):
    b, m, p, o, sl = agg(snr_db=0, win_s=2, ppm=ppm)
    emit(f"{ppm} | {ppm*1e-6*3600*1e3:.0f} | {o:.0f} | {m:.2f} | {resync_interval_s(ppm, 1/30):.0f}")

emit("\n## Number of windows over the hour at SNR -10 dB, 2 s windows (how many to survive false peaks)")
emit("n_win | bad_window_share | fit_max_ms_median | fit_max_ms_p95")
for n in (3, 5, 8, 12, 24):
    rs = [trial(s, snr_db=-10, win_s=2, n_win=n) for s in SEEDS]
    f = np.array([r["fit_max_ms"] for r in rs])
    emit(f"{n} | {np.mean([r['window_bad'] for r in rs]):.3f} | {np.median(f):.2f} | {np.percentile(f,95):.2f}")
open(OUT, "w").write("\n".join(lines) + "\n")
