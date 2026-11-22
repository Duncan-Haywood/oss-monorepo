"""Step 6b figure: share of the session out of sync (> one 30 fps frame off, mean over the ten noise types at
-10 dB) by clock-rate offset, for four trackers all started from 6a's joint lag-and-rate search, with that coarse
step's own failure share marked; left the 200 ms room, right the 800 ms room.

    python experiments/tracker/gated_figure.py   # reads gated_summary.json, writes gated_oos.png
"""
import json
import os

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
S = json.load(open(os.path.join(HERE, "gated_summary.json")))
SROS = [17.0, 100.0, 300.0]
METHODS = [("track_rl", "step 6a tracker (PSR-median vote)", "#bbbbbb"),
           ("kr", "PSR vote, keeping the coarse rate", "#dd8452"),
           ("gated", "windows gated to one frame of the line", "#4c72b0"),
           ("hold", "coarse line held, never updated", "#55a868")]

fig, axes = plt.subplots(1, 2, figsize=(10, 4.6), sharey=True)
x = np.arange(len(SROS))
w = 0.2
for ax, rt in zip(axes, ("0.2", "0.8")):
    for k, (m, lab, c) in enumerate(METHODS):
        y = [S[f"{rt}|{e}|{m}"] for e in SROS]
        ax.bar(x + (k - 1.5) * w, y, w, color=c, label=lab)
    f = [S[f"{rt}|{e}|rl1_fail"] for e in SROS]
    ax.plot(x, f, "k_", markersize=30, markeredgewidth=1.5, label="coarse step more than a frame off (% of sessions)")
    ax.set_xticks(x, [f"{e:g} ppm" for e in SROS])
    ax.set_title(f"RT60 {float(rt):.1f} s room, ten noise types at -10 dB", fontsize=9)
    ax.grid(alpha=0.3, axis="y")
axes[0].set_ylabel("share of the session out of sync (%)")
h, l = axes[0].get_legend_handles_labels()
fig.legend(h, l, loc="lower center", ncol=3, fontsize=8, frameon=False)
fig.tight_layout(rect=(0, 0.1, 1, 1))
fig.savefig(os.path.join(HERE, "gated_oos.png"), dpi=130)
print("wrote gated_oos.png")
