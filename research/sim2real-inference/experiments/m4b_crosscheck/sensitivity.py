"""Re-run the m4 point estimates on (a) the transcription, (b) upstream values, (c) upstream plus the sixth Google task
(place apple in closed top drawer, n_real = 27: .074, .185, .407 are k/27). Eggplant n is swept over {24, 30} for (b), (c).
python3 sensitivity.py -> results/sensitivity.txt"""
import os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "m4_simpler")); sys.path.insert(0, HERE)
import numpy as np
import data
from analyse import loo_predictions, stats
from crosscheck import TASK, POL
from upstream_perf import REAL_PERF, SIMPLER_PERF

def upstream_rows(eggplant_n, with_apple):
    out = []
    for robot, task, p, n, _r, _s in data.rows():
        t, q = TASK[(robot, task)], POL[p]
        out.append((robot, task, p, eggplant_n if task == "eggplant_basket" else n, REAL_PERF[t][q], SIMPLER_PERF[t][q]))
    if with_apple:
        t = "google_robot_place_apple_in_closed_top_drawer"
        for p in data.GOOGLE_POLICIES:
            out.append(("google", "place_apple", p, 27, REAL_PERF[t][POL[p]], SIMPLER_PERF[t][POL[p]]))
    return out

def point(R):
    n = np.array([x[3] for x in R], float); real = np.array([x[4] for x in R]); sim = np.array([x[5] for x in R])
    raw, cal = loo_predictions(R)
    m_raw, v_real, pq = stats(real, n, raw); m_cal, _, _ = stats(real, n, cal)
    return len(R), m_raw, m_cal, v_real, pq / m_cal if m_cal > 0 else float("inf"), np.corrcoef(real, sim)[0, 1]

def main():
    cases = [("m4 transcription (eggplant n=30)", data.rows()),
             ("upstream, eggplant n=30", upstream_rows(30, False)), ("upstream, eggplant n=24", upstream_rows(24, False)),
             ("upstream + place_apple, eggplant n=30", upstream_rows(30, True)), ("upstream + place_apple, eggplant n=24", upstream_rows(24, True))]
    lines = ["%-40s %5s %9s %9s %9s %8s %6s" % ("case", "cells", "MSE_raw", "MSE_cal", "v_real", "n*", "r")]
    for name, R in cases:
        c, a, b, v, ns, r = point(R)
        lines.append("%-40s %5d %9.4f %9.4f %9.4f %8.1f %6.3f" % (name, c, a, b, v, ns, r))
    open(os.path.join(HERE, "results", "sensitivity.txt"), "w").write("\n".join(lines) + "\n"); print("\n".join(lines))

if __name__ == "__main__":
    main()
