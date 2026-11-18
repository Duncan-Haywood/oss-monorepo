"""Step 3i figure: raw failure at -10 dB (noise independent per device, gamma 0.25, test sessions) per noise
type for plain GCC, envelope-normalised GCC, the per-window selectors (kurtosis threshold, higher PSR) and the
per-window oracle; labels on the kurtosis bars give the share of windows the kurtosis rule sends to fn.

    python experiments/gate/noiseselect_figure.py   # reads noiseselect_summary.json, writes noiseselect_raw.png
"""
import json
import os

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
S = json.load(open(os.path.join(HERE, "noiseselect_summary.json")))
TYPES = ["white", "AirConditioner", "AirportAnnouncements", "Babble", "CopyMachine", "Munching", "Neighbor",
         "ShuttingDoor", "Typing", "VacuumCleaner"]
SEL = [(0, "plain GCC, gamma 0.25", "#999999"), (1, "envelope-normalised (fn)", "#55a868"),
       (2, "kurtosis picks per window", "#4c72b0"), (3, "higher PSR picks", "#dd8452"),
       (4, "oracle (better of the two)", "#222222")]

fig, axes = plt.subplots(2, 1, figsize=(12, 7.5), sharex=True)
x = np.arange(len(TYPES))
w = 0.16
for ax, rt in zip(axes, ("0.2", "0.8")):
    for j, (i, label, c) in enumerate(SEL):
        v = [100 * S["fail"][f"{rt}|{t}|-10.0"][i] for t in TYPES]
        b = ax.bar(x + (j - 2) * w, v, w, color=c, label=label)
        if i == 2:
            for r, t in zip(b, TYPES):
                ax.text(r.get_x() + r.get_width() / 2, r.get_height() + 1,
                        f"{100 * S['use_fn'][f'{rt}|{t}|-10.0']:.0f}", ha="center", fontsize=5.5, color="#4c72b0")
    ax.set_ylabel("windows more than a frame off (%)")
    ax.set_title(f"RT60 {float(rt):.1f} s room, -10 dB, noise independent per device, test sessions "
                 f"(blue labels: % of windows the kurtosis rule sends to fn; k* = {S['kstar'][rt]:.2f})", fontsize=9)
    ax.set_ylim(0, 90)
axes[0].legend(fontsize=8, frameon=False, ncol=3)
axes[1].set_xticks(x, [t.replace("Airport", "Airport\n").replace("Conditioner", "\nConditioner")
                       .replace("Cleaner", "\nCleaner") for t in TYPES], fontsize=7)
fig.tight_layout()
fig.savefig(os.path.join(HERE, "noiseselect_raw.png"), dpi=130)
print("wrote noiseselect_raw.png")
