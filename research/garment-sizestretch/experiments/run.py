"""Sizes needed vs fabric stretch, on a stylised bust/hip population.

    PYTHONPATH=src python experiments/run.py > experiments/results.txt
"""
import sys
import time
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from garment_sizestretch import population, exact, coverage

N, LOOSE, SEEDS = 250, 8.0, (1, 2, 3)
KS = (1, 2, 3, 4, 6, 8)
STRETCH = (0.0, 0.05, 0.10, 0.20, 0.30)
t0 = time.time()
print("garment-sizestretch: SYNTHETIC population, bust ~ N(95, 8^2), hip ~ N(100, 8^2) cm, ASSUMED parameters (not a survey).")
print(f"   fit window per measurement: [s - {LOOSE:g} cm, s * (1 + stretch)]; n = {N} people per draw; mean over seeds {SEEDS}.")
print("   exact = optimum over candidate sizes (HiGHS integer program); proven-optimal solves counted.")
print()
res = {}
proven = {}
for rho in (0.0, 0.5, 0.9):
    print(f"A. rho = {rho:.1f}: share fitted in-sample by k sizes")
    print("   stretch | " + "  ".join(f"k={k:<2d}" for k in KS))
    for st in STRETCH:
        row = []
        for k in KS:
            v = []
            for s in SEEDS:
                p = population(N, rho, s)
                _, e, status = exact(p, LOOSE, st, k, time_limit=60)
                v.append(e)
                proven[(rho, st, k)] = proven.get((rho, st, k), 0) + (status == 0)
            res[(rho, st, k)] = float(np.mean(v))
            row.append(res[(rho, st, k)])
        print(f"   {st*100:4.0f}%   | " + "  ".join(f"{x:.3f}" for x in row))
    print()
tot = sum(proven.values()); allp = len(proven) * len(SEEDS)
print(f"   solves proven optimal: {tot}/{allp}")
print()
print("B. Sizes needed to fit at least 80% in-sample ('>8' if none of k = 1..8 reaches it)")
print("   stretch | rho 0.0  rho 0.5  rho 0.9")
for st in STRETCH:
    cells = []
    for rho in (0.0, 0.5, 0.9):
        ks = [k for k in KS if res[(rho, st, k)] >= 0.8]
        cells.append(f"{ks[0] if ks else '>8':>5}")
    print(f"   {st*100:4.0f}%   | " + "   ".join(cells))
print()
print("C. Held-out check at k = 4: sizes chosen on 250 people, scored on a fresh 20000 (mean over seeds)")
print("   rho  stretch | in-sample  held-out")
for rho in (0.0, 0.5, 0.9):
    big = population(20000, rho, 99)
    for st in STRETCH:
        i, o = [], []
        for s in SEEDS:
            p = population(N, rho, s)
            pts, e, _ = exact(p, LOOSE, st, 4, time_limit=60)
            i.append(e); o.append(coverage(big, pts, LOOSE, st))
        print(f"   {rho:3.1f}   {st*100:4.0f}%  |  {np.mean(i):.3f}     {np.mean(o):.3f}")
print()
print(f"   run time {time.time()-t0:.0f} s")
