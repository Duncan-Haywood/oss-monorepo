"""Step 4c figure: summed failure share over the ten noise types at -10 dB for each method, placed directly from
the anchor's own pair, by the maximum-confidence spanning tree, and by closure-trimmed least squares over all six
pairs of four devices; left the 200 ms room, right the 800 ms room.

    python experiments/baselines/consistency_figure.py   # reads consistency_summary.json, writes consistency_sum10.png
"""
import json
import os

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
S = json.load(open(os.path.join(HERE, "consistency_summary.json")))["sum10"]
METHODS = [("plain", "GCC g 0.25"), ("fn", "GCC env-norm"), ("kflat", "flatness"), ("kenergy", "energy"),
           ("kzcr", "ZCR"), ("wang", "landmarks"), ("hk", "Haitsma-Kalker")]
PLACE = [("direct", "direct (anchor's pair)", "#bbbbbb"), ("mst", "spanning tree", "#4c72b0"),
         ("trim", "trimmed least squares", "#55a868")]

fig, axes = plt.subplots(1, 2, figsize=(11, 4.2), sharey=True)
x = np.arange(len(METHODS))
for ax, rt in zip(axes, ("0.2", "0.8")):
    for k, (p, lab, c) in enumerate(PLACE):
        y = [S[f"{rt}|{m}|{p}|-10.0"] for m, _ in METHODS]
        ax.bar(x + (k - 1) * 0.27, y, 0.27, color=c, label=lab)
    ax.set_xticks(x, [lab for _, lab in METHODS], fontsize=8, rotation=20)
    ax.set_title(f"RT60 {float(rt):.1f} s room, 4 devices, ten noise types at -10 dB", fontsize=9)
    ax.grid(alpha=0.3, axis="y")
axes[0].set_ylabel("sum of ten failure shares (10 = every device off)")
axes[0].legend(fontsize=8, frameon=False)
fig.tight_layout()
fig.savefig(os.path.join(HERE, "consistency_sum10.png"), dpi=130)
print("wrote consistency_sum10.png")
