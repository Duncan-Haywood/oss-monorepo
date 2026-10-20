"""Draw error.png (mean absolute prediction error by predictor) from the committed results.json only.

    python experiments/figure.py
"""
import json, os
import matplotlib; matplotlib.use("Agg")
import matplotlib.pyplot as plt
here = os.path.dirname(os.path.abspath(__file__)); r = json.load(open(os.path.join(here, "results.json")))
preds = ["plain", "held", "stall", "stall_full"]
sets = [("mean_abs_err_pct", "all rows"), ("mean_abs_err_pct_saturated", "saturated"), ("mean_abs_err_pct_other", "other")]
fig, ax = plt.subplots(figsize=(6.4, 4))
w = 0.26
for i, (k, lab) in enumerate(sets):
    xs = [j + (i - 1) * w for j in range(len(preds))]
    ax.bar(xs, [r[k][p] for p in preds], w, label=lab)
ax.set_xticks(range(len(preds))); ax.set_xticklabels(["plain MVA", "held MVA", "stall-aware", "stall (full)"])
ax.set_ylabel("mean |error| vs simulation (%)")
ax.set_title("robofab-cell-stall: predictor error", fontsize=9); ax.legend(fontsize=7); ax.grid(alpha=.3, axis="y")
fig.tight_layout(); fig.savefig(os.path.join(here, "error.png"), dpi=130)
print("wrote", os.path.join(here, "error.png"))
