"""Step 3l figure: raw failure (30 fps, clock truth, -10 dB total) against the shared fraction of the noise,
plain gamma 0.25 (dashed) and envelope-normalised fn (solid), one line per noise type, one panel per room;
step 3l-b, the screened run (shared stretches that copied an independent one redrawn).

    python experiments/gate/noisemix_figure.py   # reads noisemix_screened_summary.json, writes noisemix_fail.png
"""
import json
import os

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
S = json.load(open(os.path.join(HERE, "noisemix_screened_summary.json")))
TYPES = ["white", "AirConditioner", "AirportAnnouncements", "Babble", "CopyMachine", "Munching", "Neighbor",
         "ShuttingDoor", "Typing", "VacuumCleaner"]
RHOS = [0.0, 0.25, 0.5, 0.75, 0.9, 1.0]
cmap = plt.get_cmap("tab10")
fig, axes = plt.subplots(1, 2, figsize=(12, 4.8), sharey=True)
for ax, rt in zip(axes, ("0.2", "0.8")):
    for k, t in enumerate(TYPES):
        for i, ls in ((0, "--"), (1, "-")):
            v = [100 * S["fail"][f"{rt}|{t}|{r}"][i] for r in RHOS]
            ax.plot(RHOS, v, ls, color=cmap(k), lw=1.4, marker="o", ms=3, label=t if i == 1 else None)
    ax.set_xlabel("shared fraction of the noise power (rho); 3 m apart, -10 dB total")
    ax.set_title(f"RT60 {float(rt):.1f} s room: solid fn, dashed plain gamma 0.25", fontsize=9)
    ax.grid(alpha=0.3)
axes[0].set_ylabel("windows more than a 30 fps frame off (%)")
axes[1].legend(fontsize=7, frameon=False, loc="upper right")
fig.tight_layout()
fig.savefig(os.path.join(HERE, "noisemix_fail.png"), dpi=130)
print("noisemix_fail.png")
