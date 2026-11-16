"""Step 3e figure: wrong among accepted 2 s windows at -10 dB per noise type under site calibration (T3:
calibrate on the same type, other speech), Mondrian gates binned on the window's own blind SNR, on the
frame-energy spread over 6 s, on the minimum-statistics context estimate, and on the true level (oracle);
all gamma 0.25; labels give the share kept.

    python experiments/gate/noiselevel_figure.py   # reads noiselevel_summary.json, writes noiselevel_gates.png
"""
import json
import os

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
S = json.load(open(os.path.join(HERE, "noiselevel_summary.json")))
TYPES = ["white", "AirConditioner", "AirportAnnouncements", "Babble", "CopyMachine", "Munching", "Neighbor",
         "ShuttingDoor", "Typing", "VacuumCleaner"]
BARS = [("snr_hat|0.25", "bins of the window's own blind SNR (step 3b)", "#4c72b0"),
        ("ctx|0.25", "frame-energy spread over the 6 s", "#8172b3"),
        ("ms|0.25", "minimum-statistics floor over the 4 s before", "#55a868"),
        ("oracle|0.25", "true level (oracle, not deployable)", "#999999")]

fig, axes = plt.subplots(2, 1, figsize=(13, 7), sharex=True)
x = np.arange(len(TYPES))
w = 0.2
top = 30
for ax, rt in zip(axes, ("0.2", "0.8")):
    for i, (k, label, col) in enumerate(BARS):
        vals, kept = [], []
        for t in TYPES:
            e = S["T3"][f"{rt}|{t}|-10.0"][k]
            kept.append(e[0])
            vals.append(100 * (e[1] if e[2] else 0.0))
        b = ax.bar(x + (i - 1.5) * w, np.minimum(vals, top), w, label=label, color=col)
        for r, kk, v in zip(b, kept, vals):
            ax.text(r.get_x() + r.get_width() / 2, min(v, top) + 0.4,
                    f"{kk:.0%}" + ("" if v <= top else f"\n({v:.0f}%)"), ha="center", fontsize=5.5)
    ax.set_ylim(0, top + 6)
    ax.axhline(1, color="k", lw=0.8, ls="--")
    ax.axhline(2, color="k", lw=0.8, ls=":")
    ax.set_ylabel("wrong among accepted (%)")
    ax.set_title(f"RT60 {float(rt):.1f} s room, 2 s windows, -10 dB, site calibration on the same type "
                 "(labels: share kept)", fontsize=9)
h, lab = axes[0].get_legend_handles_labels()
fig.legend(h, lab, fontsize=8, loc="lower center", ncol=2, frameon=False)
axes[1].set_xticks(x, [t.replace("Airport", "Airport\n") for t in TYPES], fontsize=7.5)
fig.tight_layout(rect=[0, 0.05, 1, 1])
fig.savefig(os.path.join(HERE, "noiselevel_gates.png"), dpi=130)
print("wrote noiselevel_gates.png")
