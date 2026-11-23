"""Figure for milestone 73: python experiments/m73_randomwalk/figure.py (reads results.json).

Re-zeros per 100 sheets against the hour's drift magnitude D1, under a random-walk bias: the linear schedule
(which fails the wall) against the calibrated chance-constrained one, per pose plan; G1 left, H1 right."""
import json
import os

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
R = json.load(open(os.path.join(HERE, "results.json")))
PLANS = (("LAYOUT", "C0"), ("BANDS k+0", "C2"), ("BEST", "C3"))
fig, axes = plt.subplots(1, 2, figsize=(10.5, 4.2), sharey=True)
for ax, n in zip(axes, ("g1", "h1")):
    for plan, col in PLANS:
        d1 = R["d1"]
        cal = [max(R["rows"][f"{n}|{plan}|RW|{d}"]["CAL"][0], 0.5) for d in d1]
        lin = [max(R["rows"][f"{n}|{plan}|RW|{d}"]["LINS"][0], 0.5) for d in d1]
        ax.plot(d1, cal, color=col, marker="o", ms=3, label=f"{plan}: chance-constrained (1% wall risk)")
        ax.plot(d1, lin, color=col, ls=":", marker="x", ms=3, label=f"{plan}: linear schedule")
    ax.set_xscale("log")
    ax.set_yscale("log")
    ax.set_xlabel("bias drift over 1 h, N (swept; random walk)")
    ax.set_title(f"{n.upper()}: re-zeros per 100 sheets")
    ax.grid(alpha=0.3, which="both")
axes[0].set_ylabel("re-zeros (0 drawn at 0.5)")
axes[0].legend(fontsize=7)
fig.tight_layout()
fig.savefig(os.path.join(HERE, "figure.png"), dpi=130)
