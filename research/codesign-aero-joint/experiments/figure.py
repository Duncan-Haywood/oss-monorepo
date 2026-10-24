"""Held-out wide-plant RMS error of each seed's winner, for joint CMA-ES and random search at two budgets, against the
grid-then-tune reference. Reads results.json; writes seeds.png."""
import json, os
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

HERE = os.path.dirname(os.path.abspath(__file__))
R = json.load(open(os.path.join(HERE, "results.json")))
keys = [("cma|960", "CMA-ES\n960 evals"), ("random|960", "random\n960"), ("cma|4800", "CMA-ES\n4800"), ("random|4800", "random\n4800")]
fig, ax = plt.subplots(figsize=(6, 4.2))
for i, (k, _) in enumerate(keys):
    ys = [o["heldout"] for o in R[k]]
    ax.scatter([i + (j - 3.5) * 0.04 for j in range(len(ys))], ys, s=22, color="#2f6fb0" if "cma" in k else "#c0504d")
ax.axhline(R["grid_wide_best"], color="k", ls=":", lw=1, label="grid-then-tune best cell (4800 evals; picked on held-out set)")
ax.axhline(R["grid_wide_median"], color="gray", ls="--", lw=1, label="grid-then-tune median cell")
ax.set_xticks(range(4)); ax.set_xticklabels([l for _, l in keys], fontsize=8)
ax.set_ylabel("held-out RMS roll error, wide plant (deg)"); ax.set_ylim(5.4, 8.0)
ax.set_title("Joint search winners, 8 seeds each", fontsize=9); ax.legend(fontsize=7); fig.tight_layout()
fig.savefig(os.path.join(HERE, "seeds.png"), dpi=130)
