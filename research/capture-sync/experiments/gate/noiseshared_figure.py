"""Step 3f figure: raw failure share (more than a 30 fps frame off the clock truth) of 2 s windows at -10 dB,
gamma 0.25, per noise type: independent noise per device (step 3c) against one noise source heard by both
devices at separations of 3, 10 and 30 m.

    python experiments/gate/noiseshared_figure.py   # reads noiseshared_summary.json, writes noiseshared_fail.png
"""
import json
import os

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
S = json.load(open(os.path.join(HERE, "noiseshared_summary.json")))
TYPES = ["white", "AirConditioner", "AirportAnnouncements", "Babble", "CopyMachine", "Munching", "Neighbor",
         "ShuttingDoor", "Typing", "VacuumCleaner"]
BARS = [("ind", 10.0, "independent noise per device (step 3c), talker 10 m geometry", "#999999"),
        ("sh", 3.0, "one shared source, devices 3 m apart", "#55a868"),
        ("sh", 10.0, "one shared source, devices 10 m apart", "#4c72b0"),
        ("sh", 30.0, "one shared source, devices 30 m apart", "#c44e52")]

fig, axes = plt.subplots(2, 1, figsize=(13, 7), sharex=True)
x = np.arange(len(TYPES))
w = 0.2
for ax, rt in zip(axes, ("0.2", "0.8")):
    for i, (kind, D, label, col) in enumerate(BARS):
        vals = [100 * S["raw"][f"{rt}|0.25|{t}|{D}|30|-10.0"][0 if kind == "ind" else 1] for t in TYPES]
        b = ax.bar(x + (i - 1.5) * w, vals, w, label=label, color=col)
        for r, v in zip(b, vals):
            ax.text(r.get_x() + r.get_width() / 2, v + 0.6, f"{v:.0f}", ha="center", fontsize=5.5)
    ax.axhline(2, color="k", lw=0.8, ls=":")
    ax.set_ylabel("windows a frame or more off (%)")
    ax.set_title(f"RT60 {float(rt):.1f} s room, 2 s windows, -10 dB, gamma 0.25, scored against the clock",
                 fontsize=9)
h, lab = axes[0].get_legend_handles_labels()
fig.legend(h, lab, fontsize=8, loc="lower center", ncol=2, frameon=False)
axes[1].set_xticks(x, [t.replace("Airport", "Airport\n") for t in TYPES], fontsize=7.5)
fig.tight_layout(rect=[0, 0.06, 1, 1])
fig.savefig(os.path.join(HERE, "noiseshared_fail.png"), dpi=130)
print("wrote noiseshared_fail.png")
