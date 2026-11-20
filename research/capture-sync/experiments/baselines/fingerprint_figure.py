"""Step 4a figure: top, share of 2 s windows more than a 30 fps frame off at -10 dB (noise independent per
device) for GCC (plain gamma 0.25 and envelope-normalised `fn`) and five literature baselines, per noise type;
bottom, share of the -10 dB test windows each method's T4 gate keeps (label: % wrong among accepted).

    python experiments/baselines/fingerprint_figure.py   # reads fingerprint_summary.json, writes fingerprint_fail.png
"""
import json
import os

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
S = json.load(open(os.path.join(HERE, "fingerprint_summary.json")))
TYPES = ["white", "AirConditioner", "AirportAnnouncements", "Babble", "CopyMachine", "Munching", "Neighbor",
         "ShuttingDoor", "Typing", "VacuumCleaner"]
METHODS = [("plain", "GCC gamma 0.25", "#999999"), ("fn", "GCC, envelope-normalised", "#55a868"),
           ("kflat", "flatness xcorr (Kammerl-style)", "#4c72b0"), ("kenergy", "energy xcorr", "#8172b2"),
           ("kzcr", "ZCR xcorr", "#ccb974"), ("wang", "landmarks (Wang)", "#c44e52"),
           ("hk", "Haitsma-Kalker bits", "#dd8452")]

fig, axes = plt.subplots(2, 2, figsize=(15, 7.5), sharex=True)
x = np.arange(len(TYPES))
w = 0.12
for col, rt in enumerate(("0.2", "0.8")):
    ax = axes[0, col]
    for i, (k, lab, c) in enumerate(METHODS):
        v = [100 * S["fail"][f"{rt}|{t}|-10.0"][i] for t in TYPES]
        ax.bar(x + (i - 3) * w, v, w, color=c, label=lab)
    ax.set_ylabel("windows more than a frame off (%)")
    ax.set_title(f"RT60 {float(rt):.1f} s room, -10 dB, noise independent at each device", fontsize=9)
    if col == 0:
        ax.legend(fontsize=7, frameon=False, ncol=2)
    ax = axes[1, col]
    for i, (k, lab, c) in enumerate(METHODS):
        cells = [S["gate"][f"{rt}|{k}|{t}"] for t in TYPES]
        b = ax.bar(x + (i - 3) * w, [100 * cc[0] for cc in cells], w, color=c)
        for r, cc in zip(b, cells):
            if cc[2]:
                ax.text(r.get_x() + r.get_width() / 2, 100 * cc[0] + 1, f"{100 * cc[1]:.0f}", ha="center",
                        fontsize=4.5, rotation=90, color="#c44e52" if cc[1] > 0.02 else "k")
    ax.set_ylim(0, 115)
    ax.set_ylabel("-10 dB windows kept by the 1% gate (%)")
    ax.set_title("T4 gate on each method's own confidence; label = % wrong among accepted (red: over 2%)",
                 fontsize=9)
    ax.set_xticks(x, [t.replace("Airport", "Airport\n").replace("Conditioner", "\nConditioner")
                      .replace("Cleaner", "\nCleaner") for t in TYPES], fontsize=6.5, rotation=45)
fig.tight_layout()
fig.savefig(os.path.join(HERE, "fingerprint_fail.png"), dpi=130)
print("wrote fingerprint_fail.png")
