"""Is the upper group a separate basin? Scan w at fixed r (gauge 2 mm, rules, h=2.5 mm) and list feasible w.
Writes wscan.txt."""
import os, sys
import numpy as np
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "src"))
from simdesign_gaugebasins import PROCESSES, Params, evaluate

OUT = os.path.dirname(os.path.abspath(__file__))
proc = PROCESSES["laser cutting"]
L = ["laser cutting, gauge 2 mm, peak, h=2.5 mm; feasible w on a 0.1 mm scan of 13.5-16.5 at fixed r"]
for r in (6.0, 8.0, 10.0, 12.0, 14.0):
    ok = [round(float(w), 1) for w in np.arange(13.5, 16.51, 0.1)
          if evaluate(proc, Params(w=float(w), r=r, b=2.0), h=2.5, measure="peak")["feasible"]]
    L.append(f"r={r:4.1f}: " + (f"{len(ok)} feasible, contiguous={len(ok) == round((max(ok) - min(ok)) / 0.1) + 1}: {ok}" if ok else "none feasible"))
open(os.path.join(OUT, "wscan.txt"), "w").write("\n".join(L) + "\n")
print("\n".join(L))
