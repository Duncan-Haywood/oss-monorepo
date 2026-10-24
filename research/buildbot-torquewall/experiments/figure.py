"""Figure: heaviest payload with any feasible carry step, per scaled joint group."""
import json
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

HERE = Path(__file__).resolve().parent
o = json.loads((HERE / "results.json").read_text())
fig, axs = plt.subplots(1, 2, figsize=(10, 3.8))
for ax, (n, ms) in zip(axs, o["payloads"].items()):
    labels, vals = [], []
    for g, f in o["configs"]:
        feas = [m for m in ms if any(r["ok"] for r in o["rows"] if r["robot"] == n and r["mass"] == m and r["group"] == g and r["f"] == f)]
        labels.append("stock" if f == 1.0 else f"{g} x{f:g}")
        vals.append(max(feas, default=0))
    ax.bar(range(len(vals)), vals, color=["#555" if v == vals[0] else "#2a7" for v in vals])
    ax.set_xticks(range(len(vals))); ax.set_xticklabels(labels, rotation=60, ha="right", fontsize=7)
    ax.set_title(n.upper()); ax.set_ylabel("heaviest payload with a feasible step (kg, grid)")
fig.tight_layout(); fig.savefig(HERE / "figure.png", dpi=110)
