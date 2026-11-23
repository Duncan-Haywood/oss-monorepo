"""Post-hoc diagnostic for milestone 73 (not registered): re-zeros and wall failure against a uniform per-press eps,
G1 under RW at D1 = 0.1 N. python experiments/m73_randomwalk/scan.py > experiments/m73_randomwalk/scan.txt"""
import sys, numpy as np
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import run as M
P = M.plans()
for n, plan in (("g1", "LAYOUT"), ("g1", "BANDS k+0")):
    g, t, a = M.M72.wall(P[n][plan])
    for eps in np.geomspace(1e-4, 0.2, 14):
        st = M.schedule(g, t, a, "CAL", "RW", 0.1, eps)
        T = M.D.deadlines(np.unique(a), 0, M.D.matched("RW", 0.1)[1], eps)
        print(n, plan, f"{eps:.2e}", len(st), M.fail(g, t, a, st, "RW", 0.1, 73), np.round(T, 1), flush=True)
