"""Figure for milestone 57: python experiments/m57_beta/figure.py (reads results.json)."""
import json
import os

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
D = json.load(open(os.path.join(HERE, "results.json")))
SPEC = D["spec_mm"]
betas = D["betas"]
fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(11, 4.4))
for n, c in (("g1", "C0"), ("h1", "C3")):
    cov = [D["S"][f"{n} {b}"]["cov"] for b in betas]
    w = [D["S"][f"{n} {b}"]["w"] for b in betas]
    z = [D["S"][f"{n} {b}"]["zw"] for b in betas]
    ax1.plot(w, cov, "o-", color=c, label=n.upper())
    pts = {}
    for b, x, y in zip(betas, w, cov):
        pts.setdefault((round(x, 6), round(y, 4)), []).append(f"{b:g}")
    for (x, y), bs in pts.items():
        ax1.annotate("beta " + ", ".join(bs), (x, y), textcoords="offset points", xytext=(4, -10), fontsize=7,
                     color=c)
    ax2.plot(betas, w, "o-", color=c, label=f"{n.upper()} along the wall (y)")
    ax2.plot(betas, z, "s--", color=c, alpha=0.6, label=f"{n.upper()} across the wall (z)")
ax1.axvline(SPEC, color="k", lw=0.8, ls=":", label=f"spec {SPEC} mm")
ax1.set_xlabel("worst |y| of a planned press (mm)")
ax1.set_ylabel("in-envelope pose-cases planned (%)")
ax1.set_title("Coverage against worst residual, labelled by beta (held-out seed 57)", fontsize=10)
ax1.legend(fontsize=7, loc="lower right")
ax2.plot(betas, [b * SPEC for b in betas], color="C2", lw=1, ls=":", label="flip budget beta x spec")
ax2.axhline(SPEC, color="k", lw=0.8, ls=":")
ax2.set_yscale("log")
ax2.set_xlabel("budget share beta")
ax2.set_ylabel("worst residual of a planned press (mm)")
ax2.set_title("Only y is budgeted; z is not", fontsize=10)
ax2.legend(fontsize=6, loc="upper left")
fig.tight_layout()
fig.savefig(os.path.join(HERE, "figure.png"), dpi=110)
print("wrote figure.png")
