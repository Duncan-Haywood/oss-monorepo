"""Figure for milestone 43: python experiments/m43_specstack/figure.py (reads results.json)."""
import json
import os

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
R = json.load(open(os.path.join(HERE, "results.json")))
S = {(r["lean"], r["case"], r["robot"], tuple(r["pose"])): r for r in R["rows"]}
POSES = {"g1": [(1.0, -0.15), (1.0, 0.0), (1.0, 0.15), (1.2, -0.15), (1.2, 0.0), (1.2, 0.15)],
         "h1": [(1.4, -0.15), (1.4, 0.0), (1.4, 0.15), (1.6, -0.15), (1.6, 0.0), (1.6, 0.15)]}
BARS = [("m32", "spec", "milestone 32 lean, spec plan (milestone 40)", "C0", None),
        ("zero", "spec", "zero-press lean, spec plan (this milestone)", "C1", None),
        ("m32", "holdmin", "milestone 32 lean, 'hold-min' torques", "C0", "//"),
        ("zero", "holdmin", "zero-press lean, 'hold-min' torques (milestones 41-42)", "C1", "//")]
fig, axes = plt.subplots(1, 2, figsize=(12, 5.0), sharey=True)
w = 0.2
for ax, n in zip(axes, ("g1", "h1")):
    x = np.arange(len(POSES[n]))
    for i, (lean, conv, lab, c, h) in enumerate(BARS):
        v = [S.get((lean, "braked", n, p), {}).get(conv) for p in POSES[n]]
        ax.bar(x + (i - 1.5) * w, [100 * (y if y is not None else np.nan) for y in v], w, label=lab, color=c,
               hatch=h, edgecolor="white", lw=0, alpha=1.0 if h is None else 0.55)
        for j, y in enumerate(v):
            if y is None:
                ax.text(x[j] + (i - 1.5) * w, 89.3, "x", ha="center", fontsize=8, color=c)
    ax.set_xticks(x, [f"z {p[0]:.1f}\ndy {p[1]:+.2f}" for p in POSES[n]], fontsize=8)
    ax.set_ylim(89, 99)
    ax.set_title(f"{n.upper()}: re-leaned poses, no-hose clean-sheet stack ('braked')", fontsize=10)
axes[0].set_ylabel("clean sheets (%)")
h, lb = axes[0].get_legend_handles_labels()
fig.legend(h, lb, fontsize=7, loc="lower center", ncol=2, bbox_to_anchor=(0.5, 0.02))
fig.text(0.5, 0.005, "x: no solution. Spec plan: the G1 at (1.0, +0.15) on the old lean, and the H1 at (1.4, -0.15) and (1.6, 0) on "
         "the zero-press lean, cannot hold the 0.1 N m leg preload at 50 N; the H1 at (1.6, -0.15) re-leaned has no controller.",
         ha="center", fontsize=8)
fig.tight_layout(rect=(0, 0.13, 1, 1))
fig.savefig(os.path.join(HERE, "figure.png"), dpi=110)
print("wrote figure.png")
