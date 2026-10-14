"""Uniform-refinement series for a short bar (l = 24, w = 8, b = 2 mm, tip shear). Writes scan.txt.

Meshes double in every direction: (6,2,1), (12,4,2), (24,8,4). Usage: python scan.py [level ...]
"""
import os, sys, time
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))
from simdesign_shellorder import eigbuckle as eb

L, W, B = 24.0, 8.0, 2.0
MESHES = [(6, 2, 1), (12, 4, 2), (24, 8, 4)]
levels = [int(a) for a in sys.argv[1:]] or range(len(MESHES))
cf = eb.closed_forms(L, W, B, "shear")
lines = [f"level nx ny nz FE_crit(N) closed(N) ratio seconds   (closed form = {cf:.2f} N)"]
for i in levels:
    nx, ny, nz = MESHES[i]
    t = time.time()
    fe = eb.critical_loads(L, W, B, "shear", nx, ny, nz, k=2)[0]
    lines.append(f"{i} {nx} {ny} {nz} {fe:.3f} {cf:.3f} {fe/cf:.5f} {time.time()-t:.0f}")
    print(lines[-1], flush=True)
open(os.path.join(HERE, "scan.txt"), "w").write("\n".join(lines) + "\n")
