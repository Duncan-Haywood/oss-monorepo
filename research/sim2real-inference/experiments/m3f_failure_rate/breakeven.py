"""Plug-in break-even: at expected counts, how small must q10/p be for the twin-informed bound to beat Clopper-Pearson?
Assumes the twin failure rate equals p (the twin is unbiased in rate; q10 = mismatch rate), N = 10n twin runs.
python3 breakeven.py -> results/breakeven.txt"""
import os
import numpy as np
from failrate import cp_upper
out = ["n, p, largest q10/p at which U_informed < U_CP (expected counts, twin rate = p)"]
for n in (30, 60, 120, 240, 960):
    for p in (0.02, 0.05, 0.10):
        u0 = cp_upper(round(p * n), n, 0.05)
        best = 0.0
        for f in np.linspace(0, 1, 201):
            u1 = cp_upper(round(p * 10 * n), 10 * n, 0.025) + cp_upper(round(f * p * n), n, 0.025)
            if u1 < u0: best = f
        out.append(f"n={n:4d} p={p:.2f}: q10/p <= {best:.3f}")
open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "results", "breakeven.txt"), "w").write("\n".join(out) + "\n")
print("\n".join(out))
