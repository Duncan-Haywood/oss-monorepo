"""Slenderness scan: FE tip-shear critical load of a w = 8, b = 2 mm bar against the
Timoshenko-Gere closed form, for l/w = 3, 6, 12, 24. Writes scan.txt.

Element size in x is held at 2 mm (nx = l/2) with ny = 4, nz = 2, the middle mesh of
simdesign-shellorder, so the discretisation error is roughly the same at every length.
Usage: python scan.py [l ...]
"""
import os, sys, time
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))
from simdesign_shellaspect import eigbuckle as eb

W, B, NY, NZ = 8.0, 2.0, 4, 2
LENGTHS = [float(a) for a in sys.argv[1:]] or [24.0, 48.0, 96.0, 192.0]
lines = ["l l/w nx ny nz FE_crit(N) closed(N) ratio seconds"]
for l in LENGTHS:
    nx = int(l // 2)
    cf = eb.closed_forms(l, W, B, "shear")
    t = time.time()
    fe = eb.critical_loads(l, W, B, "shear", nx, NY, NZ, k=2)[0]
    lines.append(f"{l:g} {l/W:g} {nx} {NY} {NZ} {fe:.3f} {cf:.3f} {fe/cf:.5f} {time.time()-t:.0f}")
    print(lines[-1], flush=True)
open(os.path.join(HERE, "scan.txt"), "w").write("\n".join(lines) + "\n")
