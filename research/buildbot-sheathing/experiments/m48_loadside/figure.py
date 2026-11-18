"""Figure for milestone 48: python experiments/m48_loadside/figure.py (reads results.json, m41's and m47's)."""
import json
import os

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
R = json.load(open(os.path.join(HERE, "results.json")))
R41 = json.load(open(os.path.join(HERE, "..", "m41_stance0", "results.json")))
R47 = json.load(open(os.path.join(HERE, "..", "m47_poseside", "results.json")))
fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(11, 4.4), gridspec_kw={"width_ratios": [1.5, 1]})
A = R["A"]
x = np.arange(len(A))
nz = lambda v: np.nan if v is None else v  # noqa: E731
for vals, c, mk, lab in (([nz(a["ml_robot"]) for a in A], "C1", "o", "one side per robot (milestones 32-46)"),
                         ([nz(a["ml_star"]) for a in A], "C3", "^", "S*: best at zero drag (milestone 47)"),
                         ([nz(a["ml_h"]) for a in A], "C2", "s", "S_H: best over the hose sweep (this milestone)")):
    ax1.scatter(x, vals, color=c, marker=mk, s=18, label=lab, zorder=3)
none = [i for i, a in enumerate(A) if a["ml_h"] is None]
ax1.scatter(none, [0.04] * len(none), color="0.35", marker="x", s=22, zorder=3,
            label="no side holds at every load (keeps milestone 46's)")
ax1.axhline(R["goal"], color="0.3", ls="--", lw=1)
ax1.text(0.5, R["goal"] * 1.15, "0.1/0.9 N m: the spec's preload fits", fontsize=7, color="0.3")
ax1.set_yscale("log")
ax1.set_xticks(x, [f"{a['robot'].upper()} {a['pose'][0]:g},{a['pose'][1]:+g}" for a in A], rotation=90, fontsize=6)
ax1.set_ylabel("worst common leg margin over 17 hose loads (N m, log)")
ax1.set_title("Hold sides scored under hose drag", fontsize=10)
ax1.legend(fontsize=7, loc="lower left")
D = {(d["robot"], d["H"]): d["worst"]["all"]["y"] for d in R["D"]}
D47 = {(d["robot"], d["H"]): d["worst"]["all"]["y"] for d in R47["D"]}
D41 = {(d["robot"], d["H"]): d["worst"]["all"]["y"] for d in R41["B"]}
Hs = sorted({d["H"] for d in R["D"]})
xx = np.arange(len(Hs))
w = 0.13
bars = (("g1", D41, "C1", "G1, one side (m41)"), ("g1", D47, "C3", "G1, S* (m47)"), ("g1", D, "C2", "G1, S_H"),
        ("h1", D47, "C3", "H1, S* (m47)"), ("h1", D, "C2", "H1, S_H"))
for j, (n, src, c, lab) in enumerate(bars):
    off = (j - 2) * w + (0.05 if n == "h1" else -0.05)
    ys = [src[(n, H)] for H in Hs]
    ax2.bar(xx + off, ys, w, color=c, label=lab, hatch="//" if n == "h1" else None, edgecolor="white")
    for i, v in enumerate(ys):
        ax2.text(xx[i] + off, v, f"{v:.3f}", ha="center", va="bottom", fontsize=5.5, rotation=90)
ax2.axhline(0.03, color="0.4", ls="--", lw=1)
ax2.text(-0.45, 0.031, "0.03 mm spec", fontsize=7, color="0.3")
ax2.set_xticks(xx, [f"hose drag {h:g} N" for h in Hs])
ax2.set_ylabel("worst residual along the wall (mm)")
ax2.set_title("'braked', |e| 0.2 N sensor error, squeeze up to 10 N", fontsize=10)
ax2.legend(fontsize=6.5, loc="upper left")
ax2.set_ylim(0, 0.055)
fig.tight_layout()
fig.savefig(os.path.join(HERE, "figure.png"), dpi=110)
print("wrote figure.png")
