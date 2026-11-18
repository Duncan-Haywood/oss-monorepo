"""Figure for milestone 44: python experiments/m44_legpreload/figure.py (reads results.json)."""
import json
import os

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
R = json.load(open(os.path.join(HERE, "results.json")))
D = sorted(R["D"], key=lambda x: x["H"])
H = [x["H"] for x in D]
other = [x["worst"]["other"]["y"] for x in D]
two = [x["worst"]["two"]["y"] if x["worst"]["two"] else np.nan for x in D]
x = np.arange(len(H))
w = 0.38
fig, ax = plt.subplots(figsize=(7.5, 4.4))
ax.bar(x - w / 2, other, w, color="C0", label="the other 17 H1 poses (leg preload 0.1 N m; milestone 41)")
ax.bar(x + w / 2, two, w, color="C3", label="(1.4, -0.15) and (1.6, 0) re-planned (preload 0.030 and 0.085 N m)")
for i, (a, b) in enumerate(zip(other, two)):
    ax.text(x[i] - w / 2, a, f"{a:.3f}", ha="center", va="bottom", fontsize=8)
    ax.text(x[i] + w / 2, b, f"{b:.3f}", ha="center", va="bottom", fontsize=8)
ax.axhline(0.03, color="0.4", ls="--", lw=1)
ax.text(0.5, 0.034, "H174 bound at 5 N (0.03 mm)", ha="center", fontsize=8, color="0.3")
ax.set_xticks(x, [f"hose drag {h:g} N" for h in H])
ax.set_ylabel("worst residual along the wall (mm)")
ax.set_title("H1, zero-press lean, 'braked' waist, |e| 0.2 N, squeeze up to 10 N", fontsize=10)
ax.legend(fontsize=8, loc="upper left")
fig.tight_layout()
fig.savefig(os.path.join(HERE, "figure.png"), dpi=110)
print("wrote figure.png")
