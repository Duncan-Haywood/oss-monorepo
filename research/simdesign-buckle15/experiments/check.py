"""1.5 mm bracket design (w = 18.4 mm) in a through-thickness-converged 3D eigenbuckling model.
Writes check.txt. Arms: horizontal (length L-w, unit tip shear), vertical (length H, unit end moment)."""
import os, sys, time
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))
from simdesign_buckle15 import eigbuckle as eb

B, L, H, F = 1.5, 80.0, 80.0, 100.0
MESHES = [(18, 2, 1), (36, 4, 1), (36, 4, 2)]
W = 18.4
lines = ["b = 1.5 mm, w = 18.4 mm (lightest design of simdesign-bucklebound). FE = 3D hex eigenbuckling.",
         "arm mesh(nx,ny,nz) FE_crit closed ratio(FE/closed) seconds"]
res = {}
for arm, l, load in (("vertical", H, "moment"), ("horizontal", L - W, "shear")):
    for m in MESHES:
        t = time.time()
        fe = eb.critical_loads(l, W, B, load, *m, k=2)[0]
        cf = eb.closed_forms(l, W, B, load)
        res[(arm, m)] = fe
        lines.append(f"{arm} {m} {fe:10.2f} {cf:10.2f} {fe/cf:6.3f} {time.time()-t:5.0f}")
        print(lines[-1], flush=True)
m = MESHES[-1]
fv = res[("vertical", m)] / (F * (L - W / 2))
fh = res[("horizontal", m)] / F
lines.append(f"governing safety factor at F=100 N, finest mesh: vertical {fv:.2f}, horizontal {fh:.2f}")
cv = eb.closed_forms(H, W, B, "moment") / (F * (L - W / 2)); ch = eb.closed_forms(L - W, W, B, "shear") / F
lines.append(f"closed forms: vertical {cv:.2f}, horizontal {ch:.2f}")
print(lines[-2:])
open(os.path.join(HERE, "check.txt"), "w").write("\n".join(lines) + "\n")
