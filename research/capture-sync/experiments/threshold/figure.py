"""Figure for step 2a: predicted against observed gross-error share per cell (log-log), for the smooth-weight
GCC the theory describes and for step 1's raw-bin GCC, from summary.json. Cells with fewer than 10
observed failures are left out, as in the H4 score.

    python experiments/threshold/figure.py
"""
import json
import os

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
C = json.load(open(os.path.join(HERE, "summary.json")))["cells"]
GROUPS = [("gauss", "dry", "Gaussian, dry", "#555555"), ("speech", "dry", "speech, dry", "#2b6cb0"),
          ("speech", "rt200", "speech, RT60 0.2 s", "#2f855a"), ("speech", "rt800", "speech, RT60 0.8 s", "#c05621")]
MARK = {1.0: "o", 0.5: "s", 0.25: "^", 0.0: "D"}

fig, axes = plt.subplots(1, 2, figsize=(9.5, 4.2), sharex=True, sharey=True)
for ax, est, title in zip(axes, ["fixed", "raw"], ["smooth-weight GCC (the model's estimator)",
                                                     "raw-bin GCC (step 1's estimator)"]):
    ax.plot([1e-3, 1], [1e-3, 1], color="k", lw=0.8)
    ax.fill_between([1e-3, 1], [5e-4, 0.5], [2e-3, 2], color="0.85", zorder=0)
    for src, room, label, col in GROUPS:
        first = True
        for g, m in MARK.items():
            cs = [c for c in C if c["src"] == src and c["room"] == room and c["gamma"] == g and c["n_" + est] >= 10]
            if cs:
                ax.scatter([c[est] for c in cs], [max(c["pred"], 1e-3) for c in cs], s=18, marker=m,
                           facecolors="none" if g == 1.0 else col, edgecolors=col, linewidths=0.9,
                           label=label if first and est == "fixed" else None)
                first = False
    ax.set_xscale("log")
    ax.set_yscale("log")
    ax.set_xlim(0.03, 1.05)
    ax.set_ylim(1e-3, 1.05)
    ax.set_title(title, fontsize=10)
    ax.set_xlabel("observed share of windows > 1 frame off")
axes[0].set_ylabel("predicted (threshold model, cells)")
axes[0].legend(fontsize=8, loc="lower right")
fig.text(0.5, -0.02, "grey band: within a factor of 2; open circles: gamma 1 (PHAT); squares 0.5, "
         "triangles 0.25, diamonds 0 (plain correlation)", ha="center", fontsize=8)
fig.tight_layout()
fig.savefig(os.path.join(HERE, "pred_vs_obs.png"), dpi=130, bbox_inches="tight")
print("wrote pred_vs_obs.png")
