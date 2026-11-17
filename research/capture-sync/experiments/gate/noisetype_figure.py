"""Step 3c figure: wrong among accepted 2 s windows (gamma 0.25) at -10 dB, per real noise type, for the
Mondrian gate calibrated on white noise (T1) and on the other nine types (T2, leave one type out).

    python experiments/gate/noisetype_figure.py   # reads noisetype_summary.json, writes noisetype_gates.png
"""
import json
import os

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
S = json.load(open(os.path.join(HERE, "noisetype_summary.json")))
TYPES = ["AirConditioner", "AirportAnnouncements", "Babble", "CopyMachine", "Munching", "Neighbor",
         "ShuttingDoor", "Typing", "VacuumCleaner"]
BARS = [("T1", "mondrian", "Mondrian, calibrated on white noise", "#4c72b0"),
        ("T2", "mondrian", "Mondrian, calibrated on the other 9 noise types", "#55a868"),
        ("T1", "agree", "agree gate (PHAT and gamma 0.25 within a frame), calibrated on white noise", "#dd8452")]

fig, axes = plt.subplots(2, 1, figsize=(10, 6.8), sharex=True)
x = np.arange(len(TYPES))
w = 0.27
for ax, rt in zip(axes, ("0.2", "0.8")):
    for i, (sh, g, label, col) in enumerate(BARS):
        vals, kept = [], []
        for t in TYPES:
            e = S[sh][f"{rt}|2.0|0.25|{t}|-10.0"][g]
            kept.append(e[0])
            vals.append(100 * (e[1] if e[2] else 0.0))
        top = 30
        b = ax.bar(x + (i - 1) * w, np.minimum(vals, top), w, label=label, color=col)
        for r, k, v in zip(b, kept, vals):
            ax.text(r.get_x() + r.get_width() / 2, min(v, top) + 0.4,
                    f"{k:.0%}" + ("" if v <= top else f"\n({v:.0f}%)"), ha="center", fontsize=6)
        ax.set_ylim(0, top + 6)
    ax.axhline(1, color="k", lw=0.8, ls="--")
    ax.axhline(2, color="k", lw=0.8, ls=":")
    ax.set_ylabel("wrong among accepted (%)")
    ax.set_title(f"RT60 {float(rt):.1f} s room, 2 s windows, gamma 0.25, -10 dB (labels: share kept)", fontsize=9)
h, lab = axes[0].get_legend_handles_labels()
fig.legend(h, lab, fontsize=8, loc="lower center", ncol=3, frameon=False)
axes[1].set_xticks(x, [t.replace("Airport", "Airport\n") for t in TYPES], fontsize=7.5)
fig.tight_layout(rect=[0, 0.05, 1, 1])
fig.savefig(os.path.join(HERE, "noisetype_gates.png"), dpi=130)
print("wrote noisetype_gates.png")
