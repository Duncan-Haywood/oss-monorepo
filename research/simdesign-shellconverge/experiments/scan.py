"""Mesh-convergence scan of the 3D eigenbuckling model (b = 2 mm). Writes scan.txt.

Usage: python scan.py [w ...]   (default 8 16 25)
"""
import os, sys, time
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))
from simdesign_shellconverge import eigbuckle as eb

B, L, H = 2.0, 80.0, 80.0
# (name, nx, ny, nz): base mesh, then one direction refined at a time, then all together.
MESHES = [("base", 36, 4, 1), ("thick2", 36, 4, 2), ("len72", 72, 4, 1),
          ("wid8", 36, 8, 1), ("all", 72, 8, 2)]
widths = [float(a) for a in sys.argv[1:]] or [8.0, 16.0, 25.0]
ONLY = set(os.environ.get("ONLY", "").split(",")) - {""}  # e.g. ONLY=vertical:wid8,vertical:all
out = os.path.join(HERE, "scan.txt")
lines = ["FE = 3D hexahedral eigenbuckling (ElementHex2), clamped at x=0; closed = Timoshenko-type formula.",
         "mesh = (nx along length, ny across width w, nz through thickness b).",
         "arm w(mm) mesh nx ny nz FE_crit closed ratio seconds"]
for w in widths:
    for arm, l, load in (("horizontal", L - w, "shear"), ("vertical", H, "moment")):
        cf = eb.closed_forms(l, w, B, load)
        for name, nx, ny, nz in MESHES:
            if ONLY and f"{arm}:{name}" not in ONLY:
                continue
            t = time.time()
            fe = eb.critical_loads(l, w, B, load, nx, ny, nz, k=2)[0]
            lines.append(f"{arm} {w:.1f} {name} {nx} {ny} {nz} {fe:.2f} {cf:.2f} {fe/cf:.4f} {time.time()-t:.0f}")
            print(lines[-1], flush=True)
            open(out if len(sys.argv) == 1 else out + ".part" + "_".join(map(str, widths)), "w").write("\n".join(lines) + "\n")
