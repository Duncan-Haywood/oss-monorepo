"""Sweep the rate criterion's task time T (0.5, 1, 3, 10 s) and tip bound (1, 2, 5, 10 mm) and ask whether
any threshold makes the minimum holding force settings-independent. Each trajectory (bar 20-60 mm, 8 solver
settings: condim 3/4, timeconst 0.002/0.008, impratio 1/10; mu 0.5; 13 geometric forces 0.05..20 N) is
simulated once and every threshold is applied to it. Spread = max/min over the 8 settings of the minimum
holding force (smallest grid force from which all larger ones pass; failures at 20 N counted as 20 N).
Writes results.txt / results.json."""
import itertools
import json
import os
import sys

here = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(here, "..", "src"))
import mujoco  # noqa: E402
from robofab_slipthresh.crit import min_grid_force, rate_hold  # noqa: E402
from robofab_slipthresh.model import torque_bounds  # noqa: E402
from robofab_slipthresh.sim import run  # noqa: E402

MU = 0.5
LENS = (20, 30, 40, 60)
FORCES = [round(0.05 * (400 ** (i / 12)), 4) for i in range(13)]
SETTINGS = list(itertools.product((3, 4), (0.002, 0.008), (1.0, 10.0)))
TASKS = (0.5, 1.0, 3.0, 10.0)
TIPS = (1.0, 2.0, 5.0, 10.0)

traj = {}
for L in LENS:
    for s in SETTINGS:
        traj[(L, s)] = [run(L, f, MU, s[0], timeconst=s[1], impratio=s[2]) for f in FORCES]

out = {"mujoco": mujoco.__version__, "forces": FORCES, "cells": [], "summary": []}
for T, tip in itertools.product(TASKS, TIPS):
    worst, nfail, nbr, ncell = 1.0, 0, 0, 0
    per_len = {}
    for L in LENS:
        tb = torque_bounds(L, MU)
        mins = []
        for s in SETTINGS:
            flags = [rate_hold(*tr, L, task_s=T, tip_mm=tip) for tr in traj[(L, s)]]
            m = min_grid_force(flags, FORCES)
            mins.append(m)
            ncell += 1
            nfail += m is None
            nbr += m is not None and tb["lower"] / 2 <= m <= tb["upper"] * 2
            out["cells"].append(dict(L=L, condim=s[0], timeconst=s[1], impratio=s[2], task_s=T, tip_mm=tip, min_force=m))
        v = [x if x is not None else 20.0 for x in mins]
        per_len[L] = max(v) / min(v)
        worst = max(worst, per_len[L])
    out["summary"].append(dict(task_s=T, tip_mm=tip, worst_spread=worst, spread_by_L=per_len,
                               fail_cells=nfail, within_2x_bracket=nbr, cells=ncell))
lines = ["MuJoCo %s" % mujoco.__version__,
         "rate criterion sweep: task_s tip_mm | spread (max/min over 8 settings) at L=20/30/40/60 | worst | cells failing at 20 N | cells within 2x of torque bracket (of 32)"]
for s in out["summary"]:
    lines.append("%5.1f %5.1f | %s | %6.1f | %2d | %2d" % (s["task_s"], s["tip_mm"], " ".join("%6.1f" % s["spread_by_L"][L] for L in LENS),
                                                      s["worst_spread"], s["fail_cells"], s["within_2x_bracket"]))
open(os.path.join(here, "results.txt"), "w").write("\n".join(lines) + "\n")
json.dump(out, open(os.path.join(here, "results.json"), "w"), indent=1)
print("\n".join(lines))
