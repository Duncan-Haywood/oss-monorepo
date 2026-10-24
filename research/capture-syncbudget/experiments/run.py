"""Writes experiments/results.txt. About 5 to 10 minutes."""
import os
import sys

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from capture_syncbudget import resync_interval_s, simulate  # noqa: E402

SEEDS = range(10)
out = []
out.append("## analytic: seconds an offset-only sync stays within 40 ms (EBU R37 lead limit), by clock error and residual after sync")
out.append("ppm | residual_0ms | residual_5ms | residual_20ms")
for ppm in (5, 10, 20, 40, 100):
    out.append(f"{ppm} | " + " | ".join(f"{resync_interval_s(ppm, 0.040, r):.0f}" for r in (0, 0.005, 0.020)))

out.append("")
out.append("## share of a 6 h shoot with the applied sync more than 40 ms off; 40 ppm, 10 seeds, 2 s windows, first sync 10 s")
out.append("snr_db | every_s | ideal_estimates | naive | gated | rejected_per_run_gated | wrong_applied_per_run_naive | wrong_applied_per_run_gated")
for snr in (-20, -17, -15, -12, -10, 0):
    for every in (300, 900, 1800, 3600):
        r = {g: [simulate(s, ppm=40, every_s=every, snr_db=snr, gate=g) for s in SEEDS] for g in (False, True)}
        ideal = max(0.0, 1 - 1000 / every) if every > 1000 else 0.0
        # ideal: an estimate every `every` s with zero error; the error ramps 0 -> 40e-6*every s
        out.append(f"{snr} | {every} | {ideal:.3f} | {np.mean([x[0] for x in r[False]]):.3f} | {np.mean([x[0] for x in r[True]]):.3f}"
                   f" | {np.mean([x[2] for x in r[True]]):.1f} | {np.mean([x[3] for x in r[False]]):.1f} | {np.mean([x[3] for x in r[True]]):.1f}")
        print(out[-1], flush=True)
open(os.path.join(os.path.dirname(__file__), "results.txt"), "w").write("\n".join(out) + "\n")
