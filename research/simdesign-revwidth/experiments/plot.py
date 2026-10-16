"""Plot factor vs width from sweep.txt -> sweep.png"""
import os
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
HERE = os.path.dirname(os.path.abspath(__file__))
coarse, fine = {}, {}
for ln in open(os.path.join(HERE, "sweep.txt")):
    p = ln.split()
    if len(p) == 5 and p[1] != "root" and p[0] in ("sweep-coarse", "bisect-coarse", "fine"):
        (fine if p[0] == "fine" else coarse)[float(p[1])] = float(p[2])
fig, ax = plt.subplots(figsize=(6, 3.8))
for d, lab, m in ((coarse, "coarse mesh (2,18,14,1)", "o"), (fine, "finer mesh (4,36,28,1)", "s")):
    xs = sorted(d); ax.plot(xs, [d[x] for x in xs], m + "-", ms=4, label=lab)
ax.axhline(3, color="k", ls="--", lw=1, label="floor of 3")
ax.set_xlabel("web width w (mm)"); ax.set_ylabel("reversed-load buckling factor"); ax.legend(); ax.grid(alpha=.3)
fig.tight_layout(); fig.savefig(os.path.join(HERE, "sweep.png"), dpi=130)
