"""Draw error.png (error of each predictor against the exact chain, by work in process) from results.json only.

    python experiments/figure.py
"""
import json, os
import matplotlib; matplotlib.use("Agg")
import matplotlib.pyplot as plt
here = os.path.dirname(os.path.abspath(__file__)); r = json.load(open(os.path.join(here, "results.json")))["summary"]
groups = ["N = P", "N = P+2", "N = 2P"]
preds = [("fesc", "decomposition"), ("plain", "plain MVA"), ("held", "held MVA")]
fig, ax = plt.subplots(figsize=(6.6, 4)); w = 0.26
for i, (k, lab) in enumerate(preds):
    ax.bar([j + (i - 1) * w for j in range(3)], [r[g][k]["mean"] for g in groups], w, label=lab)
ax.set_xticks(range(3)); ax.set_xticklabels(["work in process = P", "P + 2", "2P"], fontsize=8)
ax.set_ylabel("mean |error| vs exact Markov chain (%)")
ax.set_title("robofab-cell-fesc: decomposition vs mean value analysis (42 settings)", fontsize=9)
ax.legend(fontsize=7); ax.grid(alpha=.3, axis="y")
fig.tight_layout(); fig.savefig(os.path.join(here, "error.png"), dpi=130)
print("wrote", os.path.join(here, "error.png"))
