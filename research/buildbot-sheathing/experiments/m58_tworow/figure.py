"""Figure for milestone 58: python experiments/m58_tworow/figure.py (reads results.json)."""
import json
import os

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
D = json.load(open(os.path.join(HERE, "results.json")))
SPEC = D["spec_mm"]
cfg = list(D["configs"])
lab = {"y-only": "y only\n(milestone 56)", "iso": "y and z\nz spec 0.03 mm", "loose": "y and z\nz spec 0.3 mm"}
x = np.arange(len(cfg))
fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(11, 4.4))
for i, (n, c) in enumerate((("g1", "C0"), ("h1", "C3"))):
    wy = [D["S"][f"{n} {k}"]["wy"] for k in cfg]
    wz = [D["S"][f"{n} {k}"]["wz"] for k in cfg]
    cov = [D["S"][f"{n} {k}"]["cov"] for k in cfg]
    off = -0.2 + 0.4 * i
    ax1.bar(x + off - 0.09, wy, 0.18, color=c, label=f"{n.upper()} worst |y| (along)")
    ax1.bar(x + off + 0.09, wz, 0.18, color=c, alpha=0.45, hatch="//", label=f"{n.upper()} worst |z| (across)")
    ax2.plot(x, cov, "o-", color=c, label=n.upper())
    for xi, v in zip(x, cov):
        ax2.annotate(f"{v:.2f}%", (xi, v), textcoords="offset points", xytext=(4, 4 if i else -12), fontsize=7,
                     color=c)
ax1.axhline(SPEC, color="k", lw=0.8, ls=":", label=f"{SPEC} mm")
ax1.axhline(0.3, color="k", lw=0.8, ls="--", label="0.3 mm")
ax1.set_yscale("log")
ax1.set_xticks(x, [lab[k] for k in cfg], fontsize=8)
ax1.set_ylabel("worst residual of a planned press (mm)")
ax1.set_title("Residual along and across the wall (held-out seed 58)", fontsize=10)
ax1.legend(fontsize=6, loc="upper right")
ax2.set_xticks(x, [lab[k] for k in cfg], fontsize=8)
ax2.set_ylabel("in-envelope pose-cases planned (%)")
ax2.set_title("Coverage under each bound", fontsize=10)
ax2.legend(fontsize=7)
fig.tight_layout()
fig.savefig(os.path.join(HERE, "figure.png"), dpi=110)
print("wrote figure.png")
