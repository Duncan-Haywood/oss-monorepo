"""Figure for milestone 75: python experiments/m75_riskopt/figure.py (reads results.json).

Re-zeros per 100 sheets at a 1% wall risk under a random-walk bias, against the hour's drift magnitude D1: one
uniform per-press risk (milestone 73's CAL, dotted) against the optimal schedule (solid), per pose plan; G1 left,
H1 right."""
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
        opt = [max(R["rows"][f"{n}|{plan}|{d}"]["OPT"][0], 0.5) for d in d1]
        cal = [max(R["rows"][f"{n}|{plan}|{d}"]["CAL"][0], 0.5) for d in d1]
        ax.plot(d1, opt, color=col, marker="o", ms=3, label=f"{plan}: optimal schedule")
        ax.plot(d1, cal, color=col, ls=":", marker="x", ms=3, label=f"{plan}: one per-press risk (m73)")
    ax.set_xscale("log")
    ax.set_yscale("log")
    ax.set_xlabel("bias drift over 1 h, N (swept; random walk)")
    ax.set_title(f"{n.upper()}: re-zeros per 100 sheets at 1% wall risk")
    ax.grid(alpha=0.3, which="both")
axes[0].set_ylabel("re-zeros (0 drawn at 0.5)")
axes[0].legend(fontsize=7)
fig.tight_layout()
fig.savefig(os.path.join(HERE, "figure.png"), dpi=130)
