"""Figure for step 3k: raw `fn` failure at -10 dB per noise type on the real phones and in the two twins (top), and
wrong-among-accepted on real test sessions for T4 gates set on the real phones (step 3j) or wholly in a twin (bottom)."""
import json
import os

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
s = json.load(open(os.path.join(HERE, "twincal_summary.json")))
j = json.load(open(os.path.join(HERE, "noisereal_summary.json")))
TYPES = ["white", "AirConditioner", "AirportAnnouncements", "Babble", "CopyMachine", "Munching", "Neighbor",
         "ShuttingDoor", "Typing", "VacuumCleaner"]
short = ["white", "AirCond", "Airport", "Babble", "Copier", "Munch", "Neighbor", "Door", "Typing", "Vacuum"]
fig, ax = plt.subplots(2, 2, figsize=(12, 7), sharex=True)
x = np.arange(len(TYPES))
cols = ["#333333", "#4477aa", "#ee6677"]
for c, room in enumerate(["200", "800"]):
    f = s["fail"]
    for k, (lab, col) in enumerate(zip(["real phones", "twin, uncalibrated", "twin, calibrated"], cols)):
        ax[0, c].bar(x + (k - 1) * 0.27, [100 * f[f"{room}|{t}"]["fn"][k] for t in TYPES], 0.27, color=col, label=lab)
    fit = s["fit"][room]
    ax[0, c].set_title(f"room {room} ms: raw fn failure at -10 dB (fit: DRR {fit['drr']:+.0f} dB, floor "
                       f"{'none' if fit['floor'] is None else str(int(fit['floor'])) + ' dB'})", fontsize=9)
    ax[0, c].set_ylabel("% windows > 1 frame off")
    g = s["gate"]
    rows = [("set on real phones (3j)", [j["gate"][f"{room}|fn|{t}"] for t in TYPES]),
            ("set in uncalibrated twin", [g[f"{room}|uncal|fn"]["cells"][t] for t in TYPES]),
            ("set in calibrated twin", [g[f"{room}|cal|fn"]["cells"][t] for t in TYPES])]
    for k, ((lab, cells), col) in enumerate(zip(rows, cols)):
        v = [100 * cc[1] if cc[2] else 0.0 for cc in cells]
        ax[1, c].bar(x + (k - 1) * 0.27, v, 0.27, color=col, label=lab)
    ax[1, c].axhline(2.0, color="k", lw=0.8, ls="--")
    ax[1, c].set_ylabel("% wrong among accepted (real test)")
    ax[1, c].set_title(f"room {room} ms: T4 gate on fn, dashed = 2% target", fontsize=9)
    ax[1, c].set_xticks(x, short, rotation=45, fontsize=8)
ax[0, 0].legend(fontsize=8)
ax[1, 0].legend(fontsize=8)
fig.tight_layout()
fig.savefig(os.path.join(HERE, "twincal_gate.png"), dpi=120)
print("wrote twincal_gate.png")
