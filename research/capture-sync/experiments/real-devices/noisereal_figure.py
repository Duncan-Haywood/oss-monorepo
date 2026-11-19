"""Step 3j figure: raw failure at -10 dB per noise type on the real LibriWASN phones (solid bars) beside the
simulated twin of step 3h (hatched bars), for plain gamma 0.25 GCC and the envelope-normalised estimator.

    python experiments/real-devices/noisereal_figure.py   # reads noisereal_summary.json, writes noisereal_twin.png
"""
import json
import os

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
R = json.load(open(os.path.join(HERE, "noisereal_summary.json")))["fail"]
SIM = json.load(open(os.path.join(HERE, "..", "gate", "noiseimpulse_summary.json")))["fail"]
TYPES = ["white", "AirConditioner", "AirportAnnouncements", "Babble", "CopyMachine", "Munching", "Neighbor",
         "ShuttingDoor", "Typing", "VacuumCleaner"]
BARS = [("real", 0, "plain, real phones", "#999999", None), ("sim", 0, "plain, simulated room", "#dddddd", "//"),
        ("real", 1, "fn, real phones", "#55a868", None), ("sim", 1, "fn, simulated room", "#c7e6cf", "//")]

fig, axes = plt.subplots(2, 1, figsize=(12, 7.5), sharex=True)
x = np.arange(len(TYPES))
w = 0.2
for ax, (room, rt) in zip(axes, (("200", "0.2"), ("800", "0.8"))):
    for j, (src, i, label, c, h) in enumerate(BARS):
        v = [100 * (R[f"{room}|{t}|-10.0"] if src == "real" else SIM[f"{rt}|{t}|-10.0"])[i] for t in TYPES]
        ax.bar(x + (j - 1.5) * w, v, w, color=c, hatch=h, edgecolor="#555555", linewidth=0.4, label=label)
    ax.set_ylabel("windows more than a frame off (%)")
    ax.set_title(f"LibriWASN {room} ms room (5 real phones) against a statistical RT60 {rt} s room; 2 s windows, "
                 "-10 dB, noise independent per device", fontsize=9)
    ax.set_ylim(0, 100)
axes[0].legend(fontsize=8, frameon=False, ncol=4)
axes[1].set_xticks(x, [t.replace("Airport", "Airport\n").replace("Conditioner", "\nConditioner")
                       .replace("Cleaner", "\nCleaner") for t in TYPES], fontsize=7)
fig.tight_layout()
fig.savefig(os.path.join(HERE, "noisereal_twin.png"), dpi=130)
print("wrote noisereal_twin.png")
