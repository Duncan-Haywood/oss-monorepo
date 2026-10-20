"""Factor at the one-layer root width against layer count, per gauge -> layers.png."""
import os
import matplotlib; matplotlib.use("Agg")
import matplotlib.pyplot as plt
H = os.path.dirname(os.path.abspath(__file__))
rows = {}
for l in open(os.path.join(H, "layers.txt")):
    p = l.split()
    if len(p) == 5 and p[0][0].isdigit() and p[2].isdigit():
        rows.setdefault(p[0], []).append((int(p[2]), float(p[3])))
for b, r in rows.items():
    plt.plot([a for a, _ in r], [c for _, c in r], "o-", label=f"b = {b} mm")
plt.axhline(3, color="gray", lw=.8, ls="--")
plt.xticks([1, 2, 3, 4]); plt.xlabel("element layers through the thickness")
plt.ylabel("reversed-load buckling factor"); plt.title("Factor at the one-layer root width, coarse mesh")
plt.legend(); plt.tight_layout(); plt.savefig(os.path.join(H, "layers.png"), dpi=110)
