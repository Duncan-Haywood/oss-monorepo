"""Figure for milestone 59: python experiments/m59_depth/figure.py (reads results.json)."""
import json
import os

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
D = json.load(open(os.path.join(HERE, "results.json")))
SPEC = D["spec_mm"]
AX = ("y", "z", "yd", "zd")
LAB = {"y": "nose y\n(along)", "z": "nose z\n(across)", "yd": "depth point y", "zd": "depth point z"}
x = np.arange(len(AX))
fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(11, 4.4), gridspec_kw={"width_ratios": [2.2, 1]})
k = 0
for n, c in (("g1", "C0"), ("h1", "C3")):
    for cfg, alpha, hatch in (("two-row", 0.45, "//"), ("four-row", 1.0, None)):
        w = [D["S"][f"{n} {cfg}"]["w" + a] for a in AX]
        ax1.bar(x - 0.3 + 0.2 * k, w, 0.18, color=c, alpha=alpha, hatch=hatch, label=f"{n.upper()} {cfg}")
        k += 1
ax1.axhline(SPEC, color="k", lw=0.8, ls=":", label=f"spec {SPEC} mm")
ax1.set_xticks(x, [LAB[a] for a in AX], fontsize=8)
ax1.set_ylabel("worst residual of a planned press (mm)")
ax1.set_title(f"Nose and depth point ({D['depth_mm']:.1f} mm along the nail), held-out seed {D['seed']}",
              fontsize=10)
ax1.legend(fontsize=7, ncol=2)
cfgs = list(D["configs"])
for n, c in (("g1", "C0"), ("h1", "C3")):
    cov = [D["S"][f"{n} {cfg}"]["cov"] for cfg in cfgs]
    ax2.plot(range(len(cfgs)), cov, "o-", color=c, label=n.upper())
    for xi, v in enumerate(cov):
        ax2.annotate(f"{v:.2f}%", (xi, v), textcoords="offset points", xytext=(4, 4 if n == "h1" else -12),
                     fontsize=7, color=c)
ax2.set_xticks(range(len(cfgs)), cfgs, fontsize=8)
ax2.set_xlim(-0.5, len(cfgs) - 0.5)
ax2.set_ylabel("in-envelope pose-cases planned (%)")
ax2.set_title("Coverage under each bound", fontsize=10)
ax2.legend(fontsize=7)
fig.tight_layout()
fig.savefig(os.path.join(HERE, "figure.png"), dpi=110)
print("wrote figure.png")
