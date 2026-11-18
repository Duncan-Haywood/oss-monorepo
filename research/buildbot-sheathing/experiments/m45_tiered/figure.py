"""Figure for milestone 45: python experiments/m45_tiered/figure.py (reads results.json and m44's)."""
import json
import os

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
R = json.load(open(os.path.join(HERE, "results.json")))
R44 = json.load(open(os.path.join(HERE, "..", "m44_legpreload", "results.json")))
A = {tuple(a["pose"]): a for a in R["A"]}
a = A[(1.4, -0.15)]
fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(10, 4.2), gridspec_kw={"width_ratios": [1, 1.3]})
labels = ["common margin\n(milestone 44)", "hold-set rows\nalone (T_H)", "other leg rows\ngiven m_H (T_L)"]
vals = [a["t_min"], a["T_H"], a["T_L"]]
ax1.bar(range(3), vals, color=["C0", "C3", "C2"])
for i, v in enumerate(vals):
    ax1.text(i, v, f"{v:.4f}", ha="center", va="bottom", fontsize=8)
ax1.axhline(0.0326, color="0.3", ls="--", lw=1)
ax1.text(1, 0.045, "shift from a 0.2 N\nsensor error, 0.033", ha="center", fontsize=8, color="0.3")
ax1.set_xticks(range(3), labels, fontsize=8)
ax1.set_ylabel("largest margin the stance allows (N m)")
ax1.set_title("H1 (1.4 m, -0.15 m): where the margin is", fontsize=10)
D = sorted(R["D"], key=lambda x: x["H"])
D44 = sorted(R44["D"], key=lambda x: x["H"])
H = [x["H"] for x in D]
k = str([1.4, -0.15])
t45 = [x["worst"][k]["y"] for x in D]
t44 = [x["worst"]["two"]["y"] for x in D44]
oth = [x["worst"]["other"]["y"] for x in D]
x = np.arange(len(H))
w = 0.27
for off, ys, c, lab in ((-w, oth, "C0", "other 17 H1 poses"), (0, t44, "C1", "two poses, common preload (m44)"),
                        (w, t45, "C3", "(1.4, -0.15), hold-first tiers (m45)")):
    ax2.bar(x + off, ys, w, color=c, label=lab)
    for i, v in enumerate(ys):
        ax2.text(x[i] + off, v, f"{v:.3f}", ha="center", va="bottom", fontsize=7)
ax2.axhline(0.03, color="0.4", ls="--", lw=1)
ax2.set_xticks(x, [f"hose drag {h:g} N" for h in H])
ax2.set_ylabel("worst residual along the wall (mm)")
ax2.set_title("'braked', |e| 0.2 N, squeeze up to 10 N", fontsize=10)
ax2.legend(fontsize=7, loc="upper left")
fig.tight_layout()
fig.savefig(os.path.join(HERE, "figure.png"), dpi=110)
print("wrote figure.png")
