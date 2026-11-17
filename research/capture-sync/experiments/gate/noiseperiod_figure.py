"""Step 3g figure: wrong among accepted (bars) and share kept (labels) for the T3 gate (calibrated on
independent noise, tested on one shared source, devices 3 m apart, -10 dB, gamma 0.25), per noise type, with
three confidences: PSR (step 3f), margin = 1 - second-peak ratio, and their product.

    python experiments/gate/noiseperiod_figure.py   # reads noiseperiod_summary.json, writes noiseperiod_gate.png
"""
import json
import os

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
S = json.load(open(os.path.join(HERE, "noiseperiod_summary.json")))
TYPES = ["white", "AirConditioner", "AirportAnnouncements", "Babble", "CopyMachine", "Munching", "Neighbor",
         "ShuttingDoor", "Typing", "VacuumCleaner"]
SC = [("psr", "PSR (step 3f)", "#999999"), ("margin", "margin = 1 - second-peak ratio", "#4c72b0"),
      ("prod", "PSR x margin", "#55a868")]

fig, axes = plt.subplots(2, 1, figsize=(13, 7), sharex=True)
x = np.arange(len(TYPES))
w = 0.27
for ax, rt in zip(axes, ("0.2", "0.8")):
    for i, (sk, label, col) in enumerate(SC):
        cells = [S["gate"][f"T3|{sk}|{rt}|{t}|3.0|0.25"]["sh-10"] for t in TYPES]
        vals = [100 * (c[1] if c[2] else 0.0) for c in cells]
        b = ax.bar(x + (i - 1) * w, vals, w, label=label, color=col)
        for r, v, c in zip(b, vals, cells):
            ax.text(r.get_x() + r.get_width() / 2, v + 0.4, f"{100 * c[0]:.0f}", ha="center", fontsize=5.5)
    ax.axhline(2, color="k", lw=0.8, ls=":")
    ax.set_ylabel("wrong among accepted (%)")
    ax.set_title(f"RT60 {float(rt):.1f} s room: gate calibrated on independent noise, tested on one shared source, "
                 "devices 3 m apart, -10 dB (labels: % of windows kept)", fontsize=9)
h, lab = axes[0].get_legend_handles_labels()
fig.legend(h, lab, fontsize=8, loc="lower center", ncol=3, frameon=False)
axes[1].set_xticks(x, [t.replace("Airport", "Airport\n") for t in TYPES], fontsize=7.5)
fig.tight_layout(rect=[0, 0.05, 1, 1])
fig.savefig(os.path.join(HERE, "noiseperiod_gate.png"), dpi=130)
print("wrote noiseperiod_gate.png")
