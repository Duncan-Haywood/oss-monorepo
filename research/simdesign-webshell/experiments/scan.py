"""3D eigenbuckling vs closed form for the bracket arms (b = 2 mm). Writes scan.txt."""
import os, sys, time
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))
from simdesign_webshell import eigbuckle as eb

B, L, H = 2.0, 80.0, 80.0
MESHES = [(18, 2, 1), (36, 4, 1)]
lines = ["FE = 3D hexahedral eigenbuckling (ElementHex2), clamped at x=0; closed = Timoshenko-type formula.",
         "horizontal arm: length L-w, unit tip shear (N). vertical arm: length H, unit end moment (N mm).",
         "arm w(mm) mesh(nx,ny,nz) FE_crit closed ratio(FE/closed) seconds"]
for w in (8.0, 16.0, 25.0):
    for arm, l, load in (("horizontal", L - w, "shear"), ("vertical", H, "moment")):
        for m in MESHES:
            t = time.time()
            fe = eb.critical_loads(l, w, B, load, *m, k=2)[0]
            cf = eb.closed_forms(l, w, B, load)
            lines.append(f"{arm} {w:5.1f} {m} {fe:10.2f} {cf:10.2f} {fe/cf:6.3f} {time.time()-t:5.0f}")
            print(lines[-1], flush=True)
open(os.path.join(HERE, "scan.txt"), "w").write("\n".join(lines) + "\n")
