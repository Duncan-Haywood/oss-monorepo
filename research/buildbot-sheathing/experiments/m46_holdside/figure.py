"""Figure for milestone 46: python experiments/m46_holdside/figure.py (reads results.json and m45's)."""
import json
import os

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
R = json.load(open(os.path.join(HERE, "results.json")))
R45 = json.load(open(os.path.join(HERE, "..", "m45_tiered", "results.json")))
fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(10, 4.2), gridspec_kw={"width_ratios": [1, 1.3]})
A2 = R["A2"]
lab = ["25 N press", "50 N press"]
x = np.arange(2)
w = 0.36
for off, nm, c, t in ((-w / 2, "per-robot", "C1", "held + (milestones 32-45)"),
                      (w / 2, "flipped", "C2", "held - (this milestone)")):
    ys = [e["t"] for e in A2[nm]]
    ax1.bar(x + off, ys, w, color=c, label=t)
    for i, v in enumerate(ys):
        ax1.text(x[i] + off, v, f"{v:.3f}", ha="center", va="bottom", fontsize=8)
ax1.set_yscale("log")
ax1.set_ylim(0.01, 20)
ax1.axhline(0.0326, color="0.3", ls="--", lw=1)
ax1.text(0.5, 0.04, "shift from a 0.2 N sensor error", ha="center", fontsize=7, color="0.3")
ax1.set_xticks(x, lab)
ax1.set_ylabel("common leg margin the stance allows (N m, log)")
ax1.set_title("H1 (1.4 m, -0.15 m): right hip roll's hold side", fontsize=10)
ax1.legend(fontsize=7, loc="upper right")
D = sorted(R["D"], key=lambda d: d["H"])
D45 = sorted(R45["D"], key=lambda d: d["H"])
H = [d["H"] for d in D]
k = str([1.4, -0.15])
series = ((-0.27, [d["worst"]["other"]["y"] for d in D], "C0", "other 17 H1 poses"),
          (0, [d["worst"][k]["y"] for d in D45], "C1", "(1.4, -0.15), held + (m45)"),
          (0.27, [d["worst"][k]["y"] for d in D], "C2", "(1.4, -0.15), held - (m46)"))
x = np.arange(len(H))
for off, ys, c, t in series:
    ax2.bar(x + off, ys, 0.27, color=c, label=t)
    for i, v in enumerate(ys):
        ax2.text(x[i] + off, v, f"{v:.3f}", ha="center", va="bottom", fontsize=7)
ax2.axhline(0.03, color="0.4", ls="--", lw=1)
ax2.set_xticks(x, [f"hose drag {h:g} N" for h in H])
ax2.set_ylabel("worst residual along the wall (mm)")
ax2.set_title("'braked', |e| 0.2 N, squeeze up to 10 N", fontsize=10)
ax2.text(-0.4, 0.034, "spec at 0-5 N drag, 0.03 mm", fontsize=7, color="0.4")
ax2.set_ylim(0, 0.21)
ax2.legend(fontsize=7, loc="upper center", ncol=3)
fig.tight_layout()
fig.savefig(os.path.join(HERE, "figure.png"), dpi=110)
print("wrote figure.png")
