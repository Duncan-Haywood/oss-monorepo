"""Writes experiments/results.txt: share of a 6 h shoot out of a 40 ms tolerance, offset hold vs fitted-slope hold."""
import os
import sys

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from capture_syncslope import simulate  # noqa: E402

SEEDS = range(8)
out = ["## share of a 6 h shoot more than 40 ms off; 40 ppm base drift, 8 seeds, 2 s windows (residual searched), first sync 10 s",
       "wobble_ppm (period 3600 s) | snr_db | every_s | offset_hold | slope_hold | slope_reset_hold | rejected_offset | rejected_slope | rejected_slope_reset | wrong_applied_offset | wrong_applied_slope | wrong_applied_slope_reset"]
for wob in (0, 10, 30):
    for snr in (-15, -12, -10, 0):
        for every in (300, 900, 1800, 3600):
            r = {m: [simulate(s, m[:5], every_s=every, snr_db=snr, wobble_ppm=wob, reset_after=2 if m == "slope_reset" else 0) for s in SEEDS] for m in ("offset", "slope", "slope_reset")}
            f = lambda m, i: np.mean([x[i] for x in r[m]])
            out.append(f"{wob} | {snr} | {every} | {f('offset',0):.3f} | {f('slope',0):.3f} | {f('slope_reset',0):.3f} | {f('offset',1):.1f} | {f('slope',1):.1f} | {f('slope_reset',1):.1f} | {f('offset',2):.1f} | {f('slope',2):.1f} | {f('slope_reset',2):.1f}")
            print(out[-1], flush=True)
open(os.path.join(os.path.dirname(__file__), "results.txt"), "w").write("\n".join(out) + "\n")
