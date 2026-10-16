"""Minimum width and plate mass that clear the reversed-load floor of 3, per gauge. Writes sweep.txt."""
import os, sys, time
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))
from simdesign_revgauge import gauge as g

OUT = os.path.join(HERE, "sweep.txt")
COARSE, FINE = (2, 18, 14, 1), (4, 36, 28, 1)
lines = ["Reversed load (vertical arm in compression), floor 3. factor = critical load / 100 N.",
         "stage b_mm w_mm factor mass_g seconds"]


def log(stage, b, w, f, t):
    lines.append(f"{stage} {b} {w:.3f} {f:.3f} {g.mass_g(w, b):.2f} {t:.0f}")
    print(lines[-1], flush=True)
    open(OUT, "w").write("\n".join(lines) + "\n")


def timed(stage, b, mesh):
    def f(w):
        t = time.time(); v = g.factor(w, b, mesh); log(stage, b, w, v, time.time() - t); return v
    return f


# bracket per gauge (lo, hi): lo fails the floor, hi clears it (checked by find_width)
BRACKETS = {1.5: (20.0, 24.0), 2.0: (8.0, 14.0), 2.5: (6.0, 10.0), 3.0: (4.0, 9.0)}
roots = {}
for b, (lo, hi) in BRACKETS.items():
    w, _, _ = g.min_mass_row(b, timed("coarse", b, COARSE), lo, hi, tol=0.1)
    roots[b] = w
    lines.append(f"coarse root b={b} w={w:.3f} mass={g.mass_g(w, b):.2f} g")
for b in (1.5, 2.0, 2.5):
    w0 = roots[b]
    w, _, _ = g.min_mass_row(b, timed("fine", b, FINE), w0 - 0.6, w0 + 0.6, tol=0.1)
    lines.append(f"fine root b={b} w={w:.3f} mass={g.mass_g(w, b):.2f} g")
open(OUT, "w").write("\n".join(lines) + "\n")
