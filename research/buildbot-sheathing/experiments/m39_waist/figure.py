"""Figure for milestone 39: python experiments/m39_waist/figure.py (reads results.json)."""
import json
import os

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
R = json.load(open(os.path.join(HERE, "results.json")))
MM = 1e-3
HS = sorted({x["H"] for x in R["B"]})


def worst(n, c, H, b):
    w = [x for x in R["B"] if x["robot"] == n and x["case"] == c and x["H"] == H and x["b"] == b][0]["worst"]
    return None if w is None else abs(w["y"]) / MM


fig, axes = plt.subplots(1, 3, figsize=(14, 4.4))
for ax, b, title in ((axes[0], 0.2, "FT 300 (|e| 0.2 N), squeeze 10 N, leg preload 0.1 N m"),
                     (axes[1], 2.4, "pre-2017 FT 300 (|e| 2.4 N)")):
    for j, n in enumerate(("g1", "h1")):
        cs = R["cases"][n]
        for H, ls in zip(HS, ("-", "--", ":")):
            ax.plot([R["cases"]["g1"].index(c) for c in cs], [worst(n, c, H, b) for c in cs], ls, marker="o", ms=3, color=f"C{j}",
                    label=f"{n.upper()}, drag {H:g} N")
    ax.set_xticks(range(len(R["cases"]["g1"])), R["cases"]["g1"])
    ax.set_xlabel("waist case (H1 has no 'yaw only': its one torso joint is a yaw)")
    ax.set_ylabel("worst residual along the wall (mm)")
    ax.set_title(title, fontsize=10)
    ax.legend(fontsize=7)

ax = axes[2]
for j, n in enumerate(("g1", "h1")):
    for hm, ls in ((10.0, "-"), (20.0, "--")):
        rows = [r for r in R["D"] if r["robot"] == n and r["H_max"] == hm]
        cs = [r["case"] for r in rows]
        ax.plot([R["cases"]["g1"].index(c) for c in cs], [100 * r["worst_loss"] for r in rows], ls, marker="o",
                ms=3, color=f"C{j}", label=f"{n.upper()}, drag 0-{hm:g} N")
ax.set_xticks(range(len(R["cases"]["g1"])), R["cases"]["g1"])
ax.set_ylabel("worst-pose stack loss (points)")
ax.set_title("clean-sheet loss over a drag range, FT 300", fontsize=10)
ax.legend(fontsize=7)
fig.tight_layout()
fig.savefig(os.path.join(HERE, "figure.png"), dpi=110)
print("wrote figure.png")
