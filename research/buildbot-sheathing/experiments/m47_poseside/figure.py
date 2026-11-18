"""Figure for milestone 47: python experiments/m47_poseside/figure.py (reads results.json, m41's and m46's)."""
import json
import os

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
R = json.load(open(os.path.join(HERE, "results.json")))
R41 = json.load(open(os.path.join(HERE, "..", "m41_stance0", "results.json")))
R46 = json.load(open(os.path.join(HERE, "..", "m46_holdside", "results.json")))
fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(11, 4.4), gridspec_kw={"width_ratios": [1.5, 1]})
A = [a for a in R["A"] if not a["skipped"]]
x = np.arange(len(A))
m0 = [a["m_robot"] for a in A]
ms = [a["m_star"] for a in A]
ax1.scatter(x, m0, color="C1", s=18, label="one hold side per robot (milestones 32-46)", zorder=3)
ax1.scatter(x, ms, color="C2", s=18, marker="s", label="per-pose sides S* (this milestone)", zorder=3)
for i in range(len(A)):
    ax1.plot([i, i], [m0[i], ms[i]], color="0.7", lw=0.8, zorder=1)
ax1.axhline(R["goal"], color="0.3", ls="--", lw=1)
ax1.text(0.5, R["goal"] * 1.15, "0.1/0.9 N m: the spec's preload fits", fontsize=7, color="0.3")
ax1.set_yscale("log")
ax1.set_xticks(x, [f"{a['robot'].upper()} {a['pose'][0]:g},{a['pose'][1]:+g}" for a in A], rotation=90, fontsize=6)
ax1.set_ylabel("common leg margin the stance allows (N m, log)")
ax1.set_title("Hold sides chosen per pose: margin at every pose", fontsize=10)
ax1.legend(fontsize=7, loc="lower left")
HB = R46["H"] if "H" in R46 else [0.0, 5.0, 20.0]
D = {(d["robot"], d["H"]): d["worst"]["all"]["y"] for d in R["D"]}
base = {("h1", d["H"]): d["worst"]["all"]["y"] for d in R46["D"]}
base.update({("g1", x_["H"]): x_["worst"]["all"]["y"] for x_ in R41["B"] if x_["robot"] == "g1"})
Hs = sorted({d["H"] for d in R["D"]})
xx = np.arange(len(Hs))
w = 0.2
for off, n, src, c, lab in ((-1.5 * w, "h1", base, "C1", "H1, one side (m46)"), (-0.5 * w, "h1", D, "C2", "H1, S*"),
                            (0.5 * w, "g1", base, "C3", "G1, one side (m41)"), (1.5 * w, "g1", D, "C4", "G1, S*")):
    ys = [src[(n, H)] for H in Hs]
    ax2.bar(xx + off, ys, w, color=c, label=lab)
    for i, v in enumerate(ys):
        ax2.text(xx[i] + off, v, f"{v:.3f}", ha="center", va="bottom", fontsize=6)
ax2.axhline(0.03, color="0.4", ls="--", lw=1)
ax2.set_xticks(xx, [f"hose drag {h:g} N" for h in Hs])
ax2.set_ylabel("worst residual along the wall (mm)")
ax2.set_title("'braked', |e| 0.2 N sensor error, squeeze up to 10 N", fontsize=10)
ax2.legend(fontsize=7, loc="upper left")
ax2.set_ylim(0, 0.05)
fig.tight_layout()
fig.savefig(os.path.join(HERE, "figure.png"), dpi=110)
print("wrote figure.png")
