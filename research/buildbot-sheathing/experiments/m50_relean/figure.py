"""Figure for milestone 50: python experiments/m50_relean/figure.py (reads results.json)."""
import json
import os

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
D = json.load(open(os.path.join(HERE, "results.json")))
fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(11, 4.4))
for j, b in enumerate(x for x in D["B"] if x["pose"][1] == 0.0):   # dy +-0.15 lie within 1.7 N of these
    xs = [1e3 * g["dx"] for g in b["grid"] if g["w2"] is not None and g["w2"] > -1e9]
    ys = [g["w2"] for g in b["grid"] if g["w2"] is not None and g["w2"] > -1e9]
    ax1.plot(xs, ys, marker=".", lw=1.2, color=f"C{j}", label=f"{b['robot'].upper()} grip {b['pose'][0]:g} m")
ax1.axhline(0, color="0.25", ls="--", lw=1)
ax1.set_xlabel("forward lean com_dx (mm)")
ax1.set_ylabel("worst friction-cone slack over 17 hose loads, 25 and 50 N (N)")
ax1.set_title("No lean balances the firing window under 20 N of drag", fontsize=10)
ax1.text(2, -4, "above the dashed line: balances under every load", fontsize=7, color="0.25")
ax1.legend(fontsize=7, loc="lower center")
deg = list(range(0, 360, 45))
keys = [("g1", [1.0, 0.0]), ("g1", [1.2, 0.0]), ("h1", [1.6, 0.0])]
A = {(a["robot"], tuple(a["pose"])): a for a in D["A"]}
B = {(b["robot"], tuple(b["pose"])): b for b in D["B"]}
w = 0.13
for j, (n, p) in enumerate(keys):
    cur = A[(n, tuple(p))]["H"]
    best = B[(n, tuple(p))]["refined"]["H"]
    xs = [k + (j - 1) * 2.2 * w for k in range(len(deg))]
    ax2.bar([x - w / 2 for x in xs], cur, w, color=f"C{j}", alpha=0.45)
    ax2.bar([x + w / 2 for x in xs], best, w, color=f"C{j}",
            label=f"{n.upper()} grip {p[0]:g} m (light: current lean, dark: best lean)")
ax2.axhline(20, color="0.25", ls="--", lw=1)
ax2.set_xticks(range(len(deg)), [f"{d}°" for d in deg])
ax2.set_xlabel("direction the hose pulls (0° towards the wall, 180° straight back)")
ax2.set_ylabel("largest hose tension with 25 and 50 N balanced (N, cap 60)")
ax2.set_title("Drag each pose tolerates (dashed: 20 N swept)", fontsize=10)
ax2.legend(fontsize=6, loc="upper center")
ax2.set_ylim(0, 75)
fig.tight_layout()
fig.savefig(os.path.join(HERE, "figure.png"), dpi=110)
print("wrote figure.png")
