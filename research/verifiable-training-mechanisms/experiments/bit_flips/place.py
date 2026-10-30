"""Milestone 40: put the measured harm share on the milestone 39 grid. f = q * P(harm); is replication chosen at that f?
Run from here:  python3 place.py   (reads results.json; writes place.txt; stdlib only)"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "faulty_workers"))
from run import best  # noqa: E402

harm = json.load(open(os.path.join(HERE, "results.json")))["overall_harm"]["0.01"]
lines = [f"measured P(harm | flip) at eps 0.01 = {harm:.3f}",
         "q (jobs with a flip)  f=q*P   cells choosing m>1 (grid: g 0.5/0.9, kappa 0.2/1, L 100/1000/10000, c 5/20, lam 0.01/1)"]
for q in (0.001, 0.01, 0.1, 0.5, 1.0):
    f = q * harm
    cells = [(g, k, L, c, lam) for g in (0.5, 0.9) for k in (0.2, 1.0) for L in (100.0, 1000.0, 10000.0) for c in (5.0, 20.0) for lam in (0.01, 1.0)]
    n = sum(1 for (g, k, L, c, lam) in cells if best(g, k, f, L, c, lam)[1] > 1)
    lines.append("%-20g %.5f  %d of %d" % (q, f, n, len(cells)))
open(os.path.join(HERE, "place.txt"), "w").write("\n".join(lines) + "\n")
print("\n".join(lines))
