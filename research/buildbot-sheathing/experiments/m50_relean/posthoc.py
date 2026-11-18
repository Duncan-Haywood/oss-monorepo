"""Milestone 50 post hoc (after the run; not registered): the drag limits as a dragged-hose length.

A hose dragged along the floor holds at most mu_f w g L of horizontal tension (hose.max_drag). For each pose's
smallest tolerated tension (section A at the current lean, section B2 at the best lean), the dragged length L at
which the floor could reach that tension, for both hoses and milestone 37's floor frictions mu_f 0.3/0.5/0.8.
Reads results.json; prints posthoc.txt.
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "src"))
from buildbot_sheathing import hose as Ho  # noqa: E402

D = json.load(open(os.path.join(HERE, "results.json")))
MU_F = [0.3, 0.5, 0.8]                           # milestone 37's hose-on-floor friction sweep (not sourced)
print("# Milestone 50 post hoc: dragged hose length (m) at which the floor can reach each pose's drag limit")
print("robot | pose | lean | smallest tolerated tension (N) | " + " | ".join(
    f"{h} mu_f {m}" for h in Ho.HOSES for m in MU_F))
rows = [(a["robot"], a["pose"], "current", a["worst"]) for a in D["A"] if a["nosh"]]
rows += [(b["robot"], b["pose"], "best", min(h for h in b["refined"]["H"] if h is not None)) for b in D["B"]]
lo = min(a["worst"] for a in D["A"])
for n, p, lean, H in rows:
    Ls = [H / (m * w * Ho.G) for w in Ho.HOSES.values() for m in MU_F]
    print(f"  {n} {p} | {lean} | {H:.1f} | " + " | ".join(f"{L:.1f}" for L in Ls))
ok = [a for a in D["A"] if not a["nosh"]]
print(f"poses with S_H (milestone 48): {len(ok)}; smallest tolerated tension among them "
      f"{min(a['worst'] for a in ok):.1f} N; over all 34 poses at the current lean {lo:.1f} N")
