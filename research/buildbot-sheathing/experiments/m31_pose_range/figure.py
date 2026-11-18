"""Figure for milestone 31: python experiments/m31_pose_range/figure.py (reads results.json)."""
import json
import os

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
R = json.load(open(os.path.join(HERE, "results.json")))

fig, axes = plt.subplots(1, 2, figsize=(11, 4.4), sharey=True)
for ax, n in zip(axes, ("g1", "h1")):
    for j, dy in enumerate((-0.15, 0.0, 0.15)):
        rows = sorted([x for x in R["CD"] if x["robot"] == n and x["dy"] == dy], key=lambda x: x["z"])
        z = [x["z"] for x in rows]
        ax.plot(z, [x["v0"] for x in rows], ":", color=f"C{j}", lw=1)
        ax.plot(z, [x["per_pose"] for x in rows], "o-", color=f"C{j}", label=f"shift {dy:+.2f} m, calibrated per pose")
        ax.plot(z, [x["one_cal"] for x in rows], "s--", color=f"C{j}", alpha=0.7,
                label=f"shift {dy:+.2f} m, one calibration")
    ax.axvline(R["ref"][0], color="0.6", lw=0.8)
    ax.axhline(0.90, color="0.5", ls=":", lw=1)
    ax.set(xlabel="hand height on the wall (m)", ylim=(0, 1.02),
           title=f"{n.upper()}, 12-bit joints, 5 arcmin backlash, 25-50 N press")
axes[0].set_ylabel("clean sheets, best single-2x stack")
axes[1].legend(fontsize=7, loc="lower left")
fig.text(0.5, 0.005, "dotted: no backlash; grey line: the calibration pose (1.0 m, no shift)", ha="center", fontsize=8)
fig.tight_layout(rect=(0, 0.03, 1, 1))
fig.savefig(os.path.join(HERE, "figure.png"), dpi=110)
