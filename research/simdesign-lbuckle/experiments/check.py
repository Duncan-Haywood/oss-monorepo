"""Whole L-bracket (b = 1.5 mm, w = 18.4 mm, arms 80 mm) in one 3D eigenbuckling model.
Writes check.txt. sign +1: downward load (vertical arm in tension); -1: reversed (compression)."""
import os, sys, time
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))
from simdesign_lbuckle import lbracket as lb

B, W, F = 1.5, 18.4, 100.0
CLOSED = 3.47   # vertical-arm closed form from simdesign-bucklebound / buckle15 (factor at 100 N)
MESHES = [(2, 18, 14, 1), (4, 36, 28, 1), (4, 36, 28, 2)]
lines = ["b = 1.5 mm, w = 18.4 mm. Whole L, 3D hex eigenbuckling; factor = critical load / 100 N.",
         "sign mesh(nw,nh,nl,nz) factor1 factor2 factor3 seconds"]
open(os.path.join(HERE, "check.txt"), "w").write("\n".join(lines) + "\n")
for m in MESHES:
    for s in (1, -1):
        t = time.time()
        f = lb.critical_factors(W, B, k=3, sign=s, nw=m[0], nh=m[1], nl=m[2], nz=m[3]) / F
        lines.append(f"{s:+d} {m} {f[0]:.3f} {f[1]:.3f} {f[2]:.3f} {time.time()-t:.0f}")
        print(lines[-1], flush=True)
        open(os.path.join(HERE, "check.txt"), "w").write("\n".join(lines) + "\n")
lines.append(f"closed-form vertical-arm factor (moment only, simdesign-bucklebound): {CLOSED}")
open(os.path.join(HERE, "check.txt"), "w").write("\n".join(lines) + "\n")
