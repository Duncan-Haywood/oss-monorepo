"""Step 3h figure: top, raw failure at -10 dB with and without envelope normalisation; bottom, share kept
(bars) and wrong among accepted (labels) for the T3 gate (calibrated on no noise
plus the same type at all levels, tested on that type at -10 dB, noise independent per device, gamma 0.25),
per noise type, for PSR (step 3c), the sub-window consistency gates and the envelope-normalised estimator.

    python experiments/gate/noiseimpulse_figure.py   # reads noiseimpulse_summary.json, writes noiseimpulse_gate.png
"""
import json
import os

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
S = json.load(open(os.path.join(HERE, "noiseimpulse_summary.json")))
TYPES = ["white", "AirConditioner", "AirportAnnouncements", "Babble", "CopyMachine", "Munching", "Neighbor",
         "ShuttingDoor", "Typing", "VacuumCleaner"]
SC = [("psr", "PSR gate (step 3c)", "#999999"), ("sub2", "both 1 s halves find the lag", "#4c72b0"),
      ("fn", "envelope-normalised GCC, own PSR", "#55a868")]

fig, axes = plt.subplots(2, 2, figsize=(14, 7), sharex=True)
x = np.arange(len(TYPES))
for col, rt in enumerate(("0.2", "0.8")):
    ax = axes[0, col]
    raw = [S["fail"][f"{rt}|{t}|-10.0"] for t in TYPES]
    ax.bar(x - 0.2, [100 * r[0] for r in raw], 0.4, color="#999999", label="GCC, gamma 0.25 (step 3c)")
    ax.bar(x + 0.2, [100 * r[1] for r in raw], 0.4, color="#55a868", label="envelope-normalised, gamma 0.25")
    ax.set_ylabel("windows more than a frame off (%)")
    ax.set_title(f"RT60 {float(rt):.1f} s room, -10 dB, noise independent at each device: raw failure", fontsize=9)
    if col == 0:
        ax.legend(fontsize=8, frameon=False)
    ax = axes[1, col]
    w = 0.27
    for i, (sk, label, colr) in enumerate(SC):
        cells = [S["gate"][f"T3|{sk}|{rt}|{t}"] for t in TYPES]
        b = ax.bar(x + (i - 1) * w, [100 * c[0] for c in cells], w, color=colr, label=label)
        for r, c in zip(b, cells):
            lab = "-" if c[2] == 0 else f"{100 * c[1]:.1f}"
            ax.text(r.get_x() + r.get_width() / 2, 100 * c[0] + 1, lab, ha="center", fontsize=5, rotation=90,
                    color="#c44e52" if c[2] and c[1] > 0.02 else "k")
    ax.set_ylim(0, 115)
    ax.set_ylabel("windows kept by the 1% gate (%)")
    ax.set_title("gate calibrated on the same type; label = % wrong among accepted (red: over 2%)", fontsize=9)
    if col == 0:
        ax.legend(fontsize=8, frameon=False, loc="upper center", ncol=3)
    ax.set_xticks(x, [t.replace("Airport", "Airport\n").replace("Conditioner", "\nConditioner")
                      .replace("Cleaner", "\nCleaner") for t in TYPES], fontsize=6.5, rotation=45)
fig.tight_layout()
fig.savefig(os.path.join(HERE, "noiseimpulse_gate.png"), dpi=130)
print("wrote noiseimpulse_gate.png")
