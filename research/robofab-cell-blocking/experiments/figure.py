"""Draw error.png (mean absolute prediction error by predictor) from the committed results.json only.

    python experiments/figure.py
"""
import json, os
import matplotlib; matplotlib.use("Agg")
import matplotlib.pyplot as plt
here = os.path.dirname(os.path.abspath(__file__)); r = json.load(open(os.path.join(here, "results.json")))
preds = ["plain", "held", "block_prio", "block_mva", "split"]
sets = [("mean_abs_err_pct_saturated", "saturated (8 rows)"), ("mean_abs_err_pct_other", "other (24 rows)"),
        ("mean_abs_err_pct_heldout", "held-out mix (12 rows)")]
fig, ax = plt.subplots(figsize=(6.8, 4))
w = 0.26
for i, (k, lab) in enumerate(sets):
    ax.bar([j + (i - 1) * w for j in range(len(preds))], [r[k][p] for p in preds], w, label=lab)
ax.set_xticks(range(len(preds))); ax.set_xticklabels(["plain MVA", "held MVA", "held +\nstall (prio)", "held +\nstall (MVA)", "split"], fontsize=8)
ax.set_ylabel("mean |error| vs simulation (%)")
ax.set_title("robofab-cell-blocking: predictor error", fontsize=9); ax.legend(fontsize=7); ax.grid(alpha=.3, axis="y")
fig.tight_layout(); fig.savefig(os.path.join(here, "error.png"), dpi=130)
print("wrote", os.path.join(here, "error.png"))
