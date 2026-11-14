"""Figure for milestone 16: python experiments/m16_soft_nails/figure.py (reads results.json and
../m14_escaped/results.json)."""
import json
import os

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
R = json.load(open(os.path.join(HERE, "results.json")))
M14 = json.load(open(os.path.join(HERE, "..", "m14_escaped", "results.json")))

fig, (a, b) = plt.subplots(1, 2, figsize=(11, 4.8))
d = np.array(R["curves"]["drift_mm"])
base = np.array(R["curves"]["base"])
a.plot(d, base[0], color="C0", lw=2, label="intact sheet, softening nails")
a.plot(d, base[1], color="C3", lw=2, label="every nail below 12 in omitted")
loss = R["C"]["monotonic|12"]["loss"]
a.text(75, base[1].max() * 0.62, f"peak lost: {loss:.1%}\n(rigid-plastic: {M14['B']['z < 12 in']['loss']:.1%})",
       fontsize=8, color="C3")
a.axhline(base[0].max() * 0.5, color="k", lw=0.8, ls=":")
a.text(2, base[0].max() * 0.5 + 0.2, "half the intact peak (Weiss 2017's walls)", fontsize=7)
a.set_xlabel("top-plate drift (mm), 8 ft sheet")
a.set_ylabel("racking load (kN), one 4x8 sheet")
a.set_title("Tested 8d nail backbone (Shameli Derakshan et al. 2019), dp 12 mm", fontsize=10)
a.legend(fontsize=8, loc="lower right")
a.grid(alpha=0.3)

for dk, mk in (("monotonic", "o"), ("cyclic", "s")):
    keys = [k for k in R["C"] if k.startswith(dk + "|")]
    dps = [float(k.split("|")[1]) for k in keys]
    b.plot(dps, [R["C"][k]["loss"] * 100 for k in keys], marker=mk, lw=1.6, label=f"{dk} du, z < 12 in omitted")
    b.plot(dps, [R["C"][k]["loss_le"] * 100 for k in keys], marker=mk, lw=1, ls="--",
           label=f"{dk} du, z <= 12 in omitted")
b.axhspan(40, 60, color="C3", alpha=0.10)
b.text(6.2, 50, "Weiss (2017): \"close to or more than half\"", fontsize=8, va="center")
b.axhline(R["G"]["brittle_loss"] * 100, color="grey", lw=1, ls=":")
b.text(6.2, R["G"]["brittle_loss"] * 100 + 1.5, "near-brittle nail (0.8 Fp 1 mm past the peak)", fontsize=7,
       color="grey")
b.set_ylim(0, 65)
b.set_xlabel("nail slip at peak load, dp (mm; not tabulated, swept)")
b.set_ylabel("sheet peak lost (%)")
b.set_title("Softening does not move the loss toward Weiss's", fontsize=10)
b.legend(fontsize=7, loc="lower right")
b.grid(alpha=0.3)

fig.tight_layout()
fig.savefig(os.path.join(HERE, "figure.png"), dpi=130)
print("wrote figure.png")
