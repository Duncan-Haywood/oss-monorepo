"""Figure for milestone 53: python experiments/m53_loadside/figure.py (reads results.json and m51/m52's)."""
import json
import os

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
D = json.load(open(os.path.join(HERE, "results.json")))
R52 = json.load(open(os.path.join(HERE, "..", "m52_slackcal", "results.json")))
R51 = json.load(open(os.path.join(HERE, "..", "m51_envelope", "results.json")))
fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(11, 4.4))
rows = D["rows"]
for j, x in enumerate(rows):
    ts = [a["t"] for a in x["A"]]
    t0 = 0.0 if any(a["stage"] == "hold" for a in x["A"]) else min(ts)
    col = "C1" if x["robot"] == "h1" else "C0"
    ax1.plot([j, j], [max(t0, 1e-3), x["best"]["margin"] if x["best"] else 1e-3], color="0.8", lw=1, zorder=1)
    ax1.scatter(j, max(t0, 1e-3), marker="x" if t0 == 0 else "o", color="0.4", s=18, zorder=2)
    if x["best"]:
        ax1.scatter(j, x["best"]["margin"], color=col, s=18, zorder=3)
    else:
        ax1.scatter(j, 1e-3, marker="v", color="C3", s=30, zorder=3)
ax1.axhline(0.1, color="C3", ls="--", lw=1)
ax1.text(0.5, 0.115, "leg preload asked (0.1 N m)", fontsize=7, color="C3")
ax1.set_yscale("log")
ax1.set_ylim(8e-4, 10)
ax1.set_xlabel("dropped pose-case (milestone 52), G1 first, then H1")
ax1.set_ylabel("common leg margin (N m)")
ax1.set_title("Pose's sides (grey; x: no hold solution) vs sides chosen per load", fontsize=10)
ax1.scatter([], [], color="C0", s=18, label="G1, per-load sides")
ax1.scatter([], [], color="C1", s=18, label="H1, per-load sides")
ax1.scatter([], [], color="C3", marker="v", s=30, label="no side combination plans")
ax1.legend(fontsize=7, loc="lower right")
for k, n in enumerate(("g1", "h1")):
    t = R52["totals"][n]
    m51 = 100 * t["in51_pl"] / t["in51"]
    m52 = 100 * t["in51_ps"] / t["in51"]
    m53 = D["C"][n]["coverage"]
    for i, (v, lab, col) in enumerate(((m51, "m51: loaded calibration", "0.7"), (m52, "m52: slack calibration", "C2"),
                                       (m53, "m53: + hold sides per load", "C0"))):
        ax2.bar(k + (i - 1) * 0.26, v, 0.24, color=col, label=lab if k == 0 else None)
        ax2.text(k + (i - 1) * 0.26, v + 0.15, f"{v:.1f}", ha="center", fontsize=7)
ax2.set_ylim(90, 103)
ax2.set_xticks(range(2), ["G1", "H1"])
ax2.set_ylabel("pose-cases inside the drag envelope with a plan (%)")
ax2.set_title("Coverage inside milestone 51's drag envelope", fontsize=10)
ax2.legend(fontsize=7, loc="upper center", ncol=3)
fig.tight_layout()
fig.savefig(os.path.join(HERE, "figure.png"), dpi=110)
print("wrote figure.png")
