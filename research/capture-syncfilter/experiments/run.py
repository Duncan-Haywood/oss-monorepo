"""Writes experiments/results.txt: share of a 6 h shoot more than 40 ms off, five clock scenarios x holds."""
import os
import sys

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from capture_syncfilter import simulate, scenario_delay  # noqa: E402
from capture_syncfilter.filt import MODES_ALL  # noqa: E402

SEEDS = range(6)
out = ["## share of a 6 h shoot more than 40 ms off; 6 seeds, 2 s windows (residual searched), first sync 10 s, reset after 2 rejections",
       "## relative clock rate (ppm), min / max over the shoot: " + "; ".join(
           f"{n} {scenario_delay(n)[1].min():.2f} / {scenario_delay(n)[1].max():.2f}" for n in ("static", "warmup", "sunday", "wobble10", "wobble30")),
       "scenario | snr_db | every_s | " + " | ".join(MODES_ALL) + " | rejected_" + " | rejected_".join(MODES_ALL)]
for sc in ("static", "warmup", "sunday", "wobble10", "wobble30"):
    for snr in (-12, -15):
        for every in (300, 900, 1800, 3600):
            r = {m: [simulate(s, m, scenario=sc, every_s=every, snr_db=snr) for s in SEEDS] for m in MODES_ALL}
            out.append(f"{sc} | {snr} | {every} | " + " | ".join(f"{np.mean([x[0] for x in r[m]]):.3f}" for m in MODES_ALL)
                       + " | " + " | ".join(f"{np.mean([x[1] for x in r[m]]):.1f}" for m in MODES_ALL))
            print(out[-1], flush=True)
open(os.path.join(os.path.dirname(__file__), "results.txt"), "w").write("\n".join(out) + "\n")
