"""Plot factor vs width per gauge, and minimum plate mass vs gauge, from sweep.txt -> sweep.png"""
import os
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
HERE = os.path.dirname(os.path.abspath(__file__))
pts, roots = {}, {}
for ln in open(os.path.join(HERE, "sweep.txt")):
    p = ln.split()
    if p and p[0] == "coarse" and len(p) == 6 and p[1] != "root":
        pts.setdefault(float(p[1]), {})[float(p[2])] = float(p[3])
    if len(p) >= 4 and p[0] == "fine" and p[1] == "root":
        roots[float(p[2][2:])] = float(p[4][5:])
    if len(p) >= 4 and p[0] == "coarse" and p[1] == "root":
        roots.setdefault(float(p[2][2:]), float(p[4][5:]))
fig, (a, b) = plt.subplots(1, 2, figsize=(10, 3.8))
for g in sorted(pts):
    xs = sorted(pts[g]); a.plot(xs, [pts[g][x] for x in xs], "o-", ms=3, label=f"b = {g} mm")
a.axhline(3, color="k", ls="--", lw=1)
a.set_xlabel("web width w (mm)"); a.set_ylabel("reversed-load buckling factor (coarse mesh)"); a.legend(); a.grid(alpha=.3)
gs = sorted(roots); b.plot(gs, [roots[g] for g in gs], "s-")
b.set_xlabel("sheet thickness b (mm)"); b.set_ylabel("plate mass at the floor of 3 (g)"); b.grid(alpha=.3)
fig.tight_layout(); fig.savefig(os.path.join(HERE, "sweep.png"), dpi=130)
