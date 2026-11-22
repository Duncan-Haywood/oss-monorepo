"""Step 6a figure: coarse-step failure share (> one 30 fps frame off, mean over the ten noise types at -10 dB) by
clock-rate offset, for 4d's 20 s GCC, the rate-0 sub-window sum and the joint lag-and-rate search; left the 200 ms
room, right the 800 ms room.

    python experiments/tracker/ratelag_figure.py   # reads ratelag_summary.json, writes ratelag_coarse.png
"""
import json
import os

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
S = json.load(open(os.path.join(HERE, "ratelag_summary.json")))
SROS = [17.0, 100.0, 300.0]
METHODS = [("fnc", "20 s env-norm GCC (step 4d)", "#bbbbbb"),
           ("inc1", "1 s sub-windows summed, rate 0", "#dd8452"),
           ("rl1", "1 s sub-windows summed along the best rate", "#4c72b0")]

fig, axes = plt.subplots(1, 2, figsize=(10, 4.0), sharey=True)
x = np.arange(len(SROS))
for ax, rt in zip(axes, ("0.2", "0.8")):
    for k, (m, lab, c) in enumerate(METHODS):
        y = [S[f"{rt}|{e}|{m}"] for e in SROS]
        ax.bar(x + (k - 1) * 0.26, y, 0.26, color=c, label=lab)
    ax.set_xticks(x, [f"{e:g} ppm" for e in SROS])
    ax.set_title(f"RT60 {float(rt):.1f} s room, ten noise types at -10 dB", fontsize=9)
    ax.grid(alpha=0.3, axis="y")
axes[0].set_ylabel("coarse step more than one frame off (% of sessions)")
axes[0].legend(fontsize=8, frameon=False)
fig.tight_layout()
fig.savefig(os.path.join(HERE, "ratelag_coarse.png"), dpi=130)
print("wrote ratelag_coarse.png")
