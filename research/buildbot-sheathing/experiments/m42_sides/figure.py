"""Figure for milestone 42: python experiments/m42_sides/figure.py (reads results.json)."""
import json
import os

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
R = json.load(open(os.path.join(HERE, "results.json")))
S = {(r["lean"], r["sides"], r["robot"], tuple(r["pose"])): r["stack"] for r in R["cells"]}
CELLS = [("m32", "m38", "milestone 32 lean, milestone 38 sides"), ("m32", "m41", "milestone 32 lean, milestone 41 sides"),
         ("zero", "m38", "zero-press lean, milestone 38 sides"), ("zero", "m41", "zero-press lean, milestone 41 sides")]
POSES = {"g1": [(1.0, -0.15), (1.0, 0.0), (1.0, 0.15), (1.2, -0.15), (1.2, 0.0), (1.2, 0.15)],
         "h1": [(1.4, -0.15), (1.4, 0.0), (1.4, 0.15), (1.6, -0.15), (1.6, 0.0), (1.6, 0.15)]}
fig, axes = plt.subplots(1, 2, figsize=(12, 5.0), sharey=True)
w = 0.2
for ax, n in zip(axes, ("g1", "h1")):
    x = np.arange(len(POSES[n]))
    for i, (l, s, lab) in enumerate(CELLS):
        v = [S.get((l, s, n, p)) for p in POSES[n]]
        ax.bar(x + (i - 1.5) * w, [100 * (y if y is not None else np.nan) for y in v], w, label=lab,
               color=["C0", "C9", "C1", "C3"][i], hatch="//" if s == "m41" else None, edgecolor="white", lw=0)
        for j, y in enumerate(v):
            if y is None:
                ax.text(x[j] + (i - 1.5) * w, 89.3, "x", ha="center", fontsize=8, color=["C0", "C9", "C1", "C3"][i])
    ax.set_xticks(x, [f"z {p[0]:.1f}\ndy {p[1]:+.2f}" for p in POSES[n]], fontsize=8)
    ax.set_ylim(89, 99)
    ax.set_title(f"{n.upper()}: re-leaned poses, no-hose clean-sheet stack ('braked')", fontsize=10)
axes[0].set_ylabel("clean sheets (%)")
h, lb = axes[0].get_legend_handles_labels()
fig.legend(h, lb, fontsize=7, loc="lower center", ncol=4, bbox_to_anchor=(0.5, 0.04))
fig.text(0.5, 0.01, "x: no 'hold-min' solution with those sides. The sides (hatched vs plain) never move a bar; "
         "the lean (blue vs orange) does.", ha="center", fontsize=8)
fig.tight_layout(rect=(0, 0.1, 1, 1))
fig.savefig(os.path.join(HERE, "figure.png"), dpi=110)
print("wrote figure.png")
