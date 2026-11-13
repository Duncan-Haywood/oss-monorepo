"""Figure for milestone 14: python experiments/m14_escaped/figure.py (reads results.json)."""
import json
import os

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
R = json.load(open(os.path.join(HERE, "results.json")))

fig, (a, b) = plt.subplots(1, 2, figsize=(11, 5.2), gridspec_kw={"width_ratios": [1.6, 1]})
Q = R["cap_quantiles"]
q = np.array(Q["q"]) / 100
for lab, col in (("single 2x, three reads", "C0"), ("single 2x, full stack", "C2"),
                 ("doubled joints, single read", "C3"), ("single 2x, three reads, 4 in joint edges", "C1")):
    a.plot(Q[lab], q, color=col, lw=2, label=lab, drawstyle="steps-post")
a.axvline(1.0, color="k", lw=0.8, ls=":")
a.text(1.003, 0.03, "intact sheet,\n6 in edges", fontsize=8)
a.set_xlabel("racking capacity with every miss left in, relative to the intact 6 in sheet")
a.set_ylabel("fraction of sheets at or below")
a.set_xlim(0.84, 1.34)
a.set_title("Escaped missed nails, measured studs, 20,000 sheets", fontsize=10)
a.legend(fontsize=8, loc="upper left")
a.grid(alpha=0.3)

xz = np.array(R["layout"]["xz_in"])
loss = np.array(R["layout"]["single_loss"]) * 100
sc = b.scatter(xz[:, 0], xz[:, 1], c=loss, cmap="viridis", s=40, edgecolors="k", linewidths=0.4)
b.plot([0, 48, 48, 0, 0], [0, 0, 96, 96, 0], "k-", lw=0.8)
for x in (16, 32):
    b.plot([x, x], [0, 96], color="0.7", lw=0.6, zorder=0)
b.set_aspect("equal")
b.set_xlim(-6, 54)
b.set_xlabel("x along the sheet (in)")
b.set_ylabel("height (in)")
b.set_title("Capacity lost if this one nail misses (%)", fontsize=10)
fig.colorbar(sc, ax=b, fraction=0.05)
fig.tight_layout()
fig.savefig(os.path.join(HERE, "figure.png"), dpi=130)
