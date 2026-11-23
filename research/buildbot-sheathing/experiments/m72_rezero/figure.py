"""Figure for milestone 72: python experiments/m72_rezero/figure.py (reads results.json).

Re-zeros per 1,000 sheets against the drift rate, per policy, lateral offset zero, G1 left and H1 right."""
import json
import os

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
D = json.load(open(os.path.join(HERE, "results.json")))
POL = (("FIX", "clock (weakest table pose)", "k", "--"), ("LAYOUT", "layout order, greedy", "C0", "-"),
       ("BANDS k+0", "lift offset chosen, same stops", "C2", "-"), ("BANDS k+1", "offset chosen, one more stop", "C1", ":"),
       ("BEST", "every nail at the best pose", "C3", "-"))
fig, axes = plt.subplots(1, 2, figsize=(10.5, 4.2), sharey=True)
for ax, n in zip(axes, ("g1", "h1")):
    rows = D["big"][n]
    rates = sorted(rows, key=float)
    for key, lab, col, ls in POL:
        ax.plot([float(r) for r in rates], [max(rows[r][key], 0.5) for r in rates], color=col, ls=ls, marker="o", ms=3,
                label=lab)
    ax.set_xscale("log")
    ax.set_yscale("log")
    ax.set_xlabel("bias drift rate, N/h (swept)")
    ax.set_title(f"{n.upper()}: re-zeros per 1,000 sheets")
    ax.grid(alpha=0.3, which="both")
axes[0].set_ylabel("re-zeros (0 drawn at 0.5)")
axes[0].legend(fontsize=8)
fig.tight_layout()
fig.savefig(os.path.join(HERE, "figure.png"), dpi=130)
