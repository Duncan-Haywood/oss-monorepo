"""Step 3d figure: wrong among accepted 2 s windows at -10 dB per held-out noise type (T2, leave one type
out), step 3b's Mondrian gate against the noise-class gate (both gamma 0.25) and select; labels give the
share kept.

    python experiments/gate/noiseclass_figure.py   # reads noiseclass_summary.json, writes noiseclass_gates.png
"""
import json
import os

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
S = json.load(open(os.path.join(HERE, "noiseclass_summary.json")))
TYPES = ["white", "AirConditioner", "AirportAnnouncements", "Babble", "CopyMachine", "Munching", "Neighbor",
         "ShuttingDoor", "Typing", "VacuumCleaner"]
BARS = [("mondrian|0.25", "Mondrian on blind SNR (step 3b), gamma 0.25", "#4c72b0"),
        ("class|0.25", "noise-class bins + novelty refusal, gamma 0.25", "#55a868"),
        ("select", "noise-class bins, weighting chosen per bin", "#dd8452")]

fig, axes = plt.subplots(2, 1, figsize=(10.5, 6.8), sharex=True)
x = np.arange(len(TYPES))
w = 0.27
top = 30
for ax, rt in zip(axes, ("0.2", "0.8")):
    for i, (k, label, col) in enumerate(BARS):
        vals, kept = [], []
        for t in TYPES:
            e = S["T2"][f"{rt}|{t}|-10.0"][k]
            kept.append(e[0])
            vals.append(100 * (e[1] if e[2] else 0.0))
        b = ax.bar(x + (i - 1) * w, np.minimum(vals, top), w, label=label, color=col)
        for r, kk, v in zip(b, kept, vals):
            ax.text(r.get_x() + r.get_width() / 2, min(v, top) + 0.4,
                    f"{kk:.0%}" + ("" if v <= top else f"\n({v:.0f}%)"), ha="center", fontsize=6)
    ax.set_ylim(0, top + 6)
    ax.axhline(1, color="k", lw=0.8, ls="--")
    ax.axhline(2, color="k", lw=0.8, ls=":")
    ax.set_ylabel("wrong among accepted (%)")
    ax.set_title(f"RT60 {float(rt):.1f} s room, 2 s windows, -10 dB, calibrated on the other 9 types "
                 "(labels: share kept)", fontsize=9)
h, lab = axes[0].get_legend_handles_labels()
fig.legend(h, lab, fontsize=8, loc="lower center", ncol=3, frameon=False)
axes[1].set_xticks(x, [t.replace("Airport", "Airport\n") for t in TYPES], fontsize=7.5)
fig.tight_layout(rect=[0, 0.05, 1, 1])
fig.savefig(os.path.join(HERE, "noiseclass_gates.png"), dpi=130)
print("wrote noiseclass_gates.png")
