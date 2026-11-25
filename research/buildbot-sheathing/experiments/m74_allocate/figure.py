"""Figure for milestone 74: python experiments/m74_allocate/figure.py (reads results.json).

Re-zeros per 100 sheets against the hour's drift magnitude D1 under a random-walk bias, LAYOUT and BANDS k+0 plans:
milestone 73's uniform calibrated level (CAL), the per-press allocation calibrated by Monte Carlo (DPC), and the lower
bound on any schedule with 1% wall risk (LB); G1 left, H1 right."""
import json
import os

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
R = json.load(open(os.path.join(HERE, "results.json")))["rows"]
D1 = (0.02, 0.05, 0.1, 0.2)
PLANS = (("LAYOUT", "C0"), ("BANDS k+0", "C2"))
fig, axes = plt.subplots(1, 2, figsize=(10.5, 4.2), sharey=True)
for ax, n in zip(axes, ("g1", "h1")):
    for plan, col in PLANS:
        row = lambda k: [max(R[f"{n}|{plan}|RW|{d}"][k], 0.5) for d in D1]
        ax.plot(D1, row("CAL"), color=col, ls=":", marker="x", ms=4, label=f"{plan}: uniform level (CAL, m73)")
        ax.plot(D1, row("DPC"), color=col, marker="o", ms=3, label=f"{plan}: per-press allocation (DPC)")
        ax.fill_between(D1, row("LB"), row("DPC"), color=col, alpha=0.15)
        ax.plot(D1, row("LB"), color=col, ls="--", lw=0.8, label=f"{plan}: lower bound, any schedule (LB)")
    ax.set_xscale("log")
    ax.set_yscale("log")
    ax.set_xlabel("bias drift over 1 h, N (swept; random walk)")
    ax.set_title(f"{n.upper()}: re-zeros per 100 sheets at 1% wall risk")
    ax.grid(alpha=0.3, which="both")
axes[0].set_ylabel("re-zeros (0 drawn at 0.5)")
axes[0].legend(fontsize=7)
fig.tight_layout()
fig.savefig(os.path.join(HERE, "figure.png"), dpi=130)
