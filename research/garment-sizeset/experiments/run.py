"""Size-run coverage: exact vs greedy vs regular grid on a stylised bust/hip population.

    PYTHONPATH=src python experiments/run.py > experiments/results.txt
"""
import sys
import time
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from garment_sizeset import population, greedy, exact, grid_run, coverage

N, TOL, SEEDS, KS = 300, 4.0, (1, 2, 3), (1, 2, 3, 4, 6, 8)
t0 = time.time()
print("garment-sizeset: SYNTHETIC population, bust ~ N(95, 8^2) and hip ~ N(100, 8^2) cm, ASSUMED parameters (not a survey).")
print(f"   n = {N} people per draw, tolerance +-{TOL:g} cm on both measurements, sizes at sample points; mean over seeds {SEEDS}.")
print("   'exact' is the optimum over the same candidates (HiGHS integer program); 'opt?' counts solves proven optimal.")
print()
print("A. Share of the population fitted by k sizes")
print("   rho   k |  grid  greedy  exact | exact-grid (pts) | opt?")
summary = {}
for rho in (0.0, 0.5, 0.9):
    for k in KS:
        g, gr, ex, proven = [], [], [], 0
        for s in SEEDS:
            p = population(N, rho, s)
            g.append(grid_run(p, TOL, k)[1])
            gr.append(greedy(p, TOL, k)[1])
            _, e, st = exact(p, TOL, k, time_limit=60)
            ex.append(e)
            proven += st == 0
        summary[(rho, k)] = (np.mean(g), np.mean(gr), np.mean(ex))
        print(f"   {rho:3.1f}  {k:2d} | {np.mean(g):.3f}  {np.mean(gr):.3f}  {np.mean(ex):.3f} |      {100*(np.mean(ex)-np.mean(g)):+5.1f}       | {proven}/{len(SEEDS)}")
print()
print("B. Sizes needed to fit at least 80% (first k in the table above reaching it; '>8' if none)")
for rho in (0.0, 0.5, 0.9):
    row = []
    for name, idx in (("grid", 0), ("greedy", 1), ("exact", 2)):
        ks = [k for k in KS if summary[(rho, k)][idx] >= 0.8]
        row.append(f"{name} {ks[0] if ks else '>8'}")
    print(f"   rho {rho:3.1f}: " + ", ".join(row))
print()
print("C. Held-out check: sizes chosen on one draw of 300, scored on a fresh draw of 20000 (mean over seeds)")
print("   rho   k | exact in-sample  exact held-out | grid in-sample  grid held-out")
big = {rho: population(20000, rho, 99) for rho in (0.0, 0.5, 0.9)}
for rho in (0.0, 0.5, 0.9):
    for k in (4, 8):
        ei, eo, gi, go = [], [], [], []
        for s in SEEDS:
            p = population(N, rho, s)
            pts, e, _ = exact(p, TOL, k, time_limit=60)
            gp, g = grid_run(p, TOL, k)
            ei.append(e); eo.append(coverage(big[rho], pts, TOL))
            gi.append(g); go.append(coverage(big[rho], gp, TOL))
        print(f"   {rho:3.1f}  {k:2d} |      {np.mean(ei):.3f}            {np.mean(eo):.3f}      |    {np.mean(gi):.3f}          {np.mean(go):.3f}")
print()
print(f"   run time {time.time()-t0:.0f} s")
