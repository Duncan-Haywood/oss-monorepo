"""Grouped bars of held-out RMS roll error per airframe for PID(96), MLP(96), MLP(960). Reads results.json; writes mlp.png."""
import json, os
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

HERE = os.path.dirname(os.path.abspath(__file__))
R = json.load(open(os.path.join(HERE, "results.json")))
fig, ax = plt.subplots(figsize=(7, 4))
x = np.arange(len(R["L"]))
for k, (name, c) in enumerate((("pid96", "#2f6fb0"), ("mlp96", "#c0504d"), ("mlp960", "#e0a030"))):
    v = np.array(R["res"][name])
    ax.bar(x + (k - 1) * 0.27, v.mean(1), 0.27, yerr=[v.mean(1) - v.min(1), v.max(1) - v.mean(1)], capsize=2, color=c,
           label={"pid96": "PID, 96 evaluations", "mlp96": "MLP, 96", "mlp960": "MLP, 960"}[name])
ax.set_xticks(x); ax.set_xticklabels([f"L {l:.2f}\nD {d:.2f}" for l, d in zip(R["L"], R["D"])], fontsize=8)
ax.set_ylabel("held-out RMS roll error, wide plant (deg)"); ax.set_title("Mean and min-max over 3 CMA-ES seeds", fontsize=9)
ax.legend(fontsize=8); fig.tight_layout(); fig.savefig(os.path.join(HERE, "mlp.png"), dpi=130)
