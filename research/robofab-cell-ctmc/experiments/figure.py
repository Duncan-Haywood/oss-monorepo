"""Draw error.png (predictor error against the exact Markov chain, and the effect of print variability)
from the committed results.json only.

    python experiments/figure.py
"""
import json, os
import matplotlib; matplotlib.use("Agg")
import matplotlib.pyplot as plt
here = os.path.dirname(os.path.abspath(__file__)); r = json.load(open(os.path.join(here, "results.json")))["mae"]
preds = ["plain", "held", "bound", "bound_h", "exp_vs_k"]
labs = ["plain MVA", "held MVA", "bound", "bound-h", "exact: exp.\nvs Erlang-k"]
sets = [("N < 2P (not saturated)", "work in process < 2P"), ("N = 2P (saturated)", "work in process = 2P")]
fig, ax = plt.subplots(figsize=(6.6, 4))
w = 0.38
for i, (k, lab) in enumerate(sets):
    ax.bar([j + (i - .5) * w for j in range(len(preds))], [r[k][p] for p in preds], w, label=lab)
ax.set_xticks(range(len(preds))); ax.set_xticklabels(labs, fontsize=8)
ax.set_ylabel("mean |error| vs exact Markov chain (%)")
ax.set_title("robofab-cell-ctmc: structure matters, print variability does not", fontsize=9)
ax.legend(fontsize=7); ax.grid(alpha=.3, axis="y")
fig.tight_layout(); fig.savefig(os.path.join(here, "error.png"), dpi=130)
print("wrote", os.path.join(here, "error.png"))
