"""Figure for milestone 32: python experiments/m32_grf_qp/figure.py (reads results.json)."""
import json
import os

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
R = json.load(open(os.path.join(HERE, "results.json")))

fig, axes = plt.subplots(1, 3, figsize=(14, 4.4))
for ax, n in zip(axes[:2], ("g1", "h1")):
    rows = [x for x in R["A"] if x["robot"] == n and x["dy"] == 0.0]
    rows.sort(key=lambda x: x["z"])
    z = [x["z"] for x in rows]
    ax.plot(z, [x["nolean"][1] for x in rows], "o-", color="C3", label="upright pose (milestones 30-31): most press")
    ax.fill_between(z, [x["window"][0] for x in rows], [x["window"][1] for x in rows], color="C0", alpha=0.25,
                    label="leaned into the wall: press window")
    ax.axhspan(25, 50, color="0.5", alpha=0.15, label="press at firing, 25-50 N")
    ax.set(xlabel="hand height on the wall (m)", ylabel="press the soles balance (N)", ylim=(0, None),
           title=f"{n.upper()}: friction cones at the sole points, mu 0.5")
    ax.legend(fontsize=7, loc="upper right")

ax = axes[2]
for j, mdl in enumerate(("free", "force", "torque", "hold-min")):
    rs = [x for x in R["C"] if x["robot"] == "g1" and x["model"] == mdl]
    zs = sorted({x["z"] for x in rs})
    ax.plot(zs, [max(abs(x["mu"]["y"][0]) * 1e3 for x in rs if x["z"] == z) for z in zs], "o-", color=f"C{j}",
            label=mdl)
ax.axhline(0.3, color="0.5", ls=":", lw=1)
ax.set(xlabel="hand height on the wall (m)", ylabel="nail offset along the wall after one calibration (mm)",
       title="G1, 12 bits, 5 arcmin: worst of three shifts", ylim=(0, None))
ax.legend(fontsize=7, title="ground-reaction model", title_fontsize=7)
fig.tight_layout()
fig.savefig(os.path.join(HERE, "figure.png"), dpi=110)
