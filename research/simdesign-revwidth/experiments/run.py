"""Reversed-load width sweep and root find. Writes sweep.txt."""
import os, sys, time
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))
from simdesign_revwidth import sweep as sw

OUT = os.path.join(HERE, "sweep.txt")
lines = ["b = 1.5 mm, reversed load (vertical arm in compression), floor 3. factor = critical load / 100 N.",
         "stage w_mm factor mass_g seconds"]
def log(stage, w, f, t):
    lines.append(f"{stage} {w:.3f} {f:.3f} {sw.mass_g(w):.2f} {t:.0f}")
    print(lines[-1], flush=True)
    open(OUT, "w").write("\n".join(lines) + "\n")

def timed(stage, mesh):
    def f(w):
        t = time.time(); v = sw.factor(w, sign=-1, mesh=mesh); log(stage, w, v, time.time() - t); return v
    return f

for w in (18.4, 20.0, 22.0, 24.0, 26.0):
    timed("sweep-coarse", (2, 18, 14, 1))(w)
wc, _ = sw.find_width(3.0, 20.0, 24.0, timed("bisect-coarse", (2, 18, 14, 1)), tol=0.05)
lines.append(f"coarse root w = {wc:.3f}")
# check on the finer mesh at the coarse root, then bisect there in a narrow bracket
fine = timed("fine", (4, 36, 28, 1))
wf, _ = sw.find_width(3.0, wc - 0.6, wc + 0.6, fine, tol=0.1)
lines.append(f"fine root w = {wf:.3f}")
open(OUT, "w").write("\n".join(lines) + "\n")
