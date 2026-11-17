"""Figure for milestone 7e: (left) per design, the attitude ki as a multiple of its own linear ceiling (1/ceil) against held-out J
at lever 0, constrained and unconstrained training; (right) held-out episodes that diverged at each lever, summed over six seeds.
Reads results.json."""
import json, os
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

HERE = os.path.dirname(os.path.abspath(__file__))
R = json.load(open(os.path.join(HERE, "results.json")))
runs, levers = R["runs"], R["levers"]
STY = {("above", "unconstrained"): ("s", "#1f77b4"), ("above", "constrained"): ("s", "#aec7e8"),
       ("below", "unconstrained"): ("o", "#d62728"), ("below", "constrained"): ("o", "#ff9896")}
fig, ax = plt.subplots(1, 2, figsize=(11, 4.3))
for (g, lab), (mk, col) in STY.items():
    rs = [r for r in runs if r["geom"] == g and r["label"] == lab]
    ax[0].scatter([1.0 / max(r["ceil"], 1e-3) for r in rs], [r["J_0"] for r in rs], marker=mk, c=col, s=45, label=f"{g}, {lab}", edgecolors="k", linewidths=0.4)
ax[0].axvline(1.0, color="k", lw=0.8, ls="--", label="on the ceiling")
ax[0].axvline(0.8, color="#2ca02c", lw=0.8, ls=":", label="0.8x (the constraint)")
ax[0].set_xscale("log")
ax[0].set_xlabel("ki as a multiple of its linear ceiling (log)")
ax[0].set_ylabel("held-out J at lever 0 (higher is better)")
ax[0].set_title("Where each trained design sits")
ax[0].legend(fontsize=7)
w = 0.2
for i, (key, (mk, col)) in enumerate(STY.items()):
    g, lab = key
    rs = [r for r in runs if r["geom"] == g and r["label"] == lab]
    n = [sum(int(round(r[f"dead_{l:g}"] * 64)) for r in rs) for l in levers]
    ax[1].bar(np.arange(len(levers)) + (i - 1.5) * w, n, w, color=col, edgecolor="k", lw=0.4, label=f"{g}, {lab}")
ax[1].set_xticks(range(len(levers)), [f"lever {l:g}" for l in levers])
ax[1].set_ylabel("held-out episodes diverged (of 384 per bar)")
ax[1].set_title("Divergence on held-out episodes")
ax[1].legend(fontsize=7)
fig.tight_layout()
fig.savefig(os.path.join(HERE, "m7e_margin.png"), dpi=130)
print("wrote m7e_margin.png")
