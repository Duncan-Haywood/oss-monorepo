"""Figure for milestone 41: python experiments/m41_stance0/figure.py (reads results.json)."""
import json
import os

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
R = json.load(open(os.path.join(HERE, "results.json")))

fig, axes = plt.subplots(1, 2, figsize=(12, 4.4), sharey=True)
for ax, n in zip(axes, ("g1", "h1")):
    rows = [x for x in R["A"] if x["robot"] == n and x["dy"] == 0.0]
    zs = [x["z"] for x in rows]
    ax.fill_between(zs, [x["w0"][0] for x in rows], [x["w0"][1] for x in rows], color="C0", alpha=0.25,
                    label="milestone 32's lean (centre of pressure mid-sole at 37.5 N)")
    re = [x for x in rows if x["relean"] and x["w1"]]
    if re:
        ax.plot([x["z"] for x in re], [x["w1"][1] for x in re], "o-", color="C1", ms=4,
                label="re-leaned to stand at 0 N: top of its window")
        for x in re:
            ax.annotate(f"{1e3 * (x['dx0'] - x['dx1']):.0f} mm back", (x["z"], x["w1"][1]),
                        textcoords="offset points", xytext=(-30, -14), fontsize=7)
    ax.plot(zs, [x["width_analytic"] for x in rows], ":", color="0.3", label="(m + tool) g sole / grip height")
    ax.axhspan(25, 50, color="0.85", label="press window at firing (25-50 N)")
    ax.set_title(f"{n.upper()}: press range the stance balances (dy 0)", fontsize=10)
    ax.set_xlabel("hand height of the pose (m)")
    ax.set_ylim(0, 160)
axes[0].set_ylabel("press (N)")
axes[1].legend(fontsize=7, loc="upper right")
fig.tight_layout()
fig.savefig(os.path.join(HERE, "figure.png"), dpi=110)
print("wrote figure.png")
