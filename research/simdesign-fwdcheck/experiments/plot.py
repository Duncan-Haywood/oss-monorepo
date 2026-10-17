"""Peak stress on two meshes and the nominal stress against the 100 MPa limit -> stress.png."""
import os
import matplotlib; matplotlib.use("Agg")
import matplotlib.pyplot as plt
H = os.path.dirname(os.path.abspath(__file__))
rows = [l.split() for l in open(os.path.join(H, "results.txt")) if l[:1].isdigit()]
x = range(len(rows)); lab = [f"{r[0]} mm\nw = {r[1]}" for r in rows]
for k, (col, name, off) in enumerate([(4, "beam-theory nominal", -.27), (5, "FE peak, coarse mesh", 0), (6, "FE peak, finer mesh", .27)]):
    plt.bar([i + off for i in x], [float(r[col]) for r in rows], .27, label=name)
plt.axhline(100, color="k", ls="--", lw=.8, label="100 MPa working stress")
plt.yscale("log"); plt.xticks(list(x), lab); plt.ylabel("von Mises stress, MPa (forward 100 N)")
plt.title("Buckling-limited designs under the forward load"); plt.legend(fontsize=8); plt.tight_layout()
plt.savefig(os.path.join(H, "stress.png"), dpi=110)
